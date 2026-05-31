const test = require('node:test')
const assert = require('node:assert')
const { safeGet, safeSet } = require('./storage.js')

// 每个用例临时替换 global.wx，结束后还原
function withWx(mock, fn) {
  const prev = global.wx
  global.wx = mock
  try { return fn() } finally { global.wx = prev }
}

const noopToast = () => {}

test('safeGet: 正常读取返回存储值', () => {
  withWx({ getStorageSync: () => ['a', 'b'] }, () => {
    assert.deepStrictEqual(safeGet('k', []), ['a', 'b'])
  })
})

test('safeGet: 空值回落 fallback', () => {
  withWx({ getStorageSync: () => '' }, () => {
    assert.deepStrictEqual(safeGet('k', { x: 1 }), { x: 1 })
  })
})

test('safeGet: 抛异常回落 fallback、不向上抛', () => {
  withWx({ getStorageSync: () => { throw new Error('boom') } }, () => {
    assert.strictEqual(safeGet('k', 'fb'), 'fb')
  })
})

test('safeSet: 成功返回 true', () => {
  let written = null
  withWx({ setStorageSync: (k, v) => { written = [k, v] }, showToast: noopToast }, () => {
    assert.strictEqual(safeSet('k', 123), true)
    assert.deepStrictEqual(written, ['k', 123])
  })
})

test('safeSet: 抛异常返回 false、触发 toast、不向上抛', () => {
  let toasted = false
  withWx({
    setStorageSync: () => { throw new Error('quota exceeded') },
    showToast: () => { toasted = true }
  }, () => {
    assert.strictEqual(safeSet('k', 'v'), false)
    assert.strictEqual(toasted, true)
  })
})
