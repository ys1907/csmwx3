// 菜品库数据体检：把治理成果焊成不变量。
// ⚠️ 必须在本地（无沙箱）运行才可信——沙箱内 node 读 data/foods.js 的 category 是归一后的影子副本。
const { test } = require('node:test')
const assert = require('node:assert')
const rawFoods = require('../data/foods.js')
const { migrateFood } = require('./util.js')

const CATEGORIES = ['家常菜', '小吃点心', '日韩料理', '汤粥炖品', '火锅冒菜', '烧烤', '甜品饮品', '西式简餐', '轻食', '配菜', '面食粉类', '饭类套餐']
const LEGACY = ['中式快餐', '街边小吃', '日韩', '西式', '火锅烧烤']
const OFFAL = /肥肠|猪脏|大肠|腰花|生鱼片|醉蟹|美蛙/
const foods = rawFoods.map(migrateFood)
const inPool = f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false
const pool = foods.filter(inPool)
const isForeign = f => !/中/.test(f.cuisine || '中式')

test('磁盘无残留旧分类（落盘归一验收，本地运行才可信）', () => {
  const bad = rawFoods.filter(f => LEGACY.includes(f.category)).map(f => f.name)
  assert.deepStrictEqual(bad, [], `仍有旧分类: ${bad.slice(0, 5).join('、')}…(${bad.length})`)
})

test('category 全部合法、weight ∈ [0,1]', () => {
  for (const f of foods) {
    assert.ok(CATEGORIES.includes(f.category), `非法分类 ${f.category}@${f.name}`)
    const w = f.defaultPoolWeight
    assert.ok(w >= 0 && w <= 1, `weight 越界 ${w}@${f.name}`)
  }
})

test('池内无内脏猎奇', () => {
  const bad = pool.filter(f => OFFAL.test(f.name)).map(f => f.name)
  assert.deepStrictEqual(bad, [], `内脏入池: ${bad.join('、')}`)
})

test('池内异国占比 ≤ 15%', () => {
  const ratio = pool.filter(isForeign).length / pool.length
  assert.ok(ratio <= 0.15, `异国占比 ${(ratio * 100).toFixed(1)}%`)
})

test('池内非成餐项（canBeMeal=false）权重 ≤ 0.3', () => {
  const bad = pool.filter(f => f.canBeMeal === false && f.defaultPoolWeight > 0.3).map(f => f.name)
  assert.deepStrictEqual(bad, [], `非成餐项权重过高: ${bad.slice(0, 5).join('、')}`)
})

test('池量充足（防误删空池）', () => {
  assert.ok(pool.length >= 80, `池量仅 ${pool.length}`)
})

test('每个心情 chip 池内候选 ≥ 15', () => {
  const has = (f, t) => (f.tags || []).includes(t)
  const chip = {
    早餐: f => (f.mealPeriods || []).includes('早餐'),
    辣: f => has(f, '辣') || f.spicyLevel > 0,
    清淡: f => has(f, '清淡'),
    家常菜: f => f.category === '家常菜',
    奢侈: f => f.budget === '💰💰💰',
  }
  for (const [name, pred] of Object.entries(chip)) {
    const n = pool.filter(pred).length
    assert.ok(n >= 15, `chip「${name}」池内仅 ${n} 道`)
  }
})
