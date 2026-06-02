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

const STORAGE_FLUSH_DELAY_MS = 250
const INTRO_HOLD_MS = 600
const INTRO_FADE_MS = 200

Page({
  data: {
    // 渲染层状态（食物全集与过滤缓存改为实例属性，不进 data，避免跨渲染层序列化大数组）
    rollPhase: '',
    pkData: { matches: 0, total: 0 },
    excludeRecent: true,
    filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' },
    requireMeal: true, // NEW: 严格模式——只推荐可作为完整一餐的菜品
    filterSummary: '未筛选',
    currentMode: 'week',
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
    wheelFreeSpin: false, // 自由旋转阶段：true 时由纯 CSS 动画驱动（不走 setData）
    wheelPool: [],
    blindboxFood: null,
    blindboxRarity: '',
    weekFood: null,
    weekReason: '',
    headerDate: '',
    currentResultIsFav: false,
    resultReason: '',   // 进化④：推荐理由
    comboResult: [],    // 进化⑥：一桌好菜
    showCombo: false,
    resultClosing: false, // T3：结果 Sheet 正在下滑退出（延迟卸载用）
    comboClosing: false,  // T3：凑一桌 Sheet 正在下滑退出
    // NEW: 结果页闭环
    alternativeResults: [], // 2 个备选项
    showAlternatives: false, // 是否展开备选项
    showFeedback: false, // 是否显示反馈面板
    feedbackOptions: ['今天不想吃肉', '太贵', '太慢', '最近吃过', '不喜欢', '只是想再看看'],
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
    showFilterSheet: false,
    hasActiveFilters: false,
    showPlayMore: false,
    modeTitleMap: { wheel: '转盘', tarot: '塔罗', pk: '默契 PK', blindbox: '盲盒', week: '推荐' },
    poolMode: 'default', // NEW: 池模式（default/gathering/cooking）
    showIntro: true,
    introFading: false,
    shareCanvasMounted: false,
  },

  onLoad() {
    this._isPageVisible = true
    this._introStartTs = Date.now()
    this.initData()
    // FIX: 暗黑模式系统跟随
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ darkMode: sysInfo.theme === 'dark' })
    this._offThemeChange = wx.onThemeChange && wx.onThemeChange((res) => {
      const darkMode = res.theme === 'dark'
      if (this._isPageVisible) this.setData({ darkMode })
      else this._pendingDarkMode = darkMode
    })
    // 保险：1.8s 后强制结束启动页，防止异常卡住
    this._introMaxTimer = setTimeout(() => this.finishIntro(true), 1800)
  },

  onShow() {
    this._isPageVisible = true
    // 首次进入由 onLoad 完成初始化；再次显示（如从管理页返回）只做轻量数据刷新，
    // 不重置塔罗/推荐/玩法状态，避免闪动与误重置
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
    this._isPageVisible = false
    this.flushPendingWrites()
    this.clearWheelTimers()
    this.clearBlindboxTimers()
    this.interruptRollAnimation()
    this.clearTimer('_avoidTimer')
    this.clearTimer('_introDelayTimer')
    this.clearTimer('_introMaxTimer')
    this.clearTimer('_introFadeTimer')
    this.clearTimer('_resultCloseTimer')
    this.clearTimer('_comboCloseTimer')
    this.clearTimer('_storageFlushTimer')
    this.releaseShareCanvas(false)
    this.stopAudio()
    if (this._tickAudio) { this._tickAudio.destroy(); this._tickAudio = null }
    if (this._dingAudio) { this._dingAudio.destroy(); this._dingAudio = null }
    if (this._offThemeChange) { this._offThemeChange(); this._offThemeChange = null }
  },

  clearTimer(name) {
    if (!this[name]) return
    clearTimeout(this[name])
    this[name] = null
  },

  stopAudio() {
    if (this._tickAudio) this._tickAudio.stop()
    if (this._dingAudio) this._dingAudio.stop()
  },

  settleInterruptedSheets() {
    this.clearTimer('_resultCloseTimer')
    this.clearTimer('_comboCloseTimer')
    const updates = {}
    if (this.data.resultClosing) {
      updates.showResult = false
      updates.resultClosing = false
      updates.blindboxOpened = false
      updates.blindboxFood = null
    }
    if (this.data.comboClosing) {
      updates.showCombo = false
      updates.comboClosing = false
    }
    if (Object.keys(updates).length > 0) this.setData(updates)
  },

  pauseActiveTasks() {
    if (this.data.currentMode === 'wheel' && this.data.isSpinning) {
      this._pausedWheel = this.data.isStopping && this._wheelPendingFood
        ? { phase: 'reveal', food: this._wheelPendingFood }
        : { phase: 'spin' }
      this.clearWheelTimers()
      this.setData({
        isSpinning: false,
        isStopping: false,
        showReveal: false,
        wheelFreeSpin: false,
        wheelTransition: ''
      })
    }

    if (this.data.currentMode === 'blindbox') {
      if (this._blindboxRevealTimer && this._blindboxPendingFood) {
        this._pausedBlindbox = {
          phase: 'reveal',
          food: this._blindboxPendingFood,
          rarity: this._blindboxPendingRarity
        }
      } else if (this._blindboxTimer || this.data.blindboxShaking) {
        this._pausedBlindbox = { phase: 'shake' }
      }
      this.clearBlindboxTimers(false)
      if (this.data.blindboxShaking) this.setData({ blindboxShaking: false })
    }
  },

  resumePausedTasks() {
    if (this._pausedWheel) {
      const paused = this._pausedWheel
      this._pausedWheel = null
      if (paused.phase === 'reveal' && paused.food) this.finishWheelResult(paused.food)
      else if (this.data.currentMode === 'wheel') this.spinWheel()
    }

    if (this._pausedBlindbox) {
      const paused = this._pausedBlindbox
      this._pausedBlindbox = null
      if (paused.phase === 'reveal' && paused.food) {
        this.setData({
          blindboxShaking: false,
          blindboxOpened: true,
          blindboxFood: paused.food,
          blindboxRarity: paused.rarity
        })
        this.finishBlindboxResult(paused.food)
      } else if (this.data.currentMode === 'blindbox') {
        this.openBlindbox()
      }
    }
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
    this._foodsRev = safeGet(STORAGE_KEYS.foodsRev, 0) // 记录已加载的菜品库修订，供 onShow 判断是否需重建

    const history = safeGet(STORAGE_KEYS.history, [])
    const favorites = safeGet(STORAGE_KEYS.favorites, [])
    const pkData = safeGet(STORAGE_KEYS.pkData, { matches: 0, total: 0 })
    const headerDate = util.formatDate(new Date(), true)
    this._history = history
    this._favorites = favorites
    this._weekFoodDate = safeGet(STORAGE_KEYS.weekFoodDate, '')
    this._weekFood = safeGet(STORAGE_KEYS.weekFood, null)
    // NEW: 冷却族抽取记录（session 级，不长期存储）
    this._cooldownFamilyPicks = {}

    this.setData({ pkData, headerDate }, () => {
      this.rollWeek(true)
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

  // 轻量刷新：仅同步管理页可能改动的数据（菜品/历史/收藏），不重置玩法 UI
  refreshFromStorage() {
    // 仅当管理页确实改过菜品（foodsRev 变化）时才重建全量 foods，
    // 避免每次 onShow（如从管理页返回）都对 500 条重跑 migrateFood、产生 500 个新对象
    const rev = safeGet(STORAGE_KEYS.foodsRev, 0)
    if (rev !== this._foodsRev) {
      const localVersion = safeGet(STORAGE_KEYS.localVersion, '')
      const localFoods = safeGet(STORAGE_KEYS.foods, null)
      this._foods = (localVersion === APP_VERSION && Array.isArray(localFoods) && localFoods.length > 0)
        ? localFoods.map(util.migrateFood)
        : foodsData.map(util.migrateFood)
      this._nameIndex = null
      this._foodsRev = rev
    }
    const history = safeGet(STORAGE_KEYS.history, [])
    const favorites = safeGet(STORAGE_KEYS.favorites, [])
    this._history = history
    this._favorites = favorites
    this.invalidateCache()
    if (this.data.currentMode === 'wheel') this.updateFilteredFoods()
    this.reconcileWeekFood()
  },

  // ========== 存储 ==========

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

  // NEW: 根据当前小时自动推断 mealPeriod
  inferMealPeriod() {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 10) return '早餐'
    if (hour >= 10 && hour < 14) return '午餐'
    if (hour >= 14 && hour < 17) return '加餐'
    if (hour >= 17 && hour < 22) return '晚餐'
    return '夜宵'
  },

  getFilteredFoods() {
    const { filters, excludeRecent } = this.data
    const requireMeal = this._poolMode === 'cooking' ? false : this.data.requireMeal
    const history = this._history || []
    const now = Date.now()
    const mealPeriod = this.inferMealPeriod()
    const poolMode = this._poolMode || 'default'
    // 缓存键须精确覆盖会影响过滤结果的输入：排除近期开启时，纳入 3 天窗口内的全部菜名（不再只取前 20 条）
    let recentPart = ''
    if (excludeRecent) {
      const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
      recentPart = history
        .filter(h => { const d = new Date(h.date).getTime(); return !Number.isNaN(d) && now - d <= THREE_DAYS })
        .map(h => h.name).join('\x00')
    }
    const key = JSON.stringify({ s: filters.sceneIdx, b: filters.budgetIdx, t: filters.timeIdx, ta: filters.tasteIdx, a: filters.avoid, e: excludeRecent, r: requireMeal, m: mealPeriod, h: recentPart, p: poolMode })
    if (this._filteredCache && this._cacheKey === key) return this._filteredCache

    let result = foodLogic.filterFoods(this._foods, { ...filters, requireMeal, mealPeriod }, { excludeRecent, history, now })
    // 按池模式过滤
    if (poolMode === 'gathering') {
      result = result.filter(f => f.itemLevel === '聚餐方式' && f.enabled !== false)
    } else if (poolMode === 'cooking') {
      result = result.filter(f => f.itemLevel === '单道菜' && f.enabled !== false)
    } else {
      // 默认只从 defaultPool 中抽取（审查后仅 110 条左右进入首页默认池）
      const poolFiltered = result.filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false)
      if (poolFiltered.length > 0) result = poolFiltered
    }
    // 空集回退：若时段/池过滤导致空集，先降级为不限时段
    if (result.length === 0 && mealPeriod) {
      result = foodLogic.filterFoods(this._foods, { ...filters, requireMeal }, { excludeRecent, history, now })
      if (poolMode === 'gathering') {
        result = result.filter(f => f.itemLevel === '聚餐方式' && f.enabled !== false)
      } else if (poolMode === 'cooking') {
        result = result.filter(f => f.itemLevel === '单道菜' && f.enabled !== false)
      } else {
        const poolFiltered2 = result.filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false)
        if (poolFiltered2.length > 0) result = poolFiltered2
      }
    }
    // 二次回退：若池过滤导致空集，移除池限制（保证始终有结果）
    if (result.length === 0) {
      result = foodLogic.filterFoods(this._foods, { ...filters, requireMeal, mealPeriod }, { excludeRecent, history, now })
      if (result.length === 0 && mealPeriod) {
        result = foodLogic.filterFoods(this._foods, { ...filters, requireMeal }, { excludeRecent, history, now })
      }
    }
    this._filteredCache = result
    this._cacheKey = key
    return result
  },

  // 进化①②：由收藏/历史/本次拒绝构建偏好信号（喂给 foodLogic 的加权随机）
  buildPrefs() {
    const favorites = this._favorites || []
    const history = this._history || []
    const favoriteSet = new Set(favorites.map(f => f.name))
    const tasteCounts = {}
    const bump = tags => (tags || []).forEach(t => { tasteCounts[t] = (tasteCounts[t] || 0) + 1 })
    favorites.forEach(f => bump(f.tags)) // 收藏自带 tags
    // 历史仅存 name，借 _foods 的名称索引反查 tags
    const nameIndex = this._nameIndex || (this._nameIndex = new Map(this._foods.map(f => [f.name, f])))
    history.forEach(h => { const f = nameIndex.get(h.name); if (f) bump(f.tags) })
    return {
      favoriteSet,
      tasteCounts,
      rejectedSet: this._rejected || (this._rejected = new Set()),
      cooldownFamilyPicks: this._cooldownFamilyPicks || {}
    }
  },

  // NEW: 构建推荐上下文（渠道 + 季节弱信号）
  buildCtx() {
    const { filters } = this.data
    const scene = filters.sceneIdx > 0 ? SCENE_OPTIONS[filters.sceneIdx] : null
    // 季节弱信号：按当前月份注入 weatherTags（纯本地，零依赖）
    const weatherTags = foodLogic.inferSeason()
    return { scene, weatherTags }
  },

  // 进化②：记录本次会话被「换一个/再开一个」拒绝的菜，后续降权（换筛选时清空）
  noteRejected(food) {
    if (!food) return
    if (!this._rejected) this._rejected = new Set()
    this._rejected.add(food.name)
  },

  // 会话级「换一个」语义：在过滤集基础上剔除本次被拒绝的菜（若剔空则保留过滤集）。
  // 统一供转盘/盲盒/塔罗/推荐复用，让各玩法的「换一个」去重力度一致。
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

  updateFilteredFoods() {
    const filtered = this.getFilteredFoods()
    this.setData({ wheelPool: foodLogic.buildWheelPool(filtered).map(f => ({ emoji: f.emoji })) })
  },

  // 筛选条件变化后统一刷新：失效缓存 → 重算转盘 → 校正已选推荐菜
  applyFilterChange() {
    if (this._rejected) this._rejected.clear() // 换筛选 = 全新语境，清空会话级负反馈
    this.invalidateCache()
    if (this.data.currentMode === 'wheel') this.updateFilteredFoods()
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
    if (!stillValid) {
      this._weekFood = null
      this._weekFoodDate = ''
      this.queueStorageWrite(STORAGE_KEYS.weekFoodDate, '')
      this.queueStorageWrite(STORAGE_KEYS.weekFood, null)
      this.setData({ weekFood: null, weekReason: '' })
    }
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
    this.setData({ showFilterSheet: true, showResult: false, showCombo: false })
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
    if (this.data.isStopping) return
    if (this.data.isSpinning) this.stopWheel()
    else this.spinWheel()
  },

  togglePlayMore() {
    this.setData({ showPlayMore: !this.data.showPlayMore })
  },

  switchPoolMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode) return
    this._poolMode = mode
    this.setData({ poolMode: mode })
    // 刷新推荐池，让新场景立即生效
    this.rollWeek(true, true)
    wx.showToast({ title: mode === 'gathering' ? '已切换：聚餐场景' : '已切换：自己做菜', icon: 'none', duration: 1200 })
  },

  switchTab(e) {
    const mode = e.currentTarget.dataset.mode
    // 离开任一玩法时清理其定时器与临时态，避免后台空转 / 状态残留
    this.clearWheelTimers()
    this.clearBlindboxTimers()
    this._pausedWheel = null
    this._wheelPendingFood = null
    this._pausedBlindbox = null
    this.setData({
      currentMode: mode,
      isSpinning: false, isStopping: false, showReveal: false, wheelFreeSpin: false,
      blindboxOpened: false, blindboxFood: null, blindboxShaking: false, blindboxRarity: ''
    })
    if (mode === 'wheel') this.updateFilteredFoods()
    if (mode === 'tarot') this.initTarot()
    if (mode === 'pk') this.initPK()
  },

  // ========== 结果弹窗 ==========

  showResultModal(food, source) {
    if (!food) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      return
    }
    const isFav = (this._favorites || []).some(f => f.name === food.name)
    // 进化④：非 PK 结果附「推荐理由」（在写入历史前计算）。
    // week 来源与其推荐依据（星期主题）保持一致，其余来源用个性化偏好解释。
    const ctx = this.buildCtx()
    const resultReason = source === 'pk'
      ? ''
      : (source === 'week' ? this.buildWeekReason(food) : foodLogic.buildRichReason(food, ctx))
    // NEW: 生成 2 个备选项
    const pool = this.candidatePool()
    let alternatives = (source === 'pk') ? [] : foodLogic.pickAlternatives(pool, food, 2, this.buildPrefs(), null, ctx)
    // 兜底：若 pickAlternatives 未返回足够备选项，从 pool 中随机补几个
    if (alternatives.length < 2 && pool && pool.length > 1) {
      const poolNames = new Set([food.name, ...alternatives.map(a => a.name)])
      const fillers = pool
        .filter(f => !poolNames.has(f.name))
        .sort(() => Math.random() - 0.5)
        .slice(0, 2 - alternatives.length)
      alternatives = alternatives.concat(fillers)
    }
    this.setData({
      currentResult: food,
      currentResultSource: source,
      currentResultIsFav: isFav,
      resultReason,
      alternativeResults: alternatives.map(f => ({ name: f.name, emoji: f.emoji, category: f.category })),
      showAlternatives: false,
      showFeedback: false,
      showResult: true,
      resultClosing: false, // 重新打开时清掉退出态，避免被上一次的关闭定时器隐藏
      // 浮层互斥：结果 Sheet 出现时关闭其它顶层 Sheet
      showFilterSheet: false, showPickerSheet: false, showCombo: false
    })
    this.clearTimer('_resultCloseTimer')
    if (source !== 'history') this.addToHistory(food)
  },

  showWeekResult() {
    const { weekFood } = this.data
    if (!weekFood) return
    this.addToHistory(weekFood)
    wx.showToast({ title: `已决定：${weekFood.name}`, icon: 'none' })
    // 不弹出结果 Sheet，首页 hero-card 已展示全部信息
  },

  // 进化⑥：一键凑一桌（情侣一起点多道菜，品类尽量不重复）
  buildCombo() {
    const filtered = this.getFilteredFoods()
    if (filtered.length === 0) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      return
    }
    this.clearTimer('_comboCloseTimer')
    this.setData({
      comboResult: foodLogic.buildMealCombo(filtered, 3),
      showCombo: true,
      comboClosing: false, // 「换一桌」复用本函数：清掉可能残留的退出态
      showResult: false, showFilterSheet: false, showPickerSheet: false
    })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  // T3：先播下滑退出动画，再延迟卸载（与上滑进入对称）
  closeCombo() {
    if (this.data.comboClosing) return
    this.clearTimer('_comboCloseTimer')
    this.setData({ comboClosing: true })
    this._comboCloseTimer = setTimeout(() => {
      this._comboCloseTimer = null
      this.setData({ showCombo: false, comboClosing: false })
    }, 220)
  },

  closeResultModal() {
    if (this.data.resultClosing) return
    this.clearTimer('_resultCloseTimer')
    this.setData({ resultClosing: true })
    this._resultCloseTimer = setTimeout(() => {
      this._resultCloseTimer = null
      this.setData({ showResult: false, resultClosing: false, blindboxOpened: false, blindboxFood: null })
    }, 220)
  },

  onModalContentTap() {
    // 阻止冒泡，防止点击模态框内容时关闭
  },

  onConfirmResult() {
    this.closeResultModal()
  },

  onRetryResult() {
    const mode = this.data.currentMode
    this.noteRejected(this.data.currentResult)
    // 「换一个」即时关闭并重开（不走下滑退出），同时清掉待执行的关闭定时器，避免竞态隐藏新结果
    this.clearTimer('_resultCloseTimer')
    this.setData({ showResult: false, resultClosing: false, blindboxOpened: false, blindboxFood: null })
    if (mode === 'wheel') this.spinWheel()
    else if (mode === 'week') {
      this.rollWeek(true, true)
    }
    else if (mode === 'blindbox') this.openBlindbox()
    else if (mode === 'tarot') { this.initTarot(); this.setData({ currentMode: 'tarot' }) }
    else if (mode === 'pk') { this.resetPK(); this.setData({ currentMode: 'pk' }) }
  },

  onToggleFav() {
    const { currentResult } = this.data
    const favorites = this._favorites || []
    if (!currentResult) return
    const idx = favorites.findIndex(f => f.name === currentResult.name)
    let newFavorites
    if (idx >= 0) {
      newFavorites = favorites.slice()
      newFavorites.splice(idx, 1)
    } else {
      newFavorites = [...favorites, currentResult]
    }
    this._favorites = newFavorites
    this.setData({ currentResultIsFav: idx < 0 })
    safeSet(STORAGE_KEYS.favorites, newFavorites)
  },

  // ========== 历史记录 ==========

  addToHistory(food) {
    if (!food) return
    const history = [{ name: food.name, emoji: food.emoji, date: new Date().toISOString() }, ...(this._history || [])]
    if (history.length > 50) history.length = 50
    this._history = history
    // NEW: 记录冷却族抽取时间（session 级，不写入 storage）
    if (food.cooldownFamilyId) {
      if (!this._cooldownFamilyPicks) this._cooldownFamilyPicks = {}
      this._cooldownFamilyPicks[food.cooldownFamilyId] = Date.now()
    }
    this.invalidateCache()
    this.queueStorageWrite(STORAGE_KEYS.history, history)
  },

  // ========== 转盘 ==========

  // 清理转盘相关的所有定时器
  clearWheelTimers() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null }
    if (this._spinTimer) { clearInterval(this._spinTimer); this._spinTimer = null }
    this.clearTimer('_stopTimer2')
    this.clearTimer('_revealTimer')
    this.clearTimer('_resultTimer')
    this._stopWheel = null
  },

  spinWheel() {
    if (this.data.isSpinning) return
    // 排除最近被拒绝的食物，确保"换一个"真正换菜（与其它玩法统一走 candidatePool）
    const filtered = this.candidatePool()
    if (filtered.length === 0) {
      this.setData({ showEmptyWheel: true })
      return
    }
    this.setData({ showEmptyWheel: false })
    const pool = foodLogic.buildWheelPool(filtered)
    this._wheelAngle = this._wheelAngle || 0
    // 纯 CSS 60fps 自由旋转：不再用 setData 逐帧驱动（省功耗、更顺）。
    // SPIN_PERIOD_MS 必须与 wxss 中 .wheel-free-spin 的 animation 周期保持一致。
    const SPIN_PERIOD_MS = 600
    this.setData({ isSpinning: true, isStopping: false, wheelPool: pool.map(f => ({ emoji: f.emoji })), wheelFreeSpin: true, wheelTransition: '' }, () => {
      this._spinStartTs = Date.now() // 视图更新后再记起转时刻，停时据此反推当前角度
    })
    // tick 音效用轻量定时器，仅播声音、不 setData（约每 90° 一次）
    this._tickTimer = setInterval(() => this.playTick(), SPIN_PERIOD_MS / 4)

    this._stopWheel = () => {
      if (this.data.isStopping || !this.data.wheelFreeSpin) return
      if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null }
      // 反推 CSS 动画当前角度，交接到内联 transform 时不跳变
      const elapsed = Date.now() - (this._spinStartTs || Date.now())
      const currentAngle = (elapsed / SPIN_PERIOD_MS) * 360
      const currentMod = ((currentAngle % 360) + 360) % 360
      // 同一次 setData：撤掉无限动画 + 用内联 transform 接住当前角度（无过渡），避免回弹闪烁
      this._wheelAngle = currentAngle
      this.setData({ isStopping: true, wheelFreeSpin: false, wheelTransition: '', wheelAngle: currentAngle })
      // 进化①：中奖扇区按收藏/口味偏好加权选出（落点几何由 angleForWinner 保证一致）
      const winnerIdx = foodLogic.weightedPickIndex(pool, this.buildPrefs(), null, this.buildCtx())
      const targetMod = foodLogic.angleForWinner(winnerIdx)
      const delta = (targetMod - currentMod + 360) % 360
      const extraRounds = 3 + Math.floor(Math.random() * 3)
      const finalAngle = currentAngle + extraRounds * 360 + delta
      this._wheelAngle = finalAngle
      this._wheelPendingFood = pool[winnerIdx]
      // 下一帧再设目标角度 + 减速缓动，确保"接住当前角度"已先生效（否则两次 setData 合并会从旧值直接缓动）
      this._stopTimer2 = setTimeout(() => {
        this._stopTimer2 = null
        this.setData({ wheelAngle: finalAngle, wheelTransition: 'transition: transform 2s cubic-bezier(0.16, 1, 0.3, 1);' })
        this._revealTimer = setTimeout(() => {
          this._revealTimer = null
          this.playDing()
          this.setData({ showReveal: true })
          this._resultTimer = setTimeout(() => {
            this._resultTimer = null
            this.finishWheelResult(this._wheelPendingFood)
          }, 600)
        }, 2000)
      }, 32)
    }
  },

  finishWheelResult(food) {
    if (!food) return
    // 落点已稳定：把累计角度归一到 [0,360)，避免长会话角度无限增大（mod 360 视觉等价）
    this._wheelAngle = ((this._wheelAngle % 360) + 360) % 360
    this._wheelPendingFood = null
    this.setData({
      showReveal: false,
      isSpinning: false,
      isStopping: false,
      wheelFreeSpin: false,
      wheelTransition: '',
      wheelAngle: this._wheelAngle
    })
    this.showResultModal(food, 'wheel')
  },

  stopWheel() {
    if (this._stopWheel) this._stopWheel()
  },

  // ========== 塔罗 ==========

  initTarot() {
    const pool = this.candidatePool()
    const fortune = TAROT_FORTUNES[Math.floor(Math.random() * TAROT_FORTUNES.length)]
    let tarotPool = pool.filter(fortune.filter)
    if (tarotPool.length < 3) tarotPool = pool
    // 进化①：三张牌按收藏/口味偏好加权抽取（运势过滤之上再叠个性化）
    const prefs = this.buildPrefs()
    const tarotAssigned = []
    for (let i = 0; i < 3; i++) {
      const food = tarotPool.length > 0 ? foodLogic.weightedPick(tarotPool, prefs, null, this.buildCtx()) : { emoji: '🍽️', name: '暂无' }
      tarotAssigned.push(food)
    }
    this._tarotFortuneObj = fortune
    this.setData({
      tarotAssigned: tarotAssigned.map(f => ({ emoji: f.emoji, name: f.name })),
      tarotFlipped: [false, false, false],
      tarotFortune: null,
      showTarotReset: false
    })
  },

  onFlipTarot(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const { tarotFlipped, tarotAssigned } = this.data
    if (tarotFlipped[idx]) return
    const flipped = tarotFlipped.slice()
    flipped[idx] = true
    const updates = { tarotFlipped: flipped }
    if (!tarotFlipped.some(f => f)) {
      updates.tarotFortune = this._tarotFortuneObj
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
    if (this._isRolling) {
      this.interruptRollAnimation()
    }
    this.startRollAnimation()
  },

  startRollAnimation() {
    const pool = this.candidatePool()
    if (pool.length === 0) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      this._isRolling = false
      return
    }
    this._isRolling = true
    this.noteRejected(this.data.weekFood)
    // Phase 1: 旧内容退出
    this.setData({ rollPhase: 'out' })
    this._rollTimer1 = setTimeout(() => {
      // Phase 2: 更新数据
      this.rollWeek(true, true)
      // Phase 3: 新内容进入
      this.setData({ rollPhase: 'in' })
      this._rollTimer2 = setTimeout(() => {
        // Phase 4: 清理（延迟 800ms 确保所有 animation 已完成，避免 forwards 与 class 移除冲突）
        this._isRolling = false
        this.setData({ rollPhase: '' })
      }, 800)
    }, 150)
  },

  interruptRollAnimation() {
    this.clearTimer('_rollTimer1')
    this.clearTimer('_rollTimer2')
    this._isRolling = false
    this.setData({ rollPhase: '' })
  },

  // 「今日推荐」理由：与实际推荐依据（当天星期主题）一致，而非个人历史偏好，避免解释与选菜脱节
  buildWeekReason(food) {
    if (!food) return ''
    const day = new Date().getDay()
    const theme = WEEK_THEMES[day]
    const matched = (food.tags || []).find(t => WEEK_THEME_TAGS[day].includes(t))
    return matched ? `${theme} · 适合「${matched}」一下` : `${theme} · 换换口味`
  },

  rollWeek(silent, force) {
    if (typeof silent !== 'boolean') silent = false
    const today = new Date().toDateString()
    // FIX: 同一天返回已推荐的结果
    if (!force && this._weekFoodDate === today && this._weekFood && this._weekFood.name) {
      const stillValid = this.getFilteredFoods().some(f => f.name === this._weekFood.name)
      if (stillValid) {
        this.setData({ weekFood: this._weekFood, weekReason: this.buildWeekReason(this._weekFood) })
        if (!silent) this.showResultModal(this._weekFood, 'week')
        return
      }
    }
    const pool = this.candidatePool()
    if (pool.length === 0) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      return
    }
    // FIX: 星期主题标签加权匹配
    const day = new Date().getDay()
    const themeTags = WEEK_THEME_TAGS[day]
    const prefs = { tasteCounts: {} }
    themeTags.forEach((tag, i) => { prefs.tasteCounts[tag] = (3 - i) * 2 })
    const food = foodLogic.weightedPick(pool, prefs, null, this.buildCtx())
    this._weekFoodDate = today
    this._weekFood = food
    this.queueStorageWrite(STORAGE_KEYS.weekFoodDate, today)
    this.queueStorageWrite(STORAGE_KEYS.weekFood, food)
    this.setData({ weekFood: food, weekReason: this.buildWeekReason(food) })
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
      pkPhase: 'done', // 揭晓后进入终态，防止重复点「揭晓结果」刷高默契计数；经「再来一次」重置
      pkMatch: match,
      pkPunishment: punishment ? punishment.text : '',
      pkResultTitle: title,
      pkResultText: text,
      pkResultFood: food || null
    }, () => {
      safeSet(STORAGE_KEYS.pkData, newPkData)
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
    if (this.data.blindboxOpened || this.data.blindboxShaking || this._blindboxTimer || this._blindboxRevealTimer) return
    this.setData({ blindboxShaking: true, blindboxFood: null, blindboxRarity: '' })
    this._blindboxTimer = setTimeout(() => {
      this._blindboxTimer = null
      const food = this.pickRandom()
      if (!food) {
        wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
        this.setData({ blindboxShaking: false })
        return
      }
      // FIX: 按预算映射稀有度 R/SR/SSR
      const rarityMap = { '💰': 'R', '💰💰': 'SR', '💰💰💰': 'SSR' }
      const rarity = rarityMap[food.budget] || 'R'
      this._blindboxPendingFood = food
      this._blindboxPendingRarity = rarity
      // FIX: 分阶段动画：shake → 光效 → 展示
      this.setData({ blindboxShaking: false, blindboxOpened: true, blindboxFood: food, blindboxRarity: rarity })
      // FIX: 盲盒揭晓震动反馈
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
      // 内层揭晓定时器也需追踪，否则离开页面后仍会对已卸载页面 setData
      this._blindboxRevealTimer = setTimeout(() => {
        this._blindboxRevealTimer = null
        this.finishBlindboxResult(food)
      }, 600)
    }, 800)
  },

  finishBlindboxResult(food) {
    this._blindboxPendingFood = null
    this._blindboxPendingRarity = ''
    if (food) this.showResultModal(food, 'blindbox')
  },

  clearBlindboxTimers(clearPending) {
    this.clearTimer('_blindboxTimer')
    this.clearTimer('_blindboxRevealTimer')
    if (clearPending !== false) {
      this._blindboxPendingFood = null
      this._blindboxPendingRarity = ''
    }
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
    // 空集可能由任一维度（含口味/避免/排除近期）造成，一次性全部放宽再转，避免原地打转回到空状态
    this.setData({
      filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' },
      excludeRecent: false
    }, () => {
      this.applyFilterChange()
      this.spinWheel()
    })
  },

  // NEW: 展开/收起备选项
  onToggleAlternatives() {
    this.setData({ showAlternatives: !this.data.showAlternatives })
  },

  // NEW: 显示反馈面板
  onShowFeedback() {
    this.setData({ showFeedback: true })
  },

  // NEW: 提交反馈（把当前结果标记为拒绝）
  onFeedbackSubmit(e) {
    this.noteRejected(this.data.currentResult)
    this.setData({ showFeedback: false })
    wx.showToast({ title: '已收到反馈', icon: 'none' })
  },

  // NEW: 选择备选项作为主结果
  onPickAlternative(e) {
    const idx = e.currentTarget.dataset.idx
    const alt = this.data.alternativeResults[idx]
    if (!alt) return
    const nameIndex = this._nameIndex || new Map(this._foods.map(f => [f.name, f]))
    const fullFood = nameIndex.get(alt.name)
    if (!fullFood) return
    this.noteRejected(this.data.currentResult)
    this.showResultModal(fullFood, this.data.currentResultSource)
  },

  onShareResult() {
    const { currentResult } = this.data
    if (!currentResult || this._shareBusy) return
    this._shareBusy = true
    const requestId = (this._shareRequestId || 0) + 1
    this._shareRequestId = requestId
    this.setData({ shareCanvasMounted: true }, () => {
      const start = () => this.drawShareCard(currentResult, requestId)
      if (wx.nextTick) wx.nextTick(start)
      else this._shareMountTimer = setTimeout(() => {
        this._shareMountTimer = null
        start()
      }, 0)
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
            if (requestId !== this._shareRequestId) return
            this.releaseShareCanvas()
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
            if (requestId !== this._shareRequestId) return
            this.releaseShareCanvas()
            wx.showToast({ title: '图片生成失败：' + (err.errMsg || ''), icon: 'none' })
          }
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
