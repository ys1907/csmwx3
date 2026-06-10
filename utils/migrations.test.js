const { test } = require('node:test')
const assert = require('node:assert')
const { SCHEMA_VERSION, runMigrations } = require('./migrations.js')

// 内存 store，模拟 storage.js 的 get(key, fallback) 语义
function memStore(initial) {
  const m = new Map(Object.entries(initial || {}))
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    remove: (k) => m.delete(k),
  }
}

test('空数据：置 schema 版本，无报错', () => {
  const s = memStore({})
  const r = runMigrations(s)
  assert.strictEqual(r.migrated, true)
  assert.strictEqual(r.from, 0)
  assert.strictEqual(r.to, SCHEMA_VERSION)
  assert.strictEqual(s.get('wtec_schema_version', 0), SCHEMA_VERSION)
})

test('有 _v3 旧数据：搬到稳定 key + 删旧 key', () => {
  const s = memStore({
    wtec_fav_v3: [{ name: '红烧肉' }],
    wtec_history_v3: [{ name: '寿司', date: 1 }],
    wtec_ssr_dex_v3: ['黄焖鸡'],
    wtec_foods_v3: [{ name: 'x' }],
  })
  runMigrations(s)
  assert.deepStrictEqual(s.get('wtec_fav', null), [{ name: '红烧肉' }])
  assert.deepStrictEqual(s.get('wtec_history', null), [{ name: '寿司', date: 1 }])
  assert.deepStrictEqual(s.get('wtec_ssr_dex', null), ['黄焖鸡'])
  assert.strictEqual(s.get('wtec_fav_v3', null), null) // 旧 key 已删
  assert.strictEqual(s.get('wtec_foods_v3', null), null) // foods 旧 key 也删
  assert.strictEqual(s.get('wtec_foods', null), null) // foods 不搬到新 key（走重播种）
  assert.strictEqual(s.get('wtec_schema_version', 0), SCHEMA_VERSION)
})

test('已迁移：no-op，不动数据', () => {
  const s = memStore({ wtec_schema_version: SCHEMA_VERSION, wtec_fav: [{ name: 'a' }] })
  const r = runMigrations(s)
  assert.strictEqual(r.migrated, false)
  assert.deepStrictEqual(s.get('wtec_fav', null), [{ name: 'a' }])
})

test('v2：清理每周推荐孤儿 key，且 v1 老用户增量执行', () => {
  // 已在 v1 的老用户：只跑 v2，不重跑 v1
  const s = memStore({
    wtec_schema_version: 1,
    wtec_week_food: { name: '红烧肉' },
    wtec_week_food_date: '2026-01-01',
    wtec_fav: [{ name: 'a' }],
  })
  const r = runMigrations(s)
  assert.strictEqual(r.migrated, true)
  assert.strictEqual(r.from, 1)
  assert.strictEqual(r.to, SCHEMA_VERSION)
  assert.strictEqual(s.get('wtec_week_food', null), null)
  assert.strictEqual(s.get('wtec_week_food_date', null), null)
  assert.deepStrictEqual(s.get('wtec_fav', null), [{ name: 'a' }]) // 其余数据不动
})

test('新 key 已有数据：不覆盖，但旧 key 仍删', () => {
  const s = memStore({ wtec_fav_v3: [{ name: '旧' }], wtec_fav: [{ name: '新' }] })
  runMigrations(s)
  assert.deepStrictEqual(s.get('wtec_fav', null), [{ name: '新' }]) // 不覆盖
  assert.strictEqual(s.get('wtec_fav_v3', null), null) // 旧 key 删
})
