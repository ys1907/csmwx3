const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { STORAGE_KEYS } = require('../data/options.js')

class FakeTimers {
  constructor() {
    this.nextId = 1
    this.tasks = new Map()
  }
  setTimeout(fn, delay) {
    const id = this.nextId++
    this.tasks.set(id, { type: 'timeout', fn, delay })
    return id
  }
  setInterval(fn, delay) {
    const id = this.nextId++
    this.tasks.set(id, { type: 'interval', fn, delay })
    return id
  }
  clear(id) { this.tasks.delete(id) }
  count(type, delay) {
    return Array.from(this.tasks.values()).filter(task => {
      return (!type || task.type === type) && (delay === undefined || task.delay === delay)
    }).length
  }
  run(id) {
    const task = this.tasks.get(id)
    if (!task) throw new Error(`missing task: ${id}`)
    if (task.type === 'timeout') this.tasks.delete(id)
    task.fn()
  }
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function applyPath(target, key, value) {
  const parts = key.split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {}
    cursor = cursor[parts[i]]
  }
  cursor[parts[parts.length - 1]] = value
}

function withIndexPage(run) {
  const previous = {
    Page: global.Page, wx: global.wx,
    setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
    setInterval: global.setInterval, clearInterval: global.clearInterval,
  }
  const timers = new FakeTimers()
  const storage = new Map()
  const storageReads = []
  const storageWrites = []
  const audios = []
  const context = {
    scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arcTo() {}, closePath() {}, fill() {}, stroke() {}, fillText() {}, arc() {},
  }
  const share = {
    selectorCount: 0, exports: [], saves: [],
    canvas: { width: 0, height: 0, getContext: () => context },
  }
  let definition
  let themeHandler

  global.Page = value => { definition = value }
  global.setTimeout = (fn, delay) => timers.setTimeout(fn, delay)
  global.clearTimeout = id => timers.clear(id)
  global.setInterval = (fn, delay) => timers.setInterval(fn, delay)
  global.clearInterval = id => timers.clear(id)
  global.wx = {
    getStorageSync: key => { storageReads.push(key); return storage.has(key) ? storage.get(key) : '' },
    setStorageSync: (key, value) => { storageWrites.push(key); storage.set(key, value) },
    getAppBaseInfo: () => ({ theme: 'light' }),
    // 与真机一致：onThemeChange 无返回值，解绑走 offThemeChange(listener)
    onThemeChange: fn => { themeHandler = fn },
    offThemeChange: fn => { if (themeHandler === fn) themeHandler = null },
    createInnerAudioContext: () => {
      const audio = {
        stopCount: 0, playCount: 0, destroyCount: 0,
        stop() { this.stopCount++ }, play() { this.playCount++ }, destroy() { this.destroyCount++ },
      }
      audios.push(audio)
      return audio
    },
    showToast() {}, vibrateShort() {}, navigateTo() {}, nextTick: fn => fn(),
    createSelectorQuery: () => ({
      select() { share.selectorCount++; return this },
      fields() { return this },
      exec(fn) { fn([{ node: share.canvas, size: true }]) },
    }),
    canvasToTempFilePath: options => share.exports.push(options),
    saveImageToPhotosAlbum: options => { share.saves.push(options); if (options.success) options.success() },
    previewImage() {},
  }

  const pagePath = path.resolve(__dirname, '../pages/index/index.js')
  delete require.cache[pagePath]
  require(pagePath)
  const page = {}
  for (const [key, value] of Object.entries(definition)) {
    page[key] = typeof value === 'function' ? value : clone(value)
  }
  page.data = clone(definition.data)
  page.setDataCalls = []
  page.setData = function(patch, callback) {
    this.setDataCalls.push(patch)
    for (const [key, value] of Object.entries(patch)) applyPath(this.data, key, value)
    if (callback) callback.call(this)
  }

  try {
    page.onLoad()
    page.onShow()
    run({ page, timers, audios, share, storageReads, storageWrites, getThemeHandler: () => themeHandler })
  } finally {
    if (page.onUnload) page.onUnload()
    global.Page = previous.Page
    global.wx = previous.wx
    global.setTimeout = previous.setTimeout
    global.clearTimeout = previous.clearTimeout
    global.setInterval = previous.setInterval
    global.clearInterval = previous.clearInterval
    delete require.cache[pagePath]
  }
}

// ===== 盲盒生命周期 =====

test('index lifecycle: 盲盒揭晓途中隐藏，返回前台直接揭晓', () => {
  withIndexPage(({ page }) => {
    page.onTapBox()
    assert.strictEqual(page.data.boxPhase, 'revealing')
    assert.ok(page._pendingReveal)
    page.onHide()
    assert.ok(page._pausedReveal)
    assert.strictEqual(page._revealTimer, null)
    page.onShow()
    assert.strictEqual(page.data.boxPhase, 'revealed')
    assert.ok(page.data.currentResult)
  })
})

test('index lifecycle: 揭晓后卸载，定时器归零且音效销毁', () => {
  withIndexPage(({ page, timers, audios }) => {
    page.onTapBox()
    timers.run(page._revealTimer)  // 触发 finishReveal → playDing 创建音效
    assert.strictEqual(page.data.boxPhase, 'revealed')
    assert.strictEqual(audios.length, 1)
    page.onUnload()
    assert.strictEqual(timers.tasks.size, 0)
    assert.strictEqual(audios[0].destroyCount, 1)
  })
})

test('index lifecycle: 换一个回到盒子并立即重抽', () => {
  withIndexPage(({ page, timers }) => {
    page.onTapBox()
    timers.run(page._revealTimer)
    assert.strictEqual(page.data.boxPhase, 'revealed')
    const first = page.data.currentResult.name
    page.onRetry()  // nextTick 同步重抽 → 再次进入 revealing
    assert.strictEqual(page.data.boxPhase, 'revealing')
    assert.ok(page._rejected.has(first), '被换掉的菜进入会话级拒绝集')
  })
})

// ===== 通用基础设施 =====

test('index storage: 揭晓写历史走延迟队列，flush 后合并落盘', () => {
  withIndexPage(({ page, timers, storageWrites }) => {
    page.flushPendingWrites()
    storageWrites.length = 0
    page.onTapBox()
    timers.run(page._revealTimer)  // finishReveal → addToHistory → queueStorageWrite（延迟）
    assert.strictEqual(storageWrites.length, 0, '揭晓不立即写盘')
    page.flushPendingWrites()
    assert.ok(storageWrites.includes(STORAGE_KEYS.history), 'flush 后历史落盘')
  })
})

test('index lifecycle: 页面隐藏期间主题变化不触发 setData', () => {
  withIndexPage(({ page, getThemeHandler }) => {
    page.onHide()
    const count = page.setDataCalls.length
    getThemeHandler()({ theme: 'dark' })
    assert.strictEqual(page.setDataCalls.length, count)
    page.onShow()
    assert.strictEqual(page.data.darkMode, true)
  })
})

test('index data: 历史与收藏存实例属性，不进入渲染层', () => {
  withIndexPage(({ page }) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(page.data, 'history'), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(page.data, 'favorites'), false)
    assert.ok(Array.isArray(page._history))
    assert.ok(Array.isArray(page._favorites))
  })
})

test('index startup: 启动页随 initData 完成淡出，最短 600ms', () => {
  withIndexPage(({ page, timers }) => {
    assert.strictEqual(page.data.showIntro, true)
    assert.strictEqual(page.data.introFading, false)
    let fadingReached = false
    for (let i = 0; i < 5; i++) {
      const entries = Array.from(timers.tasks.entries())
      const next = entries.find(([, task]) => task.type === 'timeout')
      if (!next) break
      timers.run(next[0])
      if (page.data.introFading) fadingReached = true
    }
    assert.strictEqual(fadingReached, true)
    assert.strictEqual(page.data.showIntro, false)
    assert.strictEqual(page.data.introFading, false)
  })
})

test('index share: 分享画布按需挂载，重复点击不会并行导出', () => {
  withIndexPage(({ page, share }) => {
    page.setData({ currentResult: { name: '红烧肉', emoji: '🍖', category: '家常菜', scene: '自己做', budget: '💰💰' } })
    page.onShareResult()
    page.onShareResult()
    assert.strictEqual(share.selectorCount, 1)
    assert.strictEqual(share.exports.length, 1)
    assert.strictEqual(page.data.shareCanvasMounted, true)
    share.exports[0].success({ tempFilePath: 'tmp.png' })
    assert.strictEqual(page.data.shareCanvasMounted, false)
    assert.strictEqual(page._shareBusy, false)
    assert.strictEqual(share.canvas.width, 1)
    assert.strictEqual(share.saves.length, 1)
  })
})

test('index share: 页面隐藏后释放画布并忽略晚到的导出回调', () => {
  withIndexPage(({ page, share }) => {
    page.setData({ currentResult: { name: '红烧肉', emoji: '🍖', category: '家常菜', scene: '自己做', budget: '💰💰' } })
    page.onShareResult()
    assert.strictEqual(share.exports.length, 1)
    page.onHide()
    assert.strictEqual(page.data.shareCanvasMounted, false)
    assert.strictEqual(share.canvas.width, 1)
    share.exports[0].success({ tempFilePath: 'late.png' })
    assert.strictEqual(share.saves.length, 0)
  })
})
