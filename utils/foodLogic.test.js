const test = require('node:test')
const assert = require('node:assert')
const {
  filterFoods, buildWheelPool, resolveWheelWinner, SECTOR_DEG, SECTOR_OFFSET,
  foodWeight, weightedPick, weightedPickIndex, buildTasteProfile,
  explainPick, computeStreak, buildMealCombo,
  buildRichReason, pickAlternatives, inferSeason
} = require('./foodLogic.js')

const FOODS = [
  { name: '红烧肉', category: '家常菜', scene: '自己做', budget: '💰💰', time: '快', tags: ['肉', '甜'] },
  { name: '麻辣烫', category: '火锅冒菜', scene: '外卖', budget: '💰💰', time: '快', tags: ['辣', '热'] },
  { name: '白灼菜心', category: '家常菜', scene: '自己做', budget: '💰💰', time: '快', tags: ['素', '清淡'] },
]
const NO_FILTER = { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, avoid: '' }

test('filterFoods: 无筛选返回全集', () => {
  const r = filterFoods(FOODS, NO_FILTER, { excludeRecent: false })
  assert.strictEqual(r.length, 3)
})

test('filterFoods: 场景维度精确过滤', () => {
  const r = filterFoods(FOODS, { ...NO_FILTER, sceneIdx: 1 }, { excludeRecent: false }) // 外卖
  assert.deepStrictEqual(r.map(f => f.name), ['麻辣烫'])
})

test('filterFoods: 预算/时间维度', () => {
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, budgetIdx: 2 }, {}).length, 3) // 💰💰
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, timeIdx: 2 }, {}).length, 0)   // 慢
})

test('filterFoods: avoid 支持中英逗号与空格分隔', () => {
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, avoid: '辣' }, {}).length, 2)
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, avoid: '辣，素' }, {}).length, 1)
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, avoid: '辣 素' }, {}).length, 1)
})

test('filterFoods: excludeRecent 仅排除 3 天内、跳过非法日期', () => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const recent = [{ name: '红烧肉', date: new Date(now - day).toISOString() }]
  assert.strictEqual(filterFoods(FOODS, NO_FILTER, { excludeRecent: true, history: recent, now }).length, 2)

  const stale = [{ name: '红烧肉', date: new Date(now - 4 * day).toISOString() }]
  assert.strictEqual(filterFoods(FOODS, NO_FILTER, { excludeRecent: true, history: stale, now }).length, 3)

  const bad = [{ name: '红烧肉', date: 'not-a-date' }]
  assert.strictEqual(filterFoods(FOODS, NO_FILTER, { excludeRecent: true, history: bad, now }).length, 3)
})

test('filterFoods: 组合条件可得空集', () => {
  const r = filterFoods(FOODS, { sceneIdx: 1, budgetIdx: 0, timeIdx: 0, avoid: '辣' }, {})
  assert.strictEqual(r.length, 0)
})

test('buildWheelPool: 空集返回空数组', () => {
  assert.deepStrictEqual(buildWheelPool([]), [])
})

test('buildWheelPool: 不足 8 个时长度恒为 8 且无 undefined', () => {
  const pool = buildWheelPool(FOODS, 8, () => 0)
  assert.strictEqual(pool.length, 8)
  assert.ok(pool.every(x => x !== undefined && x !== null))
})

test('buildWheelPool: 充足时 8 格无 undefined', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: 'f' + i }))
  const pool = buildWheelPool(many)
  assert.strictEqual(pool.length, 8)
  assert.ok(pool.every(x => x && typeof x.name === 'string'))
})

test('resolveWheelWinner: 落点不变量 —— 中奖扇区停到指针正上方', () => {
  for (let idx = 0; idx < 8; idx++) {
    const rng = () => (idx + 0.5) / 8 // 确保 floor(rng*8) === idx
    const { winnerIdx, targetMod } = resolveWheelWinner(8, rng)
    assert.strictEqual(winnerIdx, idx)
    const landed = (winnerIdx * SECTOR_DEG + SECTOR_OFFSET + targetMod) % 360
    assert.ok(Math.abs(landed) < 1e-9, `idx=${idx} landed=${landed}`)
  }
})

// ===== 进化①②：加权推荐 + 负反馈降权 =====

test('foodWeight: 收藏加成、口味加成、拒绝降权', () => {
  const base = { name: 'x', tags: [] }
  assert.strictEqual(foodWeight(base, {}), 1) // 无偏好 = 基准 1
  assert.strictEqual(foodWeight({ name: 'x', tags: [] }, { favoriteSet: new Set(['x']) }), 2.5)
  assert.ok(foodWeight({ name: 'x', tags: ['辣'] }, { tasteCounts: { 辣: 2 } }) > 1)
  // 拒绝项被强力降权但不清零
  const w = foodWeight({ name: 'x', tags: [] }, { rejectedSet: new Set(['x']) })
  assert.ok(w > 0 && w < 0.2)
})

test('weightedPickIndex: 空池返回 -1，权重全 0 退化均匀', () => {
  assert.strictEqual(weightedPickIndex([], {}), -1)
  // 所有项被拒绝（权重极小但 >0），仍能取到下标
  const pool = [{ name: 'a', tags: [] }, { name: 'b', tags: [] }]
  const prefs = { rejectedSet: new Set(['a', 'b']) }
  assert.ok(weightedPickIndex(pool, prefs, () => 0.5) >= 0)
})

test('weightedPick: 高权重项在确定 rng 下被选中', () => {
  const pool = [{ name: '冷门', tags: [] }, { name: '最爱', tags: [] }]
  const prefs = { favoriteSet: new Set(['最爱']) } // 权重 1 vs 2.5，total 3.5
  // r = 0.9*3.5 = 3.15 → 跳过冷门(1) 落到最爱
  assert.strictEqual(weightedPick(pool, prefs, () => 0.9).name, '最爱')
})

test('weightedPick: ε-greedy 探索概率可突破权重偏见', () => {
  const pool = [{ name: '热门', tags: [] }, { name: '冷门', tags: [] }]
  const prefs = { favoriteSet: new Set(['热门']) } // 热门权重 2.5，冷门 1
  // 第一次 rng=0.05(<0.10) 触发探索，第二次 rng=0.99 选中第二个
  let calls = 0
  const rng = () => { calls++; return calls === 1 ? 0.05 : 0.99 }
  assert.strictEqual(weightedPick(pool, prefs, rng).name, '冷门')
})

// ===== 进化③：口味画像 =====

test('buildTasteProfile: 空历史给出引导文案', () => {
  const p = buildTasteProfile([], [], FOODS)
  assert.strictEqual(p.total, 0)
  assert.strictEqual(p.topCategories.length, 0)
  assert.ok(p.headline.includes('还没有记录'))
})

test('buildTasteProfile: 统计品类/标签/辣度占比', () => {
  const history = [
    { name: '红烧肉' }, { name: '红烧肉' }, { name: '麻辣烫' }, { name: '不存在的菜' }
  ]
  const p = buildTasteProfile(history, [{ name: '红烧肉' }], FOODS)
  assert.strictEqual(p.total, 4)                       // 含未知菜也计入决策次数
  assert.strictEqual(p.topCategories[0].name, '家常菜') // 红烧肉×2 → 家常菜 居首
  assert.strictEqual(p.topCategories[0].count, 2)
  assert.strictEqual(p.favoriteCount, 1)
  assert.strictEqual(p.spicyCount, 1)                  // 仅麻辣烫含「辣」
  assert.ok(Math.abs(p.spicyRatio - 0.25) < 1e-9)
  assert.ok(p.headline.includes('4 餐'))
})

// ===== 进化④：可解释推荐 =====

test('explainPick: 收藏 > 口味 > 兜底 的优先级', () => {
  assert.strictEqual(
    explainPick({ name: '红烧肉', tags: ['肉'] }, { favoriteSet: new Set(['红烧肉']) }),
    '你们的最爱之一 ❤️'
  )
  assert.strictEqual(
    explainPick({ name: '麻辣烫', tags: ['辣'] }, { tasteCounts: { 辣: 3 } }),
    '你们近来偏爱「辣」'
  )
  // 口味信号不足阈值 → 落到兜底文案
  assert.ok(explainPick({ name: 'x', tags: ['辣'] }, { tasteCounts: { 辣: 1 } }).includes('碰碰运气'))
  assert.ok(explainPick({ name: 'x', tags: [] }, {}).includes('碰碰运气'))
})

// ===== 进化⑤：决策连胜 =====

test('computeStreak: 今天+昨天+前天 连续 3 天', () => {
  const now = new Date(2026, 4, 31, 12, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  const history = [
    { date: new Date(now).toISOString() },
    { date: new Date(now - day).toISOString() },
    { date: new Date(now - 2 * day).toISOString() },
  ]
  const s = computeStreak(history, now)
  assert.strictEqual(s.current, 3)
  assert.strictEqual(s.longest, 3)
  assert.strictEqual(s.decidedToday, true)
})

test('computeStreak: 今天没决定但昨天有 → 连胜仍存活', () => {
  const now = new Date(2026, 4, 31, 12, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  const s = computeStreak([{ date: new Date(now - day).toISOString() }], now)
  assert.strictEqual(s.current, 1)
  assert.strictEqual(s.decidedToday, false)
})

test('computeStreak: 断档后 current 归零、longest 保留', () => {
  const now = new Date(2026, 4, 31, 12, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  const history = [
    { date: new Date(now - 5 * day).toISOString() }, // 5 天前
    { date: new Date(now - 6 * day).toISOString() }, // 6 天前（与上面连成 2）
  ]
  const s = computeStreak(history, now)
  assert.strictEqual(s.current, 0)
  assert.strictEqual(s.longest, 2)
})

test('computeStreak: 空历史', () => {
  const s = computeStreak([], Date.now())
  assert.deepStrictEqual(s, { current: 0, longest: 0, decidedToday: false })
})

// ===== 进化⑥：一键凑一桌 =====

test('buildMealCombo: 优先不同品类、数量正确、无重复', () => {
  const foods = [
    { name: 'a', category: '家常菜' }, { name: 'b', category: '家常菜' },
    { name: 'c', category: '西式简餐' }, { name: 'd', category: '日韩料理' },
  ]
  const combo = buildMealCombo(foods, 3, () => 0) // 注入定长 rng，确定性
  assert.strictEqual(combo.length, 3)
  assert.strictEqual(new Set(combo.map(f => f.name)).size, 3) // 无重复菜
  assert.strictEqual(new Set(combo.map(f => f.category)).size, 3) // 三种不同品类
})

test('buildMealCombo: 品类不足时用剩余菜补足数量', () => {
  const foods = [
    { name: 'a', category: '家常菜' }, { name: 'b', category: '家常菜' }, { name: 'c', category: '家常菜' },
  ]
  const combo = buildMealCombo(foods, 3, () => 0)
  assert.strictEqual(combo.length, 3)
  assert.strictEqual(new Set(combo.map(f => f.name)).size, 3)
})

// ===== 进化⑦：智能池过滤与权重分层 =====

test('filterFoods: 严格模式下排除 canBeMeal=false', () => {
  const foods = [
    { name: '红烧肉', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: ['肉'] },
    { name: '豆浆', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [] },
    { name: '玉米排骨汤', canBeMeal: false, scene: '自己做', budget: '💰', time: '慢', tags: [] },
  ]
  // 默认 requireMeal 不为 false → 只返回 canBeMeal=true
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '红烧肉')
})

test('filterFoods: 关闭严格模式后 canBeMeal=false 也进入池', () => {
  const foods = [
    { name: '红烧肉', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: [] },
    { name: '豆浆', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', requireMeal: false }, {})
  assert.strictEqual(r.length, 2)
})

test('filterFoods: 时段过滤 mealPeriod', () => {
  const foods = [
    { name: '油条', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [], mealPeriods: ['早餐', '加餐'] },
    { name: '红烧肉', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: [], mealPeriods: ['午餐', '晚餐'] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', requireMeal: false, mealPeriod: '早餐' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '油条')
})

test('filterFoods: 排除 enabled=false', () => {
  const foods = [
    { name: '红烧肉', canBeMeal: true, enabled: true, scene: '自己做', budget: '💰', time: '快', tags: [] },
    { name: '辣椒船', canBeMeal: true, enabled: false, scene: '堂食', budget: '💰', time: '快', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '红烧肉')
})

test('foodWeight: defaultPoolWeight 基础权重生效', () => {
  const low = { name: 'a', defaultPoolWeight: 0.3, tags: [] }
  const high = { name: 'b', defaultPoolWeight: 1.0, tags: [] }
  const wLow = foodWeight(low, {})
  const wHigh = foodWeight(high, {})
  assert.ok(wHigh > wLow, '高池权重应大于低池权重')
  assert.ok(wLow > 0, '低池权重保底非零')
})

test('foodWeight: canBeMeal=false 的 defaultPoolWeight 为 0 时仍保底', () => {
  const food = { name: 'a', defaultPoolWeight: 0, tags: [] }
  const w = foodWeight(food, {})
  assert.strictEqual(w, 0.01)
})

test('foodWeight: 冷却族 3 天内降权', () => {
  const now = Date.now()
  const food = { name: '四川火锅', cooldownFamilyId: '火锅族', tags: [] }
  const prefsCold = { cooldownFamilyPicks: { '火锅族': now - 24 * 60 * 60 * 1000 } } // 1 天前
  const prefsHot = { cooldownFamilyPicks: { '火锅族': now - 5 * 24 * 60 * 60 * 1000 } } // 5 天前
  const wCold = foodWeight(food, prefsCold)
  const wHot = foodWeight(food, prefsHot)
  assert.ok(wCold < wHot, '3 天内同类应降权')
})

test('buildWheelPool: 等价组去重不冲突', () => {
  const foods = [
    { name: '红烧肉', equivalentGroupId: '红烧肉_套餐族' },
    { name: '红烧肉盖饭', equivalentGroupId: '红烧肉_套餐族' },
    { name: '白灼菜心' },
    { name: '麻婆豆腐', equivalentGroupId: '麻婆豆腐_套餐族' },
    { name: '麻婆豆腐饭', equivalentGroupId: '麻婆豆腐_套餐族' },
    { name: '回锅肉', equivalentGroupId: '回锅肉_套餐族' },
    { name: '回锅肉饭', equivalentGroupId: '回锅肉_套餐族' },
    { name: '宫保鸡丁', equivalentGroupId: '宫保鸡丁_套餐族' },
    { name: '宫保鸡丁饭', equivalentGroupId: '宫保鸡丁_套餐族' },
    { name: '番茄蛋汤' },
  ]
  const pool = buildWheelPool(foods, 8, () => 0.1) // 固定 rng 保证可测
  const groups = new Set()
  for (const item of pool) {
    if (item.equivalentGroupId) {
      assert.ok(!groups.has(item.equivalentGroupId), `等价组 ${item.equivalentGroupId} 不应重复出现在 8 格中`)
      groups.add(item.equivalentGroupId)
    }
  }
})

// ===== 进化⑧：数据字段扩充 + 受约束随机 =====

test('filterFoods: itemLevel 过滤正餐模式', () => {
  const foods = [
    { name: '红烧肉', itemLevel: '单道菜', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: [] },
    { name: '豆浆', itemLevel: '早餐单品', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [], mealPeriods: ['早餐'] },
    { name: '拍黄瓜', itemLevel: '配菜', canBeMeal: false, scene: '自己做', budget: '💰', time: '快', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', itemLevel: '正餐' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '红烧肉')
})

test('filterFoods: availability 渠道过滤', () => {
  const foods = [
    { name: '烤全羊', availability: { 外卖: '极低', 堂食: '高', 自己做: '极低', 食堂: '极低' }, canBeMeal: true, scene: '堂食', budget: '💰💰💰', time: '慢', tags: [] },
    { name: '黄焖鸡', availability: { 外卖: '高', 堂食: '中', 自己做: '低', 食堂: '高' }, canBeMeal: true, scene: '外卖', budget: '💰💰', time: '慢', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', scene: '外卖' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '黄焖鸡')
})

test('foodWeight: 渠道匹配权重', () => {
  const foodHigh = { name: 'a', defaultPoolWeight: 1.0, availability: { 外卖: '高', 堂食: '中', 自己做: '低', 食堂: '中' }, tags: [] }
  const foodLow = { name: 'b', defaultPoolWeight: 1.0, availability: { 外卖: '低', 堂食: '中', 我自己做: '低', 食堂: '中' }, tags: [] }
  const wHigh = foodWeight(foodHigh, {}, { scene: '外卖' })
  const wLow = foodWeight(foodLow, {}, { scene: '外卖' })
  assert.ok(wHigh > wLow, '渠道高匹配权重大于低匹配')
})

test('foodWeight: 天气匹配权重', () => {
  const foodMatch = { name: 'a', defaultPoolWeight: 1.0, weatherTags: ['降温适合', '雨天适合'], tags: [] }
  const foodNoMatch = { name: 'b', defaultPoolWeight: 1.0, weatherTags: ['炎热适合'], tags: [] }
  const wMatch = foodWeight(foodMatch, {}, { weatherTags: ['降温适合'] })
  const wNoMatch = foodWeight(foodNoMatch, {}, { weatherTags: ['降温适合'] })
  assert.ok(wMatch > wNoMatch, '天气匹配权重大于不匹配')
})

test('buildRichReason: 生成结构化推荐理由', () => {
  const food = { name: '黄焖鸡米饭', budget: '💰💰', time: '慢', spicyLevel: 2, itemLevel: '完整餐食', availability: { 外卖: '高' } }
  const reason = buildRichReason(food, { scene: '外卖' })
  assert.ok(reason.includes('30元以内'), '应包含预算')
  assert.ok(reason.includes('适合外卖'), '应包含渠道')
  assert.ok(reason.includes('微辣'), '应包含辣度')
  assert.ok(reason.includes('完整一餐'), '应包含粒度')
})

test('pickAlternatives: 排除同组同族', () => {
  const foods = [
    { name: '红烧肉', equivalentGroupId: '红烧肉_套餐族' },
    { name: '红烧肉盖饭', equivalentGroupId: '红烧肉_套餐族' },
    { name: '白灼菜心' },
    { name: '麻婆豆腐', equivalentGroupId: '麻婆豆腐_套餐族' },
    { name: '番茄炒蛋' },
  ]
  const main = foods[0]
  const alts = pickAlternatives(foods, main, 2, {}, () => 0.1, {})
  assert.strictEqual(alts.length, 2)
  assert.ok(!alts.some(a => a.name === '红烧肉盖饭'), '不应出现同等价组')
  assert.ok(!alts.some(a => a.name === '红烧肉'), '不应出现主推荐')
})

test('inferSeason: 夏→炎热适合、冬→降温适合、春秋→空', () => {
  assert.deepStrictEqual(inferSeason(new Date(2026, 6, 15).getTime()), ['炎热适合'])  // 7 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 7, 1).getTime()), ['炎热适合'])   // 8 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 0, 15).getTime()), ['降温适合'])  // 1 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 11, 15).getTime()), ['降温适合']) // 12 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 3, 15).getTime()), [])            // 4 月（春）
  assert.deepStrictEqual(inferSeason(new Date(2026, 9, 15).getTime()), [])            // 10 月（秋）
  assert.deepStrictEqual(inferSeason(new Date(2026, 5, 1).getTime()), ['炎热适合'])   // 6 月（夏下界）
  assert.deepStrictEqual(inferSeason(new Date(2026, 1, 28).getTime()), ['降温适合'])  // 2 月（冬上界）
  assert.deepStrictEqual(inferSeason(new Date(2026, 4, 31).getTime()), [])            // 5 月（夏前）
  assert.deepStrictEqual(inferSeason(new Date(2026, 8, 1).getTime()), [])             // 9 月（夏后）
  assert.deepStrictEqual(inferSeason(new Date(2026, 2, 1).getTime()), [])             // 3 月（冬后）
  assert.deepStrictEqual(inferSeason(new Date(2026, 10, 30).getTime()), [])           // 11 月（冬前）
})
