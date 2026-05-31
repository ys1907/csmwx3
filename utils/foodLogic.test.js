const test = require('node:test')
const assert = require('node:assert')
const {
  filterFoods, buildWheelPool, resolveWheelWinner, SECTOR_DEG, SECTOR_OFFSET,
  foodWeight, weightedPick, weightedPickIndex, buildTasteProfile
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
