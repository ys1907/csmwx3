// 纯业务逻辑：不依赖 wx / Page 实例，便于单元测试与复用
const { SCENE_OPTIONS, BUDGET_OPTIONS, TIME_OPTIONS, TASTE_OPTIONS } = require('../data/options.js')
const { shuffleArray } = require('./util.js')

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

// 三套场景词表的对齐桥：UI 选项（SCENE_OPTIONS）↔ 数据词表（f.scene / f.scenes 的取值、availability 的 key）。
// 数据治理后 scenes 数组用「到店吃」、availability 用「食堂」，与 UI 的「堂食」「公司食堂」措辞不同，
// 所有按场景的匹配必须经 sceneAliases 展开，否则会静默匹配不到。
const SCENE_ALIASES = {
  '外卖': ['外卖'],
  '堂食': ['堂食', '到店吃'],
  '自己做': ['自己做'],
  '公司食堂': ['公司食堂', '食堂'],
}

function sceneAliases(sceneValue) {
  return SCENE_ALIASES[sceneValue] || [sceneValue]
}

// 菜品是否匹配某个 UI 场景：优先看治理后的 scenes 数组（多渠道），缺失时回退顶层 scene（单值）。
// 数据缺口兜底：31 道菜的 scenes 漏标了渠道适配度为「高」的场景，按 availability 补回，避免整菜在该场景下消失。
function matchesScene(food, sceneValue) {
  const accepted = sceneAliases(sceneValue)
  if (Array.isArray(food.scenes) && food.scenes.length > 0) {
    if (food.scenes.some(s => accepted.includes(s))) return true
    return availabilityLevel(food, sceneValue) === '高'
  }
  return accepted.includes(food.scene)
}

// 取菜品在某个 UI 场景下的渠道适配度（'高'|'中'|'低'|'极低'），找不到返回 undefined
function availabilityLevel(food, sceneValue) {
  if (!food.availability) return undefined
  for (const key of sceneAliases(sceneValue)) {
    if (food.availability[key] !== undefined) return food.availability[key]
  }
  return undefined
}

// 标签同义对：数据治理产出「肉食/素食/酥脆/热食」，UI 选项（口味/避雷）用「肉/素/脆/热」，
// 按 tags 的匹配必须经此展开，否则避雷「脆/热」全库 0 命中、避「肉」拦不住只标「肉食」的菜。
const TAG_ALIASES = {
  '肉': ['肉', '肉食'],
  '素': ['素', '素食'],
  '脆': ['脆', '酥脆'],
  '热': ['热', '热食'],
}

// 菜品是否带某个 UI 标签（含同义展开；「辣」额外认 spicyLevel——少数辣菜只标了辣度没打 tag）
function foodHasTag(food, tag) {
  const accepted = TAG_ALIASES[tag] || [tag]
  const tags = food.tags || []
  if (accepted.some(t => tags.includes(t))) return true
  if (tag === '辣') return (food.spicyLevel || 0) > 0
  return false
}

// 根据筛选条件过滤食物。ctx: { excludeRecent, history, now }
function filterFoods(foods, filters, ctx) {
  const { excludeRecent = false, history = [], now = Date.now() } = ctx || {}
  foods = foods || []
  filters = filters || {}

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
    if (f.enabled === false) return false
    if (filters.sceneIdx > 0 && !matchesScene(f, sceneValue)) return false
    if (filters.budgetIdx > 0 && f.budget !== budgetValue) return false
    if (filters.timeIdx > 0 && f.time !== timeValue) return false
    if (filters.tasteIdx > 0 && !foodHasTag(f, tasteValue)) return false
    // NEW: 默认只推荐可作为完整一餐的菜品（严格模式）
    if (filters.requireMeal !== false && f.canBeMeal === false) return false
    // NEW: 时段过滤
    if (filters.mealPeriod && !(f.mealPeriods || []).includes(filters.mealPeriod)) return false
    // NEW: 粒度过滤（正餐模式只推荐完整餐食/单道菜/聚餐方式/餐厅品类）
    if (filters.itemLevel) {
      const mealLevels = ['完整餐食', '单道菜', '聚餐方式', '餐厅品类']
      if (filters.itemLevel === '正餐' && !mealLevels.includes(f.itemLevel)) return false
      if (filters.itemLevel !== '正餐' && f.itemLevel !== filters.itemLevel) return false
    }
    // NEW: 渠道过滤（根据当前场景，只保留渠道权重≥低的条目）
    if (filters.scene && f.availability) {
      const level = availabilityLevel(f, filters.scene)
      if (level === '极低' || level === '低') return false
    }
    if (excludeRecent && recentNames.has(f.name)) return false
    if (avoidSet.size > 0) {
      for (const a of avoidSet) if (foodHasTag(f, a)) return false
    }
    return true
  })
}

// ========== 进化①：加权推荐（学自美团/大众点评「猜你喜欢」） ==========
// prefs: { favoriteSet:Set<name>, tasteCounts:{tag:count}, rejectedSet:Set<name>, cooldownFamilyPicks:{familyId:timestamp} }
// ctx:   { scene, weatherTags, now }（now 可注入便于测试，缺省 Date.now()）
// 设计目标：在均匀随机之上叠加温和偏好信号，绝不把任何选项权重归零（保留惊喜）。
function foodWeight(food, prefs, ctx) {
  const p = prefs || {}
  let w = food.defaultPoolWeight ?? 1.0 // NEW: 基础池权重（全国常见 1.0 / 套餐变体 0.65 / 异国 0.30）
  if (w <= 0) w = 0.01 // 保底非零，保留惊喜

  if (p.favoriteSet && p.favoriteSet.has(food.name)) w += 1.5 // 收藏强加成
  if (p.tasteCounts && food.tags) {
    let taste = 0
    for (const t of food.tags) taste += (p.tasteCounts[t] || 0)
    w += Math.min(taste * 0.15, 1.5) // 口味匹配温和加成，封顶防失衡
  }
  // 进化②：负反馈降权——本次会话刚拒绝的强力降权但不清零
  if (p.rejectedSet && p.rejectedSet.has(food.name)) w *= 0.15

  // NEW: 冷却族降权（同类食物 3 天内抽中过 → 权重 ×0.2）
  if (p.cooldownFamilyPicks && food.cooldownFamilyId) {
    const lastPick = p.cooldownFamilyPicks[food.cooldownFamilyId]
    const nowTs = ctx?.now ?? Date.now()
    if (lastPick && (nowTs - lastPick) <= THREE_DAYS) {
      w *= 0.2
    }
  }

  // NEW: 渠道匹配（当前场景与菜品渠道适配度）
  if (ctx?.scene && food.availability) {
    const level = availabilityLevel(food, ctx.scene) // '高'|'中'|'低'|'极低'
    const multipliers = { '高': 1.2, '中': 1.0, '低': 0.6, '极低': 0.1 }
    w *= (multipliers[level] ?? 1.0)
  }

  // NEW: 天气匹配
  if (ctx?.weatherTags && food.weatherTags?.length > 0) {
    const match = food.weatherTags.some(t => ctx.weatherTags.includes(t))
    if (match) w *= 1.15
  }

  return Math.max(w, 0.01)
}

// 加权随机取下标；prefs 为空时退化为均匀随机
// NEW: 增加 ε-greedy 探索概率——10% 概率完全随机，防止信息茧房
function weightedPickIndex(pool, prefs, rng, ctx) {
  if (!pool || pool.length === 0) return -1
  const random = rng || Math.random
  // ε-greedy: 10% 概率完全随机探索
  if (random() < 0.10) {
    return Math.floor(random() * pool.length)
  }
  const weights = pool.map(f => foodWeight(f, prefs, ctx))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return Math.floor(random() * pool.length)
  let r = random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return pool.length - 1
}

function weightedPick(pool, prefs, rng, ctx) {
  const idx = weightedPickIndex(pool, prefs, rng, ctx)
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

// ========== 进化④：可解释推荐（结构化推荐理由） ==========
function buildRichReason(food, ctx) {
  if (!food) return ''
  const parts = []
  // 预算
  if (food.budget === '💰') parts.push('15元以内')
  else if (food.budget === '💰💰') parts.push('30元以内')
  else if (food.budget === '💰💰💰') parts.push('高预算')
  // 渠道
  if (ctx?.scene && food.availability) {
    const level = availabilityLevel(food, ctx.scene)
    if (level === '高') parts.push(`适合${ctx.scene}`)
  }
  // 辣度
  if (food.spicyLevel >= 2) parts.push(food.spicyLevel >= 3 ? '重辣' : '微辣')
  else if (food.dietWarnings?.includes('含辣')) parts.push('微辣')
  else parts.push('不辣')
  // 时间
  if (food.time === '快') parts.push('预计较快')
  else if (food.time === '慢') parts.push('适合慢慢吃')
  // 粒度
  if (food.itemLevel === '完整餐食') parts.push('完整一餐')
  else if (food.itemLevel === '单道菜') parts.push('家常小炒')
  // 个性化（兜底）
  return parts.join(' · ') || '换换口味，碰碰运气 🎲'
}

// ========== 进化⑤：决策连胜（学自微信运动 / Duolingo 的连续打卡） ==========
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// 从历史日期算出「当前连胜 / 最长连胜 / 今天是否已决定」。now 可注入便于测试。
function computeStreak(history, now) {
  const today = now ? new Date(now) : new Date()
  const days = new Set()
  ;(history || []).forEach(h => {
    const d = new Date(h.date)
    if (!Number.isNaN(d.getTime())) days.add(dayKey(d))
  })

  const decidedToday = days.has(dayKey(today))
  // 当前连胜：从今天（或昨天，给「还没决定但昨天决定过」留活口）向前数连续天数。
  // 日期游标用 setDate 按日历日推进而非减 24h 毫秒——夏令时地区某天是 23/25 小时，毫秒法会断链。
  let current = 0
  const cursor = new Date(today)
  if (!decidedToday) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dayKey(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  // 最长连胜：把所有去重日期排序，相邻日判定同样走日历日（setDate）而非毫秒差
  const sorted = Array.from(days).map(k => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(y, m, d)
  }).sort((a, b) => a - b)
  let longest = 0, run = 0, prev = null
  for (const dt of sorted) {
    if (prev !== null) {
      const next = new Date(prev)
      next.setDate(next.getDate() + 1)
      run = next.getTime() === dt.getTime() ? run + 1 : 1
    } else {
      run = 1
    }
    if (run > longest) longest = run
    prev = dt
  }

  return { current, longest, decidedToday }
}

// ========== 进化⑥：一键凑一桌（学自美团凑单 / 盒马「一桌好菜」） ==========
// 为「情侣一起点多道菜」场景，挑选品类尽量不重复的多样化组合。rng 可注入。
function buildMealCombo(foods, count, rng) {
  const n = count || 3
  const shuffled = shuffleArray(foods, rng)
  const picked = []
  const usedCat = new Set()
  // 第一轮：优先不同品类，保证一桌的多样性
  for (const f of shuffled) {
    if (picked.length >= n) break
    if (!usedCat.has(f.category)) { picked.push(f); usedCat.add(f.category) }
  }
  // 第二轮：品类不够时，用剩余菜补足数量
  if (picked.length < n) {
    for (const f of shuffled) {
      if (picked.length >= n) break
      if (!picked.includes(f)) picked.push(f)
    }
  }
  return picked
}

// ========== 季节弱信号：纯本地、零依赖（替代需联网的实时天气） ==========
// 由当前月份推断适配的 weatherTags，喂给 foodWeight 的天气匹配。now 可注入便于测试。
function inferSeason(now) {
  const month = (now ? new Date(now) : new Date()).getMonth() + 1 // 1..12
  if (month >= 6 && month <= 8) return ['炎热适合']
  if (month === 12 || month === 1 || month === 2) return ['降温适合']
  return [] // 春秋中性，不加权（「雨天适合」需实时天气，季节方案不触发）
}

// ========== 盲盒稀有度：纯概率，与菜无关 ==========
// 仅决定揭晓动画档位；rng 可注入便于测试。
// 伪概率（保底）抽稀有度：基础 R88 / SR11 / SSR1。
// SSR 每未中一次概率 +1%，封顶 16%；累计 25 抽硬保底必出；中 SSR 后计数清零。
// ssrPity = 自上次 SSR 后的累计抽数（持久化于本地缓存）。返回 { rarity, ssrPity:新计数 }。
function rollRarityWithPity(ssrPity, rng) {
  const random = rng || Math.random
  const pity = ssrPity || 0
  let rarity
  if (pity + 1 >= 25) {
    rarity = 'SSR'                                  // 硬保底：累计第 25 抽必出
  } else {
    const rSSR = Math.min(0.01 + pity * 0.01, 0.16) // SSR 动态概率，封顶 16%
    const r = random()
    if (r < rSSR) rarity = 'SSR'
    else if (r < rSSR + 0.11) rarity = 'SR'         // SR 固定 11%
    else rarity = 'R'                               // 其余为 R（基础 88%）
  }
  return { rarity, ssrPity: rarity === 'SSR' ? 0 : pity + 1 }
}

module.exports = {
  filterFoods,
  matchesScene,
  availabilityLevel,
  foodHasTag,
  foodWeight,
  weightedPick,
  weightedPickIndex,
  buildTasteProfile,
  buildRichReason,
  computeStreak,
  buildMealCombo,
  inferSeason,
  rollRarityWithPity
}
