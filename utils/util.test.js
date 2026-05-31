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
