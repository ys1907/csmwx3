const { test } = require('node:test')
const assert = require('node:assert')
const { loadFoods, persistFoods, getFoodsRev } = require('./foodRepo.js')
const { FOODS_SEED_VERSION, STORAGE_KEYS } = require('../data/options.js')

// 内存 store，模拟 storage.js 的 get(key, fallback) 语义
function memStore(initial) {
  const m = new Map(Object.entries(initial || {}))
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    raw: m,
  }
}

const SEED = [
  { _id: 's1', name: '红烧肉', category: '家常菜' },
  { _id: 's2', name: '麻辣烫', category: '火锅冒菜' },
]

test('loadFoods: 闸门命中（版本一致且本地非空）→ 用本地数据', () => {
  const s = memStore({
    [STORAGE_KEYS.localVersion]: FOODS_SEED_VERSION,
    [STORAGE_KEYS.foods]: [{ _id: 'u1', name: '我家秘制菜' }],
  })
  const foods = loadFoods(SEED, s)
  assert.strictEqual(foods.length, 1)
  assert.strictEqual(foods[0].name, '我家秘制菜')
  assert.strictEqual(foods[0].category, '家常菜', '应已过 migrateFood 补默认分类')
})

test('loadFoods: 闸门失效（版本不符）→ 重播种且保留用户自建菜', () => {
  const s = memStore({
    [STORAGE_KEYS.localVersion]: '旧版本',
    [STORAGE_KEYS.foods]: [
      { _id: 's1', name: '红烧肉', emoji: '改过的' }, // 内置菜的编辑：不保留
      { _id: 'u1', name: '我家秘制菜' },              // 自建菜：保留
    ],
  })
  const foods = loadFoods(SEED, s)
  assert.strictEqual(foods.length, 3)
  assert.ok(foods.some(f => f._id === 'u1'))
  assert.notStrictEqual(foods.find(f => f._id === 's1').emoji, '改过的', '内置菜编辑不保留')
})

test('loadFoods: 本地为空 → 纯种子', () => {
  const foods = loadFoods(SEED, memStore({}))
  assert.deepStrictEqual(foods.map(f => f._id), ['s1', 's2'])
})

test('persistFoods: 三键一起落盘；getFoodsRev 读回同一信号', () => {
  const s = memStore({})
  const before = getFoodsRev(s)
  assert.strictEqual(before, 0)
  persistFoods([{ _id: 'u1', name: 'x' }], s)
  assert.deepStrictEqual(s.get(STORAGE_KEYS.foods, null), [{ _id: 'u1', name: 'x' }])
  assert.strictEqual(s.get(STORAGE_KEYS.localVersion, ''), FOODS_SEED_VERSION)
  assert.ok(getFoodsRev(s) > 0, 'foodsRev 必须随写入更新')
})
