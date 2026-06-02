const test = require('node:test')
const assert = require('node:assert')
const { shuffleArray, formatDate, migrateFood, uid } = require('./util.js')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

test('shuffleArray: 不改原数组且元素集合不变', () => {
  const orig = [1, 2, 3, 4, 5]
  const copy = orig.slice()
  const out = shuffleArray(orig)
  assert.deepStrictEqual(orig, copy, '原数组不应被修改')
  assert.strictEqual(out.length, orig.length)
  assert.deepStrictEqual(out.slice().sort(), copy.slice().sort())
})

test('migrateFood: 缺字段补默认值', () => {
  const m = migrateFood({})
  assert.strictEqual(m.name, '未知食物')
  assert.strictEqual(m.emoji, '🍽️')
  assert.strictEqual(m.category, '家常菜')
  assert.deepStrictEqual(m.tags, [])
  assert.strictEqual(m.spicyLevel, 0)
  assert.strictEqual(m.calories, null)
  assert.ok(m._id, '_id 应被生成')
})

test('migrateFood: tags 非数组归一为空数组、保留已有 _id', () => {
  const m = migrateFood({ name: '红烧肉', tags: '辣', _id: 'fixed-id' })
  assert.deepStrictEqual(m.tags, [])
  assert.strictEqual(m._id, 'fixed-id')
})

test('formatDate: 带/不带星期', () => {
  const d = new Date(2024, 4, 31) // 2024-05-31 本地时间
  assert.strictEqual(formatDate(d, false), '5月31日')
  assert.strictEqual(formatDate(d, true), `${WEEKDAYS[d.getDay()]} 5月31日`)
})

test('formatDate: 跨月边界', () => {
  assert.strictEqual(formatDate(new Date(2024, 0, 1), false), '1月1日')
  assert.strictEqual(formatDate(new Date(2024, 11, 31), false), '12月31日')
})

test('uid: 生成非空且基本唯一', () => {
  const a = uid(), b = uid()
  assert.ok(a && b)
  assert.notStrictEqual(a, b)
})

test('migrateFood: 旧分类归一到新分类', () => {
  assert.strictEqual(migrateFood({ name: '黄焖鸡', category: '中式快餐' }).category, '饭类套餐')
  assert.strictEqual(migrateFood({ name: '煎饼', category: '街边小吃' }).category, '小吃点心')
  assert.strictEqual(migrateFood({ name: '寿司', category: '日韩' }).category, '日韩料理')
  assert.strictEqual(migrateFood({ name: '意面', category: '西式' }).category, '西式简餐')
  // 火锅烧烤需细分：foodType 或菜名命中烧烤 → 烧烤，否则火锅冒菜
  assert.strictEqual(migrateFood({ name: '自助烧烤', category: '火锅烧烤' }).category, '烧烤')
  assert.strictEqual(migrateFood({ name: '烤羊腿', category: '火锅烧烤', foodType: '烧烤' }).category, '烧烤')
  assert.strictEqual(migrateFood({ name: '四川火锅', category: '火锅烧烤' }).category, '火锅冒菜')
  // 新分类与缺失分类保持既有行为
  assert.strictEqual(migrateFood({ name: '红烧肉', category: '家常菜' }).category, '家常菜')
  assert.strictEqual(migrateFood({ name: '无分类' }).category, '家常菜')
})

test('migrateFood: weatherTags 为空时按 category/tags 推断填充', () => {
  // 辣/火锅冒菜 → 降温适合
  assert.ok(migrateFood({ name: '麻辣香锅', category: '火锅冒菜', tags: ['辣'] }).weatherTags.includes('降温适合'))
  // 凉 → 炎热适合
  assert.ok(migrateFood({ name: '凉面', category: '面食粉类', tags: ['凉'] }).weatherTags.includes('炎热适合'))
  // 旧分类先归一(火锅烧烤→火锅冒菜)再推断，含辣 → 降温适合
  assert.ok(migrateFood({ name: '麻辣烫', category: '火锅烧烤', tags: ['辣'] }).weatherTags.includes('降温适合'))
  // 已有 weatherTags 则保留，不覆盖
  assert.deepStrictEqual(migrateFood({ name: 'x', category: '家常菜', weatherTags: ['雨天适合'] }).weatherTags, ['雨天适合'])
})
