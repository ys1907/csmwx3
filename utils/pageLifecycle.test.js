const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

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

  clear(id) {
    this.tasks.delete(id)
  }

  count(type, delay) {
    return Array.from(this.tasks.values()).filter(task => {
      return (!type || task.type === type) && (delay === undefined || task.delay === delay)
    }).length
  }

  runTimeout(delay) {
    const entry = Array.from(this.tasks.entries()).find(([, task]) => {
      return task.type === 'timeout' && (delay === undefined || task.delay === delay)
    })
    if (!entry) throw new Error(`missing timeout: ${delay}`)
    this.tasks.delete(entry[0])
    entry[1].fn()
  }

  run(id) {
    const task = this.tasks.get(id)
    if (!task) throw new Error(`missing task: ${id}`)
    if (task.type === 'timeout') this.tasks.delete(id)
    task.fn()
  }

  runInterval() {
    const entry = Array.from(this.tasks.values()).find(task => task.type === 'interval')
    if (!entry) throw new Error('missing interval')
    entry.fn()
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

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
    Page: global.Page,
    wx: global.wx,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
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
    selectorCount: 0,
    exports: [],
    saves: [],
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
    getStorageSync: key => {
      storageReads.push(key)
      return storage.has(key) ? storage.get(key) : ''
    },
    setStorageSync: (key, value) => {
      storageWrites.push(key)
      storage.set(key, value)
    },
    getSystemInfoSync: () => ({ theme: 'light' }),
    onThemeChange: fn => {
      themeHandler = fn
      return () => { themeHandler = null }
    },
    createInnerAudioContext: () => {
      const audio = {
        stopCount: 0,
        playCount: 0,
        destroyCount: 0,
        stop() { this.stopCount++ },
        play() { this.playCount++ },
        destroy() { this.destroyCount++ },
      }
      audios.push(audio)
      return audio
    },
    showToast() {},
    vibrateShort() {},
    navigateTo() {},
    nextTick: fn => fn(),
    createSelectorQuery: () => ({
      select() { share.selectorCount++; return this },
      fields() { return this },
      exec(fn) { fn([{ node: share.canvas, size: true }]) },
    }),
    canvasToTempFilePath: options => share.exports.push(options),
    saveImageToPhotosAlbum: options => {
      share.saves.push(options)
      if (options.success) options.success()
    },
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

function switchMode(page, mode) {
  page.switchTab({ currentTarget: { dataset: { mode } } })
}

test('index lifecycle: 盲盒快速连点只保留一个任务，离开玩法后清空', () => {
  withIndexPage(({ page, timers }) => {
    switchMode(page, 'blindbox')
    for (let i = 0; i < 5; i++) page.openBlindbox()
    assert.strictEqual(timers.count('timeout', 800), 1)
    switchMode(page, 'week')
    assert.ok(page._blindboxTimer == null)
    assert.ok(page._blindboxRevealTimer == null)
  })
})

test('index lifecycle: 自由旋转隐藏后暂停，返回前台后恢复', () => {
  withIndexPage(({ page, timers }) => {
    switchMode(page, 'wheel')
    page.spinWheel()
    assert.strictEqual(timers.count('interval'), 1)
    page.onHide()
    assert.strictEqual(timers.count('interval'), 0)
    assert.strictEqual(page.data.isSpinning, false)
    page.onShow()
    assert.strictEqual(timers.count('interval'), 1)
    assert.strictEqual(page.data.isSpinning, true)
  })
})

test('index lifecycle: 转盘减速阶段隐藏后，返回前台直接揭晓', () => {
  withIndexPage(({ page, timers }) => {
    switchMode(page, 'wheel')
    page.spinWheel()
    page.stopWheel()
    assert.strictEqual(timers.count('timeout', 32), 1)
    page.onHide()
    assert.strictEqual(timers.count('timeout', 32), 0)
    page.onShow()
    assert.strictEqual(page.data.showResult, true)
    assert.strictEqual(page.data.isSpinning, false)
  })
})

test('index lifecycle: 盲盒揭晓等待阶段隐藏后，返回前台直接揭晓', () => {
  withIndexPage(({ page, timers }) => {
    switchMode(page, 'blindbox')
    page.openBlindbox()
    timers.run(page._blindboxTimer)
    assert.ok(page._blindboxRevealTimer)
    page.onHide()
    assert.strictEqual(page._blindboxRevealTimer, null)
    page.onShow()
    assert.strictEqual(page.data.showResult, true)
    assert.strictEqual(page.data.blindboxOpened, true)
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

test('index lifecycle: 卸载后定时器归零且音效对象销毁', () => {
  withIndexPage(({ page, timers, audios }) => {
    switchMode(page, 'wheel')
    page.spinWheel()
    timers.runInterval()
    assert.strictEqual(audios.length, 1)
    page.onUnload()
    assert.strictEqual(timers.tasks.size, 0)
    assert.strictEqual(audios[0].destroyCount, 1)
  })
})

test('index data: 历史、收藏和塔罗过滤函数不进入渲染层', () => {
  withIndexPage(({ page }) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(page.data, 'history'), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(page.data, 'favorites'), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(page.data, 'tarotFortuneObj'), false)
    assert.ok(Array.isArray(page._history))
    assert.ok(Array.isArray(page._favorites))
  })
})

test('index storage: 连续换推荐再决定，不重复读缓存且写入延迟合并为三个 key', () => {
  withIndexPage(({ page, timers, storageReads, storageWrites }) => {
    page.flushPendingWrites()
    storageReads.length = 0
    storageWrites.length = 0
    // 「换一个」=浏览：连点 50 次，退场/进场动画互相打断，仅末次的数据更新阶段存活。
    // 期间过滤集走 _filteredCache（0 读），rollWeek 的写入经 queueStorageWrite 延迟（0 同步写）。
    for (let i = 0; i < 50; i++) page.onRollWeekTap()
    assert.strictEqual(storageReads.length, 0)
    assert.strictEqual(storageWrites.length, 0)
    // 运行末次动画的数据更新阶段：rollWeek 把本次推荐排队（weekFood / weekFoodDate），仍不落盘。
    timers.runTimeout(150)
    // 「就吃这个」=决定：唯有此路径才把推荐写入历史（与浏览区分），同样进延迟队列。
    page.showWeekResult()
    assert.strictEqual(storageReads.length, 0)
    assert.strictEqual(storageWrites.length, 0)
    // flush 后三个 key 一次性合并落盘。
    page.flushPendingWrites()
    assert.deepStrictEqual(storageWrites.sort(), [
      'wtec_history_v3',
      'wtec_week_food',
      'wtec_week_food_date',
    ])
  })
})

test('index startup: 首屏不提前初始化隐藏玩法，进入后再准备数据', () => {
  withIndexPage(({ page }) => {
    assert.deepStrictEqual(page.data.wheelPool, [])
    assert.deepStrictEqual(page.data.tarotAssigned, [])
    switchMode(page, 'wheel')
    assert.strictEqual(page.data.wheelPool.length, 8)
    switchMode(page, 'tarot')
    assert.strictEqual(page.data.tarotAssigned.length, 3)
  })
})

test('index startup: 启动页随 initData 完成淡出，最短 600ms', () => {
  withIndexPage(({ page, timers }) => {
    assert.strictEqual(page.data.showIntro, true)
    assert.strictEqual(page.data.introFading, false)
    let fadingReached = false
    // 依次运行所有 timeout（finishIntro 延迟 + 淡出 + 保险）
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
    page.setData({
      currentResult: { name: '红烧肉', emoji: '🍖', category: '家常菜', scene: '自己做', budget: '💰💰' }
    })
    page.onShareResult()
    page.onShareResult()
    assert.strictEqual(share.selectorCount, 1)
    assert.strictEqual(share.exports.length, 1)
    assert.strictEqual(page.data.shareCanvasMounted, true)
    share.exports[0].success({ tempFilePath: 'tmp.png' })
    assert.strictEqual(page.data.shareCanvasMounted, false)
    assert.strictEqual(page._shareBusy, false)
    assert.strictEqual(share.canvas.width, 1)
    assert.strictEqual(share.canvas.height, 1)
    assert.strictEqual(share.saves.length, 1)
  })
})

test('index share: 页面隐藏后释放画布并忽略晚到的导出回调', () => {
  withIndexPage(({ page, share }) => {
    page.setData({
      currentResult: { name: '红烧肉', emoji: '🍖', category: '家常菜', scene: '自己做', budget: '💰💰' }
    })
    page.onShareResult()
    assert.strictEqual(share.exports.length, 1)
    page.onHide()
    assert.strictEqual(page.data.shareCanvasMounted, false)
    assert.strictEqual(share.canvas.width, 1)
    assert.strictEqual(share.canvas.height, 1)
    share.exports[0].success({ tempFilePath: 'late.png' })
    assert.strictEqual(share.saves.length, 0)
  })
})
