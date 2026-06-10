const util = require('../../utils/util.js')
const foodsData = require('../../data/foods.js')
const { DING_SOUND } = require('../../data/sounds.js')
const { safeGet, safeSet } = require('../../utils/storage.js')
const foodLogic = require('../../utils/foodLogic.js')
const foodRepo = require('../../utils/foodRepo.js')
const {
  STORAGE_KEYS,
  SCENE_OPTIONS,
  BUDGET_OPTIONS,
  TIME_OPTIONS,
  TASTE_OPTIONS,
  AVOID_TAG_OPTIONS,
} = require('../../data/options.js')

const STORAGE_FLUSH_DELAY_MS = 250

// 三档揭晓动画时长（与 index.wxss 的 keyframes 总时长保持一致）
const REVEAL_DURATION = { R: 900, SR: 1600, SSR: 2600 }

Page({
  data: {
    // ===== 顶层导航 =====
    activeTab: 'home',          // home=推荐(盲盒) | mine=我的
    // ===== 盲盒状态机 =====
    boxPhase: 'idle',           // idle=待揭晓 | revealing=动画中 | revealed=已出菜
    revealRarity: '',           // '' | R | SR | SSR
    auraClass: '',              // SSR 暖色光氛
    currentResult: null,
    currentResultIsFav: false,
    resultReason: '',
    // ===== 头部 / 启动 =====
    headerDate: '',
    showIntro: true,
    introFading: false,
    darkMode: false,
    // ===== 筛选 =====
    filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' },
    excludeRecent: true,
    requireMeal: true,
    filterSummary: '未筛选',
    hasActiveFilters: false,
    showFilterSheet: false,
    showPickerSheet: false,
    pickerTitle: '',
    pickerOptions: [],
    pickerType: '',
    pickerActiveIdx: 0,
    sceneOptions: SCENE_OPTIONS,
    budgetOptions: BUDGET_OPTIONS,
    timeOptions: TIME_OPTIONS,
    tasteOptions: TASTE_OPTIONS,
    avoidOptions: AVOID_TAG_OPTIONS,
    // ===== 凑一桌 =====
    comboResult: [],
    showCombo: false,
    comboClosing: false,
    // ===== 我的 =====
    mineProfile: null,
    mineStreak: null,
    mineHistory: [],
    mineFavorites: [],
    mineSsrDex: [],
    // ===== 分享 =====
    shareCanvasMounted: false,
  },

  // ========== 生命周期 ==========

  onLoad() {
    this._isPageVisible = true
    this._introStartTs = Date.now()
    this.initData()
    const baseInfo = (wx.getAppBaseInfo && wx.getAppBaseInfo()) || {}
    this.setData({ darkMode: baseInfo.theme === 'dark' })
    // wx.onThemeChange 无返回值，解绑必须用 wx.offThemeChange(listener)
    this._themeListener = (res) => {
      const darkMode = res.theme === 'dark'
      if (this._isPageVisible) this.setData({ darkMode })
      else this._pendingDarkMode = darkMode
    }
    if (wx.onThemeChange) wx.onThemeChange(this._themeListener)
    this._introMaxTimer = setTimeout(() => this.finishIntro(true), 1800)
  },

  onShow() {
    this._isPageVisible = true
    if (this._everShown) this.refreshFromStorage()
    this._everShown = true
    if (typeof this._pendingDarkMode === 'boolean') {
      this.setData({ darkMode: this._pendingDarkMode })
      this._pendingDarkMode = null
    }
    this.resumePausedTasks()
  },

  onHide() {
    this._isPageVisible = false
    this.flushPendingWrites()
    this.pauseActiveTasks()
    this.settleInterruptedSheets()
    this.releaseShareCanvas()
    this.stopAudio()
  },

  onUnload() {
    this._isPageVisible = false
    this.flushPendingWrites()
    this.clearTimer('_revealTimer')
    this.clearTimer('_introDelayTimer')
    this.clearTimer('_introMaxTimer')
    this.clearTimer('_introFadeTimer')
    this.clearTimer('_comboCloseTimer')
    this.clearTimer('_storageFlushTimer')
    this.clearTimer('_shareMountTimer')
    this.releaseShareCanvas(false)
    this.stopAudio()
    if (this._dingAudio) { this._dingAudio.destroy(); this._dingAudio = null }
    if (this._themeListener && wx.offThemeChange) { wx.offThemeChange(this._themeListener) }
    this._themeListener = null
  },

  onShareAppMessage() {
    const { currentResult } = this.data
    if (currentResult) {
      return { title: `今天推荐：${currentResult.emoji} ${currentResult.name}`, path: '/pages/index/index' }
    }
    return { title: '到底吃点啥 · 情侣版', path: '/pages/index/index' }
  },

  clearTimer(name) {
    if (!this[name]) return
    clearTimeout(this[name])
    this[name] = null
  },

  stopAudio() {
    if (this._dingAudio) this._dingAudio.stop()
  },

  // 后台时把正在退出的凑一桌 Sheet 收尾，避免回前台残留
  settleInterruptedSheets() {
    this.clearTimer('_comboCloseTimer')
    if (this.data.comboClosing) {
      this.setData({ showCombo: false, comboClosing: false })
    }
  },

  // 揭晓动画途中切后台：记住待揭晓内容并暂停定时器，回前台直接揭晓
  pauseActiveTasks() {
    if (this.data.boxPhase === 'revealing' && this._pendingReveal) {
      this._pausedReveal = this._pendingReveal
      this.clearTimer('_revealTimer')
    }
  },

  resumePausedTasks() {
    if (this._pausedReveal) {
      this._pendingReveal = this._pausedReveal
      this._pausedReveal = null
      this.finishReveal()
    }
  },

  // ========== 初始化 ==========

  initData() {
    this._foods = foodRepo.loadFoods(foodsData)
    this._filteredCache = null
    this._cacheKey = ''
    this._nameIndex = null
    this._foodsRev = foodRepo.getFoodsRev()

    this._history = safeGet(STORAGE_KEYS.history, [])
    this._favorites = safeGet(STORAGE_KEYS.favorites, [])
    this._cooldownFamilyPicks = safeGet(STORAGE_KEYS.cooldownFamilyPicks, {})
    this._ssrPity = safeGet(STORAGE_KEYS.ssrPity, 0)
    this._ssrCollection = safeGet(STORAGE_KEYS.ssrCollection, [])

    this.setData({ headerDate: util.formatDate(new Date(), true) }, () => {
      this.updateFilterSummary()
      this.finishIntro()
    })
  },

  finishIntro(force) {
    if (!this.data.showIntro || this.data.introFading) return
    const elapsed = Date.now() - (this._introStartTs || Date.now())
    const MIN_INTRO_MS = 600
    if (!force && elapsed < MIN_INTRO_MS) {
      this._introDelayTimer = setTimeout(() => this.finishIntro(true), MIN_INTRO_MS - elapsed)
      return
    }
    this.setData({ introFading: true })
    this._introFadeTimer = setTimeout(() => {
      this.setData({ showIntro: false, introFading: false })
    }, 300)
  },

  refreshFromStorage() {
    const rev = foodRepo.getFoodsRev()
    if (rev !== this._foodsRev) {
      this._foods = foodRepo.loadFoods(foodsData)
      this._nameIndex = null
      this._foodsRev = rev
    }
    this._history = safeGet(STORAGE_KEYS.history, [])
    this._favorites = safeGet(STORAGE_KEYS.favorites, [])
    this.invalidateCache()
  },

  // ========== 存储（延迟合并写入） ==========

  queueStorageWrite(key, value) {
    if (!this._pendingStorageWrites) this._pendingStorageWrites = {}
    this._pendingStorageWrites[key] = value
    this.clearTimer('_storageFlushTimer')
    this._storageFlushTimer = setTimeout(() => {
      this._storageFlushTimer = null
      this.flushPendingWrites()
    }, STORAGE_FLUSH_DELAY_MS)
  },

  flushPendingWrites() {
    this.clearTimer('_storageFlushTimer')
    const writes = this._pendingStorageWrites
    this._pendingStorageWrites = null
    if (!writes) return
    Object.keys(writes).forEach(key => safeSet(key, writes[key]))
  },

  // ========== 过滤与缓存（实例缓存，不经 setData） ==========

  invalidateCache() {
    this._filteredCache = null
    this._cacheKey = ''
  },

  // opts.requireMeal 可覆盖页面默认（凑一桌传 false 放行配菜/汤品）；缓存键含 r 字段，两种池互不串。
  // 过滤与四级回退的决策逻辑在 foodLogic.filterFoodsWithFallback，这里只负责读 data、拼缓存键、查/存缓存。
  getFilteredFoods(opts) {
    const { filters, excludeRecent } = this.data
    const requireMeal = (opts && typeof opts.requireMeal === 'boolean') ? opts.requireMeal : this.data.requireMeal
    const history = this._history || []
    const now = Date.now()
    const mealPeriod = foodLogic.inferMealPeriod(now)
    let recentPart = ''
    if (excludeRecent) {
      recentPart = history
        .filter(h => { const d = new Date(h.date).getTime(); return !Number.isNaN(d) && now - d <= foodLogic.THREE_DAYS })
        .map(h => h.name).join('\x00')
    }
    const key = JSON.stringify({ s: filters.sceneIdx, b: filters.budgetIdx, t: filters.timeIdx, ta: filters.tasteIdx, a: filters.avoid, e: excludeRecent, r: requireMeal, m: mealPeriod, h: recentPart })
    if (this._filteredCache && this._cacheKey === key) return this._filteredCache

    // 注入场景名以启用渠道硬过滤（剔除该场景下可得性为低/极低的菜）
    const sceneName = filters.sceneIdx > 0 ? SCENE_OPTIONS[filters.sceneIdx] : null
    const baseFilters = { ...filters, requireMeal, scene: sceneName }
    const result = foodLogic.filterFoodsWithFallback(this._foods, baseFilters, mealPeriod, { excludeRecent, history, now })
    this._filteredCache = result
    this._cacheKey = key
    return result
  },

  buildPrefs() {
    const favorites = this._favorites || []
    const history = this._history || []
    const favoriteSet = new Set(favorites.map(f => f.name))
    const tasteCounts = {}
    const bump = tags => (tags || []).forEach(t => { tasteCounts[t] = (tasteCounts[t] || 0) + 1 })
    favorites.forEach(f => bump(f.tags))
    const nameIndex = this._nameIndex || (this._nameIndex = new Map(this._foods.map(f => [f.name, f])))
    history.forEach(h => { const f = nameIndex.get(h.name); if (f) bump(f.tags) })
    return {
      favoriteSet,
      tasteCounts,
      rejectedSet: this._rejected || (this._rejected = new Set()),
      cooldownFamilyPicks: this._cooldownFamilyPicks || {},
    }
  },

  buildCtx() {
    const { filters } = this.data
    const scene = filters.sceneIdx > 0 ? SCENE_OPTIONS[filters.sceneIdx] : null
    // 季节弱信号：按当前月份注入 weatherTags（纯本地，零依赖）
    const weatherTags = foodLogic.inferSeason()
    return { scene, weatherTags, now: Date.now() }
  },

  noteRejected(food) {
    if (!food) return
    if (!this._rejected) this._rejected = new Set()
    this._rejected.add(food.name)
  },

  candidatePool(base) {
    let pool = base || this.getFilteredFoods()
    if (this._rejected && this._rejected.size > 0 && pool.length > 1) {
      const without = pool.filter(f => !this._rejected.has(f.name))
      if (without.length > 0) pool = without
    }
    return pool
  },

  pickRandom(fromPool) {
    const pool = fromPool || this.candidatePool()
    return foodLogic.weightedPick(pool, this.buildPrefs(), null, this.buildCtx())
  },

  // ========== 盲盒揭晓（核心） ==========

  onTapBox() {
    if (this.data.boxPhase !== 'idle') return
    const food = this.pickRandom()
    if (!food) { wx.showToast({ title: '没有符合条件的食物', icon: 'none' }); return }
    const roll = foodLogic.rollRarityWithPity(this._ssrPity)   // 伪概率保底，与 food 无关
    const rarity = roll.rarity
    // 保底计数到 finishReveal 才提交：动画途中进程被杀不白扣保底
    const isFav = (this._favorites || []).some(f => f.name === food.name)
    const resultReason = foodLogic.buildRichReason(food, this.buildCtx())
    this._pendingReveal = { food, rarity, isFav, resultReason, pityAfter: roll.ssrPity }
    this.setData({ boxPhase: 'revealing', revealRarity: rarity, auraClass: rarity === 'SSR' ? 'aura-SSR' : '' })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    this.clearTimer('_revealTimer')
    this._revealTimer = setTimeout(() => {
      this._revealTimer = null
      this.finishReveal()
    }, REVEAL_DURATION[rarity] || 900)
  },

  finishReveal() {
    const p = this._pendingReveal
    if (!p) return
    this._pendingReveal = null
    this._ssrPity = p.pityAfter
    this.queueStorageWrite(STORAGE_KEYS.ssrPity, p.pityAfter)
    this.playDing()
    if (p.rarity !== 'R' && wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
    this.setData({
      boxPhase: 'revealed',
      currentResult: p.food,
      currentResultIsFav: p.isFav,
      resultReason: p.resultReason,
      auraClass: '',
    })
    this.addToHistory(p.food)
    if (p.rarity === 'SSR') this.addToSsrCollection(p.food)
  },

  onRetry() {
    this.noteRejected(this.data.currentResult)
    this.clearTimer('_revealTimer')
    this._pendingReveal = null
    this.setData({ boxPhase: 'idle', currentResult: null, revealRarity: '', auraClass: '' })
    const restart = () => this.onTapBox()
    if (wx.nextTick) wx.nextTick(restart)
    else setTimeout(restart, 0)
  },

  onConfirmEat() {
    const { currentResult } = this.data
    if (currentResult) wx.showToast({ title: `就吃 ${currentResult.name}`, icon: 'none' })
  },

  // ========== 历史 / 收藏 ==========

  addToHistory(food) {
    if (!food) return
    const history = [{ name: food.name, emoji: food.emoji, date: new Date().toISOString() }, ...(this._history || [])]
    if (history.length > 50) history.length = 50
    this._history = history
    if (food.cooldownFamilyId) {
      if (!this._cooldownFamilyPicks) this._cooldownFamilyPicks = {}
      this._cooldownFamilyPicks[food.cooldownFamilyId] = Date.now()
      this.queueStorageWrite(STORAGE_KEYS.cooldownFamilyPicks, this._cooldownFamilyPicks)
    }
    this.invalidateCache()
    this.queueStorageWrite(STORAGE_KEYS.history, history)
  },

  // 抽到 SSR 记入图鉴（同名去重，存本地缓存）
  addToSsrCollection(food) {
    if (!food) return
    const col = this._ssrCollection || []
    if (col.some(c => c.name === food.name)) return
    this._ssrCollection = [{ name: food.name, emoji: food.emoji, category: food.category, date: new Date().toISOString() }, ...col]
    this.queueStorageWrite(STORAGE_KEYS.ssrCollection, this._ssrCollection)
  },

  onToggleFav() {
    const { currentResult } = this.data
    const favorites = this._favorites || []
    if (!currentResult) return
    const idx = favorites.findIndex(f => f.name === currentResult.name)
    let newFavorites
    if (idx >= 0) { newFavorites = favorites.slice(); newFavorites.splice(idx, 1) }
    else newFavorites = [...favorites, currentResult]
    this._favorites = newFavorites
    this.setData({ currentResultIsFav: idx < 0 })
    safeSet(STORAGE_KEYS.favorites, newFavorites)
  },

  // ========== 凑一桌 ==========

  buildCombo() {
    // 放宽「可成餐」限制：配菜/汤品可作为第 2、3 道入选（buildMealCombo 保证至少一道正餐）
    const filtered = this.getFilteredFoods({ requireMeal: false })
    if (filtered.length === 0) { wx.showToast({ title: '没有符合条件的食物', icon: 'none' }); return }
    this.clearTimer('_comboCloseTimer')
    this.setData({
      comboResult: foodLogic.buildMealCombo(filtered, 3),
      showCombo: true,
      comboClosing: false,
    })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  closeCombo() {
    if (this.data.comboClosing) return
    this.clearTimer('_comboCloseTimer')
    this.setData({ comboClosing: true })
    this._comboCloseTimer = setTimeout(() => {
      this._comboCloseTimer = null
      this.setData({ showCombo: false, comboClosing: false })
    }, 220)
  },

  onModalContentTap() {},

  // ========== 我的 tab ==========

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === 'mine') {
      const history = this._history || []
      this.setData({
        activeTab: 'mine',
        mineProfile: foodLogic.buildTasteProfile(history, this._favorites || [], this._foods || []),
        mineStreak: foodLogic.computeStreak(history, Date.now()),
        mineHistory: history.slice(0, 20).map(h => ({ ...h, dateStr: h.date ? util.formatDate(new Date(h.date)) : '' })),
        mineFavorites: this._favorites || [],
        mineSsrDex: (this._ssrCollection || []).map(c => ({ ...c, dateStr: c.date ? util.formatDate(new Date(c.date)) : '' })),
      })
    } else {
      this.setData({ activeTab: 'home' })
    }
  },

  goToManage() {
    wx.navigateTo({ url: '/pages/manage/manage' })
  },

  // ========== 筛选 ==========

  updateFilterSummary() {
    const { filters, excludeRecent } = this.data
    const parts = []
    if (filters.sceneIdx > 0) parts.push(this.data.sceneOptions[filters.sceneIdx])
    if (filters.budgetIdx > 0) parts.push(this.data.budgetOptions[filters.budgetIdx])
    if (filters.timeIdx > 0) parts.push(this.data.timeOptions[filters.timeIdx])
    if (filters.tasteIdx > 0) parts.push(this.data.tasteOptions[filters.tasteIdx])
    if (filters.avoid) parts.push('避免' + filters.avoid)
    if (excludeRecent) parts.push('排除近期')
    const hasActiveFilters = parts.length > 0
    this.setData({ filterSummary: hasActiveFilters ? parts.join(' · ') : '未筛选', hasActiveFilters })
  },

  applyFilterChange() {
    if (this._rejected) this._rejected.clear()
    this.invalidateCache()
    // 换筛选 = 新语境，回到盲盒待揭晓
    if (this.data.boxPhase !== 'idle') {
      this.clearTimer('_revealTimer')
      this._pendingReveal = null
      this.setData({ boxPhase: 'idle', currentResult: null, revealRarity: '', auraClass: '' })
    }
    this.updateFilterSummary()
  },

  onSceneChange(e) { this.setData({ 'filters.sceneIdx': e.detail.value }, () => this.applyFilterChange()) },
  onBudgetChange(e) { this.setData({ 'filters.budgetIdx': e.detail.value }, () => this.applyFilterChange()) },
  onTimeChange(e) { this.setData({ 'filters.timeIdx': e.detail.value }, () => this.applyFilterChange()) },
  onTasteChange(e) { this.setData({ 'filters.tasteIdx': e.detail.value }, () => this.applyFilterChange()) },
  onToggleExclude() { this.setData({ excludeRecent: !this.data.excludeRecent }, () => this.applyFilterChange()) },

  resetFilters() {
    this.setData({
      filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' },
      excludeRecent: true,
    }, () => this.applyFilterChange())
  },

  openFilterSheet() { this.setData({ showFilterSheet: true, showCombo: false }) },
  closeFilterSheet() { this.setData({ showFilterSheet: false }) },
  onResetFromSheet() { this.resetFilters(); this.closeFilterSheet() },

  openAvoidPicker() {
    this.setData({ showPickerSheet: true, pickerTitle: '选择要避免的口味', pickerOptions: this.data.avoidOptions, pickerType: 'avoid', pickerActiveIdx: this.data.avoidOptions.indexOf(this.data.filters.avoid || '无') })
  },
  onAvoidChange(e) {
    const val = this.data.avoidOptions[e.detail.value]
    this.setData({ 'filters.avoid': val === '无' ? '' : val }, () => this.applyFilterChange())
  },
  openScenePicker() { this.setData({ showPickerSheet: true, pickerTitle: '选择场景', pickerOptions: this.data.sceneOptions, pickerType: 'scene', pickerActiveIdx: this.data.filters.sceneIdx }) },
  openBudgetPicker() { this.setData({ showPickerSheet: true, pickerTitle: '选择预算', pickerOptions: this.data.budgetOptions, pickerType: 'budget', pickerActiveIdx: this.data.filters.budgetIdx }) },
  openTimePicker() { this.setData({ showPickerSheet: true, pickerTitle: '选择时间', pickerOptions: this.data.timeOptions, pickerType: 'time', pickerActiveIdx: this.data.filters.timeIdx }) },
  openTastePicker() { this.setData({ showPickerSheet: true, pickerTitle: '选择口味', pickerOptions: this.data.tasteOptions, pickerType: 'taste', pickerActiveIdx: this.data.filters.tasteIdx }) },
  closePickerSheet() { this.setData({ showPickerSheet: false }) },
  onPickerSelect(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const { pickerType } = this.data
    this.setData({ showPickerSheet: false })
    if (pickerType === 'scene') this.onSceneChange({ detail: { value: idx } })
    else if (pickerType === 'budget') this.onBudgetChange({ detail: { value: idx } })
    else if (pickerType === 'time') this.onTimeChange({ detail: { value: idx } })
    else if (pickerType === 'taste') this.onTasteChange({ detail: { value: idx } })
    else if (pickerType === 'avoid') this.onAvoidChange({ detail: { value: idx } })
  },

  // ========== 音效 ==========

  playDing() {
    if (!this._dingAudio) {
      this._dingAudio = wx.createInnerAudioContext()
      this._dingAudio.src = DING_SOUND
      this._dingAudio.volume = 0.5
    }
    this._dingAudio.stop()
    this._dingAudio.play()
  },

  // ========== 分享卡片 ==========

  onShareResult() {
    const { currentResult } = this.data
    if (!currentResult || this._shareBusy) return
    this._shareBusy = true
    const requestId = (this._shareRequestId || 0) + 1
    this._shareRequestId = requestId
    this.setData({ shareCanvasMounted: true }, () => {
      const start = () => this.drawShareCard(currentResult, requestId)
      if (wx.nextTick) wx.nextTick(start)
      else this._shareMountTimer = setTimeout(() => { this._shareMountTimer = null; start() }, 0)
    })
  },

  drawShareCard(currentResult, requestId) {
    if (!this._isPageVisible || requestId !== this._shareRequestId) return
    const query = wx.createSelectorQuery()
    query.select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!this._isPageVisible || requestId !== this._shareRequestId) return
      if (!res[0] || !res[0].node) {
        wx.showToast({ title: '画布初始化失败', icon: 'none' })
        this.releaseShareCanvas()
        return
      }
      try {
        const canvas = res[0].node
        this._shareCanvasNode = canvas
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
        const w = 600, h = 800
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)
        const drawRoundRect = function(c, x, y, rw, rh, r) {
          if (rw < 2 * r) r = rw / 2
          if (rh < 2 * r) r = rh / 2
          c.moveTo(x + r, y)
          c.lineTo(x + rw - r, y); c.arcTo(x + rw, y, x + rw, y + rh, r)
          c.lineTo(x + rw, y + rh - r); c.arcTo(x + rw, y + rh, x, y + rh, r)
          c.lineTo(x + r, y + rh); c.arcTo(x, y + rh, x, y, r)
          c.lineTo(x, y + r); c.arcTo(x, y, x + rw, y, r)
          c.closePath()
        }
        ctx.fillStyle = '#FCF7F1'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#fff'
        ctx.beginPath(); drawRoundRect(ctx, 40, 40, w - 80, h - 80, 32); ctx.fill()
        ctx.strokeStyle = '#FF9466'
        ctx.lineWidth = 4
        ctx.beginPath(); ctx.moveTo(w / 2 - 60, 120); ctx.lineTo(w / 2 + 60, 120); ctx.stroke()
        ctx.font = '120px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(currentResult.emoji, w / 2, 280)
        ctx.fillStyle = '#4A3F3A'; ctx.font = 'bold 48px sans-serif'
        ctx.fillText(currentResult.name, w / 2, 380)
        ctx.fillStyle = '#9B8D85'; ctx.font = '28px sans-serif'
        ctx.fillText(`${currentResult.category} · ${currentResult.scene} · ${currentResult.budget}`, w / 2, 440)
        ctx.fillStyle = '#B8ADA3'; ctx.font = '24px sans-serif'
        ctx.fillText('今天这顿，交给运气', w / 2, 520)
        ctx.fillText('到底吃点啥 · 情侣版', w / 2, 560)
        ctx.fillStyle = '#FBEAF1'
        ctx.beginPath(); ctx.arc(w / 2, 660, 50, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#B8ADA3'; ctx.font = '20px sans-serif'
        ctx.fillText('扫码一起决定', w / 2, 740)
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => {
            if (requestId !== this._shareRequestId) return
            this.releaseShareCanvas()
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
              fail: (err) => {
                // 授权被永久拒绝后 wx 不再弹授权框，必须引导用户去设置页手动打开
                if (err.errMsg && err.errMsg.indexOf('auth') > -1) {
                  wx.showModal({
                    title: '需要相册权限',
                    content: '保存分享图需要相册权限，去设置中打开？',
                    confirmText: '去设置',
                    success: (r) => { if (r.confirm && wx.openSetting) wx.openSetting() },
                  })
                }
                wx.previewImage({ urls: [res.tempFilePath] })
              },
            })
          },
          fail: (err) => {
            if (requestId !== this._shareRequestId) return
            this.releaseShareCanvas()
            wx.showToast({ title: '图片生成失败：' + (err.errMsg || ''), icon: 'none' })
          },
        })
      } catch (e) {
        this.releaseShareCanvas()
        wx.showToast({ title: '生成失败：' + (e.message || ''), icon: 'none' })
      }
    })
  },

  releaseShareCanvas(updateView) {
    this.clearTimer('_shareMountTimer')
    this._shareRequestId = (this._shareRequestId || 0) + 1
    this._shareBusy = false
    if (this._shareCanvasNode) {
      this._shareCanvasNode.width = 1
      this._shareCanvasNode.height = 1
      this._shareCanvasNode = null
    }
    if (updateView !== false && this.data.shareCanvasMounted) {
      this.setData({ shareCanvasMounted: false })
    }
  },
})
