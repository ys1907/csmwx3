// 纯业务逻辑：不依赖 wx / Page 实例，便于单元测试与复用
const { SCENE_OPTIONS, BUDGET_OPTIONS, TIME_OPTIONS, TASTE_OPTIONS } = require('../data/options.js')

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
// 转盘固定 8 个扇区，每扇 45°，emoji 居中偏移 22.5°
const WHEEL_SECTORS = 8
const SECTOR_DEG = 360 / WHEEL_SECTORS
const SECTOR_OFFSET = SECTOR_DEG / 2

// Fisher-Yates 洗牌，rng 可注入以便测试确定性
function shuffle(arr, rng) {
  const random = rng || Math.random
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 根据筛选条件过滤食物。ctx: { excludeRecent, history, now }
function filterFoods(foods, filters, ctx) {
  const { excludeRecent = false, history = [], now = Date.now() } = ctx || {}

  const recentNames = new Set()
  if (excludeRecent && history.length > 0) {
    history.forEach(h => {
      const d = new Date(h.date).getTime()
      if (!Number.isNaN(d) && (now - d) <= THREE_DAYS) recentNames.add(h.name)
    })
  }

  const avoidSet = new Set((filters.avoid || '').split(/[,，\s]+/).filter(Boolean))
  const sceneValue = SCENE_OPTIONS[filters.sceneIdx]
  const budgetValue = BUDGET_OPTIONS[filters.budgetIdx]
  const timeValue = TIME_OPTIONS[filters.timeIdx]
  const tasteValue = TASTE_OPTIONS[filters.tasteIdx]

  return foods.filter(f => {
    if (filters.sceneIdx > 0 && f.scene !== sceneValue) return false
    if (filters.budgetIdx > 0 && f.budget !== budgetValue) return false
    if (filters.timeIdx > 0 && f.time !== timeValue) return false
    if (filters.tasteIdx > 0 && !(f.tags || []).includes(tasteValue)) return false
    if (excludeRecent && recentNames.has(f.name)) return false
    if (avoidSet.size > 0) {
      const foodTags = new Set(f.tags || [])
      for (const a of avoidSet) if (foodTags.has(a)) return false
    }
    return true
  })
}

// 构造 8 格转盘池：不足 8 个时循环复用，保证每个扇区都有内容、落点不取到 undefined
function buildWheelPool(filtered, size, rng) {
  const n = size || WHEEL_SECTORS
  const shuffled = shuffle(filtered, rng)
  if (shuffled.length === 0) return []
  const pool = []
  for (let i = 0; i < n; i++) pool.push(shuffled[i % shuffled.length])
  return pool
}

// 先随机选中奖扇区，再算出让该扇区停到指针正上方所需的目标角度（mod 360）
// 给定中奖扇区，算出让它停到指针正上方所需的目标角度（mod 360）
// 不变量：(winnerIdx * SECTOR_DEG + SECTOR_OFFSET + angleForWinner(winnerIdx)) % 360 === 0
function angleForWinner(winnerIdx) {
  return (360 - (winnerIdx * SECTOR_DEG + SECTOR_OFFSET) + 360) % 360
}

function resolveWheelWinner(poolLen, rng) {
  const random = rng || Math.random
  const winnerIdx = Math.floor(random() * poolLen)
  return { winnerIdx, targetMod: angleForWinner(winnerIdx) }
}

// ========== 进化①：加权推荐（学自美团/大众点评「猜你喜欢」） ==========
// prefs: { favoriteSet:Set<name>, tasteCounts:{tag:count}, rejectedSet:Set<name> }
// 设计目标：在均匀随机之上叠加温和偏好信号，绝不把任何选项权重归零（保留惊喜）。
function foodWeight(food, prefs) {
  const p = prefs || {}
  let w = 1 // 基准权重，保证未知/新菜也有机会
  if (p.favoriteSet && p.favoriteSet.has(food.name)) w += 1.5 // 收藏强加成
  if (p.tasteCounts && food.tags) {
    let taste = 0
    for (const t of food.tags) taste += (p.tasteCounts[t] || 0)
    w += Math.min(taste * 0.15, 1.5) // 口味匹配温和加成，封顶防失衡
  }
  // 进化②：负反馈降权（学自抖音/Pandora「不感兴趣」）——本次会话刚拒绝的强力降权但不清零
  if (p.rejectedSet && p.rejectedSet.has(food.name)) w *= 0.15
  return w
}

// 加权随机取下标；prefs 为空时退化为均匀随机
function weightedPickIndex(pool, prefs, rng) {
  if (!pool || pool.length === 0) return -1
  const random = rng || Math.random
  const weights = pool.map(f => foodWeight(f, prefs))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return Math.floor(random() * pool.length)
  let r = random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return pool.length - 1
}

function weightedPick(pool, prefs, rng) {
  const idx = weightedPickIndex(pool, prefs, rng)
  return idx < 0 ? null : pool[idx]
}

// ========== 进化③：口味画像（学自 Spotify Wrapped 年度报告） ==========
// 把历史决策沉淀成可读洞察。history 仅存 {name,emoji,date}，需借 foods 反查 category/tags。
function buildTasteProfile(history, favorites, foods) {
  const nameIndex = new Map((foods || []).map(f => [f.name, f]))
  const catCount = {}
  const tagCount = {}
  let spicyCount = 0

  ;(history || []).forEach(h => {
    const f = nameIndex.get(h.name)
    if (!f) return
    if (f.category) catCount[f.category] = (catCount[f.category] || 0) + 1
    ;(f.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1 })
    if (f.tags && f.tags.includes('辣')) spicyCount++
  })

  const topN = (obj, n) => Object.keys(obj)
    .map(k => ({ name: k, count: obj[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)

  const total = (history || []).length
  const topCategories = topN(catCount, 3)
  const topTags = topN(tagCount, 3)
  const favoriteCount = (favorites || []).length

  let headline
  if (total === 0) {
    headline = '还没有记录，转一转开启你们的味觉档案吧'
  } else {
    const cat = topCategories[0]
    headline = `已为你们定下 ${total} 餐，最常吃「${cat ? cat.name : '各种美味'}」`
  }

  const spicyRatio = total > 0 ? spicyCount / total : 0
  return {
    total,
    topCategories,
    topTags,
    spicyCount,
    spicyRatio,
    spicyPercent: Math.round(spicyRatio * 100), // 便于 WXML 直接展示，无需在模板做运算
    favoriteCount,
    headline
  }
}

module.exports = {
  shuffle,
  filterFoods,
  buildWheelPool,
  resolveWheelWinner,
  angleForWinner,
  foodWeight,
  weightedPick,
  weightedPickIndex,
  buildTasteProfile,
  WHEEL_SECTORS,
  SECTOR_DEG,
  SECTOR_OFFSET
}
