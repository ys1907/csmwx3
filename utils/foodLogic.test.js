const test = require('node:test')
const assert = require('node:assert')
const {
  filterFoods, buildWheelPool, resolveWheelWinner, SECTOR_DEG, SECTOR_OFFSET,
  foodWeight, weightedPick, weightedPickIndex, buildTasteProfile,
  explainPick, computeStreak, buildMealCombo
} = require('./foodLogic.js')

const FOODS = [
  { name: '红烧肉', category: '家常菜', scene: '自己做', budget: '💰💰', time: '快', tags: ['肉', '甜'] },
  { name: '麻辣烫', category: '火锅烧烤', scene: '外卖', budget: '💰💰', time: '快', tags: ['辣', '热'] },
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
    { name: 'c', category: '西式' }, { name: 'd', category: '日韩' },
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
