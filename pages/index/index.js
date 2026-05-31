const util = require('../../utils/util.js')
const foodsData = require('../../data/foods.js')
const { TICK_SOUND, DING_SOUND } = require('../../data/sounds.js')
const { safeGet, safeSet } = require('../../utils/storage.js')
const foodLogic = require('../../utils/foodLogic.js')
const {
  APP_VERSION,
  STORAGE_KEYS,
  SCENE_OPTIONS,
  BUDGET_OPTIONS,
  TIME_OPTIONS,
  CATEGORY_OPTIONS,
  WEEK_THEMES,
  TASTE_OPTIONS,
  AVOID_TAG_OPTIONS,
  WEEK_THEME_TAGS
} = require('../../data/options.js')

const TAROT_FORTUNES = [
  { title: '✨ 天使之恩', text: '今天的食运充沛，选的这道菜能带来好心情，适合两人一起享用。', filter: () => true },
  { title: '🔥 烈焰之力', text: '今天需要热情的味道，较重口的菜式能点燃你们的胃口。', filter: (f) => f.tags && f.tags.includes('辣') || f.category === '火锅烧烤' },
  { title: '🌙 月光之静', text: '今天适合清淡一些，养胃又舒心，适合安静的二人时光。', filter: (f) => f.time === '慢' || f.category === '轻食' || (f.tags && f.tags.includes('清淡')) },
  { title: '💫 星辰之光', text: '今天是探索新味道的好日子，大胆尝试吧！', filter: (f) => f.scene === '堂食' || (f.tags && f.tags.includes('鲜')) },
  { title: '🌊 海洋之心', text: '今天适合鲜味，海鲜或清新的口感会让你们满足。', filter: (f) => (f.tags && f.tags.includes('鲜')) || /鱼|虾|蟹|贝|海鲜/.test(f.name) },
  { title: '🌱 大地之恩', text: '今天适合实在的味道，主食或家常菜最佳。', filter: (f) => f.category === '中式快餐' || f.category === '家常菜' || f.category === '火锅烧烤' },
  { title: '⚡ 雷电之力', text: '今天需要快速充能，方便又好吃的是首选。', filter: (f) => f.time === '快' || f.scene === '外卖' }
]

const PK_CATEGORIES = ['辣', '甜', '酸', '鲜', '香', '脆', '肉', '素']

const PK_PUNISHMENTS = [
  { match: true, text: '默契成功！今晚由 TA 请客 🎉' },
  { match: true, text: '心灵相通！奖励一个拥抱 🤗' },
  { match: true, text: '天作之合！一起点份大餐庆祝 🍾' },
  { match: true, text: '默契满分！下次约会地点由赢的人选 🎯' },
  { match: true, text: '心有灵犀！今晚的奶茶由输的人买 🧋' },
  { match: false, text: '默契失败，输的人洗碗 🍽️' },
  { match: false, text: '意见不合，猜拳决定谁下楼买饭 ✊' },
  { match: false, text: '没有默契… 输的人负责倒垃圾 🗑️' },
  { match: false, text: '各执一词，各买各的，看谁先馋 😋' },
  { match: false, text: '默契值为零，一起做家务换大餐吧 🧹' }
]

Page({
  data: {
    // 渲染层状态（食物全集与过滤缓存改为实例属性，不进 data，避免跨渲染层序列化大数组）
    history: [],
    favorites: [],
    pkData: { matches: 0, total: 0 },
    excludeRecent: true,
    filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' },
    filterSummary: '未筛选',
    currentMode: 'wheel',
    currentResult: null,
    isSpinning: false,
    isStopping: false,
    tarotAssigned: [],
    tarotFlipped: [false, false, false],
    tarotFortune: null,
    showTarotReset: false,
    showResult: false,
    pkSelections: { A: null, B: null },
    pkCats: [],
    pkPhase: 'selectA',
    pkMatch: false,
    pkResultTitle: '',
    pkResultText: '',
    pkResultFood: null,
    pkPunishment: '',
    showReveal: false,
    showEmptyWheel: false,
    blindboxOpened: false,
    blindboxShaking: false,
    wheelAngle: 0,
    wheelTransition: '',
    wheelPool: [],
    blindboxFood: null,
    blindboxRarity: '',
    weekFood: null,
    headerDate: '',
    currentResultIsFav: false,
    // 自定义选择器
    showPickerSheet: false,
    pickerTitle: '',
    pickerOptions: [],
    pickerType: '',
    pickerActiveIdx: 0,
    // UI 选项
    sceneOptions: SCENE_OPTIONS,
    budgetOptions: BUDGET_OPTIONS,
    timeOptions: TIME_OPTIONS,
    tasteOptions: TASTE_OPTIONS,
    avoidOptions: AVOID_TAG_OPTIONS,
    categoryOptions: CATEGORY_OPTIONS,
    showFilterSheet: false,
    hasActiveFilters: false,
    // 启动页
    showIntro: true,
    introFading: false,
  },

  onLoad() {
    this.initData()
    // FIX: 暗黑模式系统跟随
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ darkMode: sysInfo.theme === 'dark' })
    wx.onThemeChange && wx.onThemeChange((res) => {
      this.setData({ darkMode: res.theme === 'dark' })
    })
    this._introTimer1 = setTimeout(() => {
      this.setData({ introFading: true })
      this._introTimer2 = setTimeout(() => {
        this.setData({ showIntro: false, introFading: false })
      }, 800)
    }, 2000)
  },

  onShow() {
    this.initData()
  },

  // FIX: 微信小程序原生分享能力
  onShareAppMessage() {
    const { weekFood, currentResult } = this.data
    const food = currentResult || weekFood
    if (food) {
      return {
        title: `今天推荐：${food.emoji} ${food.name}`,
        path: '/pages/index/index'
        // FIX: 不传空 imageUrl，让微信自动截取页面截图
      }
    }
    return {
      title: '到底吃点啥 · 情侣版',
      path: '/pages/index/index'
    }
  },

  onUnload() {
    this.clearWheelTimers()
    clearTimeout(this._avoidTimer)
    clearTimeout(this._introTimer1)
    clearTimeout(this._introTimer2)
    clearTimeout(this._blindboxTimer)
    if (this._tickAudio) { this._tickAudio.destroy(); this._tickAudio = null }
    if (this._dingAudio) { this._dingAudio.destroy(); this._dingAudio = null }
  },

  // ========== 初始化 ==========

  initData() {
    const localVersion = safeGet(STORAGE_KEYS.localVersion, '')
    const localFoods = safeGet(STORAGE_KEYS.foods, null)

    // 食物全集存实例属性，不进 data
    this._foods = (localVersion === APP_VERSION && Array.isArray(localFoods) && localFoods.length > 0)
      ? localFoods.map(util.migrateFood)
      : foodsData.map(util.migrateFood)
    this._filteredCache = null
    this._cacheKey = ''
    this._nameIndex = null // foods 变化后，名称→食物索引需重建（供偏好/画像反查）

    const history = safeGet(STORAGE_KEYS.history, [])
    const favorites = safeGet(STORAGE_KEYS.favorites, [])
    const pkData = safeGet(STORAGE_KEYS.pkData, { matches: 0, total: 0 })
    const headerDate = util.formatDate(new Date(), true)

    this.setData({ history, favorites, pkData, headerDate }, () => {
      this.updateFilteredFoods()
      this.initTarot()
      this.rollWeek(true)
    })
  },

  // ========== 存储 ==========

  // 本页只持久化会变更的用户数据；foods 仅在管理页增删时持久化，避免每次互动全量重写
  saveState() {
    const { history, favorites, pkData } = this.data
    safeSet(STORAGE_KEYS.history, history)
    safeSet(STORAGE_KEYS.favorites, favorites)
    safeSet(STORAGE_KEYS.pkData, pkData)
  },

  // ========== 过滤与缓存（实例缓存，不经 setData） ==========

  invalidateCache() {
    this._filteredCache = null
    this._cacheKey = ''
  },

  getFilteredFoods() {
    const { filters, excludeRecent, history } = this.data
    const key = JSON.stringify({ s: filters.sceneIdx, b: filters.budgetIdx, t: filters.timeIdx, ta: filters.tasteIdx, a: filters.avoid, e: excludeRecent, h: history.map(item => item.name).join(',') })
    if (this._filteredCache && this._cacheKey === key) return this._filteredCache

    const result = foodLogic.filterFoods(this._foods, filters, { excludeRecent, history, now: Date.now() })
    this._filteredCache = result
    this._cacheKey = key
    return result
  },

  // 进化①②：由收藏/历史/本次拒绝构建偏好信号（喂给 foodLogic 的加权随机）
  buildPrefs() {
    const { favorites, history } = this.data
    const favoriteSet = new Set(favorites.map(f => f.name))
    const tasteCounts = {}
    const bump = tags => (tags || []).forEach(t => { tasteCounts[t] = (tasteCounts[t] || 0) + 1 })
    favorites.forEach(f => bump(f.tags)) // 收藏自带 tags
    // 历史仅存 name，借 _foods 的名称索引反查 tags
    const nameIndex = this._nameIndex || (this._nameIndex = new Map(this._foods.map(f => [f.name, f])))
    history.forEach(h => { const f = nameIndex.get(h.name); if (f) bump(f.tags) })
    return { favoriteSet, tasteCounts, rejectedSet: this._rejected || (this._rejected = new Set()) }
  },

  // 进化②：记录本次会话被「换一个/再开一个」拒绝的菜，后续降权（换筛选时清空）
  noteRejected(food) {
    if (!food) return
    if (!this._rejected) this._rejected = new Set()
    this._rejected.add(food.name)
  },

  pickRandom(fromPool) {
    const pool = fromPool || this.getFilteredFoods()
    return foodLogic.weightedPick(pool, this.buildPrefs())
  },

  updateFilteredFoods() {
    const filtered = this.getFilteredFoods()
    this.setData({ wheelPool: foodLogic.buildWheelPool(filtered) })
  },

  // 筛选条件变化后统一刷新：失效缓存 → 重算转盘 → 校正已选推荐菜
  applyFilterChange() {
    if (this._rejected) this._rejected.clear() // 换筛选 = 全新语境，清空会话级负反馈
    this.invalidateCache()
    this.updateFilteredFoods()
    this.reconcileWeekFood()
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

  // 若当前推荐菜已不在最新过滤集内，清空，避免「就决定是它了」确定到违反筛选的菜
  reconcileWeekFood() {
    const { weekFood } = this.data
    if (!weekFood) return
    const stillValid = this.getFilteredFoods().some(f => f.name === weekFood.name)
    if (!stillValid) this.setData({ weekFood: null })
  },

  // ========== 筛选器事件 ==========

  onSceneChange(e) {
    this.setData({ 'filters.sceneIdx': e.detail.value }, () => this.applyFilterChange())
  },

  onBudgetChange(e) {
    this.setData({ 'filters.budgetIdx': e.detail.value }, () => this.applyFilterChange())
  },

  onTimeChange(e) {
    this.setData({ 'filters.timeIdx': e.detail.value }, () => this.applyFilterChange())
  },

  onTasteChange(e) {
    this.setData({ 'filters.tasteIdx': e.detail.value }, () => this.applyFilterChange())
  },

  onToggleExclude() {
    this.setData({ excludeRecent: !this.data.excludeRecent }, () => this.applyFilterChange())
  },

  resetFilters() {
    this.setData({
      filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' },
      excludeRecent: true
    }, () => this.applyFilterChange())
  },

  openFilterSheet() {
    this.setData({ showFilterSheet: true })
  },

  closeFilterSheet() {
    this.setData({ showFilterSheet: false })
  },

  onResetFromSheet() {
    this.resetFilters()
    this.closeFilterSheet()
  },

  openAvoidPicker() {
    this.setData({
      showPickerSheet: true,
      pickerTitle: '选择要避免的口味',
      pickerOptions: this.data.avoidOptions,
      pickerType: 'avoid',
      pickerActiveIdx: this.data.avoidOptions.indexOf(this.data.filters.avoid || '无')
    })
  },

  onAvoidChange(e) {
    const val = this.data.avoidOptions[e.detail.value]
    this.setData({ 'filters.avoid': val === '无' ? '' : val }, () => this.applyFilterChange())
  },

  openScenePicker() {
    this.setData({
      showPickerSheet: true,
      pickerTitle: '选择场景',
      pickerOptions: this.data.sceneOptions,
      pickerType: 'scene',
      pickerActiveIdx: this.data.filters.sceneIdx
    })
  },

  openBudgetPicker() {
    this.setData({
      showPickerSheet: true,
      pickerTitle: '选择预算',
      pickerOptions: this.data.budgetOptions,
      pickerType: 'budget',
      pickerActiveIdx: this.data.filters.budgetIdx
    })
  },

  openTimePicker() {
    this.setData({
      showPickerSheet: true,
      pickerTitle: '选择时间',
      pickerOptions: this.data.timeOptions,
      pickerType: 'time',
      pickerActiveIdx: this.data.filters.timeIdx
    })
  },

  openTastePicker() {
    this.setData({
      showPickerSheet: true,
      pickerTitle: '选择口味',
      pickerOptions: this.data.tasteOptions,
      pickerType: 'taste',
      pickerActiveIdx: this.data.filters.tasteIdx
    })
  },

  closePickerSheet() {
    this.setData({ showPickerSheet: false })
  },

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

  // ========== Tab 切换 ==========

  onWheelBtnTap() {
    if (this.data.isSpinning) this.stopWheel()
    else this.spinWheel()
  },

  switchTab(e) {
    const mode = e.currentTarget.dataset.mode
    // 离开转盘时若仍在旋转，停止定时器并复位状态，避免后台空转
    if (this.data.isSpinning) {
      this.clearWheelTimers()
      this.setData({ isSpinning: false, isStopping: false, showReveal: false })
    }
    this.setData({ currentMode: mode, blindboxOpened: false, blindboxFood: null })
    if (mode === 'tarot') this.initTarot()
    if (mode === 'pk') this.initPK()
  },

  // ========== 结果弹窗 ==========

  showResultModal(food, source) {
    if (!food) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      return
    }
    const isFav = this.data.favorites.some(f => f.name === food.name)
    this.setData({
      currentResult: food,
      currentResultSource: source,
      currentResultIsFav: isFav,
      showResult: true
    })
    if (source !== 'history') this.addToHistory(food)
  },

  showWeekResult() {
    const { weekFood } = this.data
    if (weekFood) this.showResultModal(weekFood, 'week')
  },

  closeResultModal() {
    this.setData({ showResult: false, blindboxOpened: false, blindboxFood: null })
  },

  onModalContentTap() {
    // 阻止冒泡，防止点击模态框内容时关闭
  },

  onConfirmResult() {
    this.setData({ showResult: false, blindboxOpened: false, blindboxFood: null })
  },

  onRetryResult() {
    const mode = this.data.currentMode
    this.noteRejected(this.data.currentResult)
    this.setData({ showResult: false, blindboxOpened: false, blindboxFood: null })
    if (mode === 'wheel') this.spinWheel()
    else if (mode === 'week') {
      // FIX: 清除当天记忆，让"换一个"真正换菜
      safeSet('wtec_week_food_date', '')
      this.rollWeek()
    }
    else if (mode === 'blindbox') this.openBlindbox()
    else if (mode === 'tarot') { this.initTarot(); this.switchTab(null, 'tarot') }
    else if (mode === 'pk') { this.resetPK(); this.switchTab(null, 'pk') }
  },

  onToggleFav() {
    const { currentResult, favorites } = this.data
    if (!currentResult) return
    const idx = favorites.findIndex(f => f.name === currentResult.name)
    let newFavorites
    if (idx >= 0) {
      newFavorites = favorites.slice()
      newFavorites.splice(idx, 1)
    } else {
      newFavorites = [...favorites, currentResult]
    }
    this.setData({ favorites: newFavorites, currentResultIsFav: idx < 0 }, () => {
      this.saveState()
    })
  },

  // ========== 历史记录 ==========

  addToHistory(food) {
    if (!food) return
    const history = [{ name: food.name, emoji: food.emoji, date: new Date().toISOString() }, ...this.data.history]
    if (history.length > 50) history.length = 50
    this.setData({ history }, () => {
      this.invalidateCache()
      this.saveState()
    })
  },

  // ========== 转盘 ==========

  // 清理转盘相关的所有定时器
  clearWheelTimers() {
    if (this._spinTimer) { clearInterval(this._spinTimer); this._spinTimer = null }
    if (this._revealTimer) { clearTimeout(this._revealTimer); this._revealTimer = null }
    if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null }
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
    this._stopWheel = null
  },

  spinWheel() {
    if (this.data.isSpinning) return
    let filtered = this.getFilteredFoods()
    // FIX: 排除最近被拒绝的食物，确保"换一个"真正换菜
    if (this._rejected && this._rejected.size > 0 && filtered.length > 1) {
      const withoutRejected = filtered.filter(f => !this._rejected.has(f.name))
      if (withoutRejected.length > 0) filtered = withoutRejected
    }
    if (filtered.length === 0) {
      this.setData({ showEmptyWheel: true })
      return
    }
    this.setData({ showEmptyWheel: false })
    const pool = foodLogic.buildWheelPool(filtered)
    this._wheelAngle = this._wheelAngle || 0
    this._lastTickSector = -1
    // FIX: 旋转用 CSS transition 驱动，setInterval 只更新目标角度
    this.setData({ isSpinning: true, isStopping: false, wheelPool: pool, wheelTransition: 'transition: transform 0.05s linear;', wheelAngle: this._wheelAngle })
    this._spinTimer = setInterval(() => {
      this._wheelAngle += 36
      this.setData({ wheelAngle: this._wheelAngle })
      const sector = Math.floor(this._wheelAngle / 90) % 4
      if (sector !== this._lastTickSector) {
        this._lastTickSector = sector
        this.playTick()
      }
    }, 50)

    this._stopWheel = () => {
      if (this.data.isStopping || !this._spinTimer) return
      clearInterval(this._spinTimer)
      this._spinTimer = null
      this.setData({ isStopping: true, wheelTransition: '' })
      // 进化①：中奖扇区按收藏/口味偏好加权选出（落点几何由 angleForWinner 保证一致）
      const winnerIdx = foodLogic.weightedPickIndex(pool, this.buildPrefs())
      const targetMod = foodLogic.angleForWinner(winnerIdx)
      const currentMod = ((this._wheelAngle % 360) + 360) % 360
      const delta = (targetMod - currentMod + 360) % 360
      const extraRounds = 3 + Math.floor(Math.random() * 3)
      this._wheelAngle = this._wheelAngle + extraRounds * 360 + delta
      this.setData({ wheelAngle: this._wheelAngle, wheelTransition: 'transition: transform 2s cubic-bezier(0.16, 1, 0.3, 1);' })
      this._revealTimer = setTimeout(() => {
        this.playDing()
        this.setData({ showReveal: true })
        this._resultTimer = setTimeout(() => {
          this.setData({ showReveal: false, isSpinning: false, isStopping: false })
          this.showResultModal(pool[winnerIdx], 'wheel')
        }, 600)
      }, 2000)
    }
  },

  stopWheel() {
    if (this._stopWheel) this._stopWheel()
  },

  // ========== 塔罗 ==========

  initTarot() {
    const pool = this.getFilteredFoods()
    const fortune = TAROT_FORTUNES[Math.floor(Math.random() * TAROT_FORTUNES.length)]
    let tarotPool = pool.filter(fortune.filter)
    if (tarotPool.length < 3) tarotPool = pool
    // 进化①：三张牌按收藏/口味偏好加权抽取（运势过滤之上再叠个性化）
    const prefs = this.buildPrefs()
    const tarotAssigned = []
    for (let i = 0; i < 3; i++) {
      const food = tarotPool.length > 0 ? foodLogic.weightedPick(tarotPool, prefs) : { emoji: '🍽️', name: '暂无' }
      tarotAssigned.push(food)
    }
    this.setData({
      tarotAssigned,
      tarotFlipped: [false, false, false],
      tarotFortune: null,
      tarotFortuneObj: fortune,
      showTarotReset: false
    })
  },

  onFlipTarot(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const { tarotFlipped, tarotAssigned, tarotFortuneObj } = this.data
    if (tarotFlipped[idx]) return
    const flipped = tarotFlipped.slice()
    flipped[idx] = true
    const updates = { tarotFlipped: flipped }
    if (!tarotFlipped.some(f => f)) {
      updates.tarotFortune = tarotFortuneObj
    }
    updates.showTarotReset = flipped.every(f => f)
    this.setData(updates)
    const food = tarotAssigned[idx]
    if (food && food.name !== '暂无') {
      this.addToHistory(food)
    }
    // FIX: 塔罗牌翻开震动反馈
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  onResetTarot() {
    this.initTarot()
  },

  // ========== 星期 ==========

  onRollWeekTap() {
    this.rollWeek()
  },

  rollWeek(silent) {
    if (typeof silent !== 'boolean') silent = false
    const today = new Date().toDateString()
    const storageKey = 'wtec_week_food_date'
    const savedDate = safeGet(storageKey, '')
    const savedFood = safeGet('wtec_week_food', null)
    // FIX: 同一天返回已推荐的结果
    if (savedDate === today && savedFood && savedFood.name) {
      const stillValid = this.getFilteredFoods().some(f => f.name === savedFood.name)
      if (stillValid) {
        this.setData({ weekFood: savedFood })
        if (!silent) this.showResultModal(savedFood, 'week')
        return
      }
    }
    const pool = this.getFilteredFoods()
    if (pool.length === 0) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      return
    }
    // FIX: 星期主题标签加权匹配
    const day = new Date().getDay()
    const themeTags = WEEK_THEME_TAGS[day]
    const prefs = { tasteCounts: {} }
    themeTags.forEach((tag, i) => { prefs.tasteCounts[tag] = (3 - i) * 2 })
    const food = foodLogic.weightedPick(pool, prefs)
    safeSet(storageKey, today)
    safeSet('wtec_week_food', food)
    this.setData({ weekFood: food })
    if (!silent) this.showResultModal(food, 'week')
  },

  // ========== PK ==========

  initPK() {
    const cats = []
    while (cats.length < 8) {
      const c = PK_CATEGORIES[Math.floor(Math.random() * PK_CATEGORIES.length)]
      if (!cats.includes(c)) cats.push(c)
    }
    this.setData({
      pkSelections: { A: null, B: null },
      pkCats: cats,
      pkPhase: 'selectA',
      pkMatch: false,
      pkResultTitle: '',
      pkResultText: ''
    })
  },

  selectPK(e) {
    const side = e.currentTarget.dataset.side
    const cat = e.currentTarget.dataset.cat
    const { pkSelections, pkPhase } = this.data
    if (side === 'A' && pkPhase !== 'selectA') return
    if (side === 'B' && pkPhase !== 'selectB') return
    if (pkSelections[side] !== null) return
    const newSelections = { ...pkSelections, [side]: cat }
    this.setData({ pkSelections: newSelections })
  },

  confirmPKA() {
    this.setData({ pkPhase: 'selectB' })
  },

  confirmPKB() {
    this.setData({ pkPhase: 'ready' })
  },

  revealPK() {
    const { pkSelections, pkData } = this.data
    const match = pkSelections.A === pkSelections.B
    const newPkData = { ...pkData, total: pkData.total + 1, matches: pkData.matches + (match ? 1 : 0) }
    const punishments = PK_PUNISHMENTS.filter(p => p.match === match)
    const punishment = punishments[Math.floor(Math.random() * punishments.length)]
    const allFoods = this.getFilteredFoods()
    let pool
    if (match) {
      pool = allFoods.filter(f => f.tags && f.tags.includes(pkSelections.A))
    } else {
      pool = allFoods.filter(f => f.tags && (f.tags.includes(pkSelections.A) || f.tags.includes(pkSelections.B)))
      const bothPool = pool.filter(f => f.tags && f.tags.includes(pkSelections.A) && f.tags.includes(pkSelections.B))
      if (bothPool.length > 0) pool = bothPool
    }
    const food = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : this.pickRandom()
    const pct = newPkData.total > 0 ? Math.round(newPkData.matches / newPkData.total * 100) : 0
    const title = match ? '🎉 默契成功！' : '😌 有点不同，但也很棒'
    const text = match
      ? `你们都选了"${pkSelections.A}"，默契度 ${pct}%！`
      : `你选了"${pkSelections.A}"，TA选了"${pkSelections.B}"`
    this.setData({
      pkData: newPkData,
      pkPhase: 'ready',
      pkMatch: match,
      pkPunishment: punishment ? punishment.text : '',
      pkResultTitle: title,
      pkResultText: text,
      pkResultFood: food || null
    }, () => {
      this.saveState()
      if (food) this.addToHistory(food)
      this.showResultModal(food, 'pk')
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
    })
  },

  resetPK() {
    this.initPK()
  },

  // ========== 盲盒 ==========

  openBlindbox() {
    if (this.data.blindboxOpened) return
    this.setData({ blindboxShaking: true, blindboxFood: null, blindboxRarity: '' })
    this._blindboxTimer = setTimeout(() => {
      const food = this.pickRandom()
      if (!food) {
        wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
        this.setData({ blindboxShaking: false })
        return
      }
      // FIX: 按预算映射稀有度 R/SR/SSR
      const rarityMap = { '💰': 'R', '💰💰': 'SR', '💰💰💰': 'SSR' }
      const rarity = rarityMap[food.budget] || 'R'
      // FIX: 分阶段动画：shake → 光效 → 展示
      this.setData({ blindboxShaking: false, blindboxOpened: true, blindboxFood: food, blindboxRarity: rarity })
      // FIX: 盲盒揭晓震动反馈
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
      setTimeout(() => {
        this.showResultModal(food, 'blindbox')
      }, 600)
    }, 800)
  },

  // ========== 跳转管理页 ==========

  goToManage() {
    wx.navigateTo({ url: '/pages/manage/manage' })
  },

  // ========== 音效 ==========

  playTick() {
    if (!this._tickAudio) {
      this._tickAudio = wx.createInnerAudioContext()
      this._tickAudio.src = TICK_SOUND
      this._tickAudio.volume = 0.3
    }
    this._tickAudio.stop()
    this._tickAudio.play()
    // NOTE: tick 阶段不触发硬件震动，避免旋转时每秒十几次震动干扰体验
  },

  playDing() {
    if (!this._dingAudio) {
      this._dingAudio = wx.createInnerAudioContext()
      this._dingAudio.src = DING_SOUND
      this._dingAudio.volume = 0.5
    }
    this._dingAudio.stop()
    this._dingAudio.play()
    // FIX: 结果揭晓震动反馈
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
  },

  // ========== 空状态处理 ==========

  onRelaxedSpin() {
    const { filters } = this.data
    const relaxed = { ...filters }
    if (relaxed.sceneIdx > 0) relaxed.sceneIdx = 0
    else if (relaxed.budgetIdx > 0) relaxed.budgetIdx = 0
    else if (relaxed.timeIdx > 0) relaxed.timeIdx = 0
    this.setData({ filters: relaxed }, () => {
      this.applyFilterChange()
      this.spinWheel()
    })
  },

  onShareResult() {
    const { currentResult } = this.data
    if (!currentResult) return
    const query = wx.createSelectorQuery()
    query.select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) {
        wx.showToast({ title: '画布初始化失败', icon: 'none' })
        return
      }
      try {
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
        const w = 600, h = 800
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)

        // 兼容圆角矩形绘制
        const drawRoundRect = function(c, x, y, rw, rh, r) {
          if (rw < 2 * r) r = rw / 2
          if (rh < 2 * r) r = rh / 2
          c.moveTo(x + r, y)
          c.lineTo(x + rw - r, y)
          c.arcTo(x + rw, y, x + rw, y + rh, r)
          c.lineTo(x + rw, y + rh - r)
          c.arcTo(x + rw, y + rh, x, y + rh, r)
          c.lineTo(x + r, y + rh)
          c.arcTo(x, y + rh, x, y, r)
          c.lineTo(x, y + r)
          c.arcTo(x, y, x + rw, y, r)
          c.closePath()
        }

        // 背景
        ctx.fillStyle = '#F8F8FA'
        ctx.fillRect(0, 0, w, h)
        // 卡片背景
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        drawRoundRect(ctx, 40, 40, w - 80, h - 80, 32)
        ctx.fill()
        // 装饰线
        ctx.strokeStyle = '#FF7A6B'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(w / 2 - 60, 120)
        ctx.lineTo(w / 2 + 60, 120)
        ctx.stroke()
        // emoji
        ctx.font = '120px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(currentResult.emoji, w / 2, 280)
        // 名字
        ctx.fillStyle = '#111'
        ctx.font = 'bold 48px sans-serif'
        ctx.fillText(currentResult.name, w / 2, 380)
        // 标签
        ctx.fillStyle = '#6E6E73'
        ctx.font = '28px sans-serif'
        ctx.fillText(`${currentResult.category} · ${currentResult.scene} · ${currentResult.budget}`, w / 2, 440)
        // slogan
        ctx.fillStyle = '#A1A1AA'
        ctx.font = '24px sans-serif'
        ctx.fillText('今天这顿，交给运气', w / 2, 520)
        ctx.fillText('到底吃点啥 · 情侣版', w / 2, 560)
        // 小程序码占位
        ctx.fillStyle = '#F3F4F8'
        ctx.beginPath()
        ctx.arc(w / 2, 660, 50, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#A1A1AA'
        ctx.font = '20px sans-serif'
        ctx.fillText('扫码一起决定', w / 2, 740)
        // 导出
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
              fail: (err) => {
                if (err.errMsg && err.errMsg.indexOf('auth') > -1) {
                  wx.showToast({ title: '需要授权保存相册', icon: 'none' })
                }
                wx.previewImage({ urls: [res.tempFilePath] })
              }
            })
          },
          fail: (err) => {
            wx.showToast({ title: '图片生成失败：' + (err.errMsg || ''), icon: 'none' })
          }
        })
      } catch (e) {
        wx.showToast({ title: '生成失败：' + (e.message || ''), icon: 'none' })
      }
    })
  },


})
