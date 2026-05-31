const util = require('../../utils/util.js')
const foodsData = require('../../data/foods.js')
const { TICK_SOUND, DING_SOUND } = require('../../data/sounds.js')

const APP_VERSION = 'v3'
const STORAGE_KEYS = {
  foods: 'wtec_foods_' + APP_VERSION,
  history: 'wtec_history_' + APP_VERSION,
  favorites: 'wtec_fav_' + APP_VERSION,
  pkData: 'wtec_pk_' + APP_VERSION,
  localVersion: 'wtec_foods_local_version'
}

const TAROT_FORTUNES = [
  { title: '✨ 天使之恩', text: '今天的食运充沛，选的这道菜能带来好心情，适合两人一起享用。', filter: () => true },
  { title: '🔥 烈焰之力', text: '今天需要热情的味道，较重口的菜式能点燃你们的胃口。', filter: (f) => f.tags && f.tags.includes('辣') || f.category === '火锅烧烤' },
  { title: '🌙 月光之静', text: '今天适合清淡一些，养胃又舒心，适合安静的二人时光。', filter: (f) => f.time === '慢' || f.category === '轻食' || (f.tags && f.tags.includes('清淡')) },
  { title: '💫 星辰之光', text: '今天是探索新味道的好日子，大胆尝试吧！', filter: (f) => f.scene === '堂食' || (f.tags && f.tags.includes('鲜')) },
  { title: '🌊 海洋之心', text: '今天适合鲜味，海鲜或清新的口感会让你们满足。', filter: (f) => (f.tags && f.tags.includes('鲜')) || /鱼|虾|蟹|贝|海鲜/.test(f.name) },
  { title: '🌱 大地之恩', text: '今天适合实在的味道，主食或家常菜最佳。', filter: (f) => f.category === '中式快餐' || f.category === '家常菜' || f.category === '火锅烧烤' },
  { title: '⚡ 雷电之力', text: '今天需要快速充能，方便又好吃的是首选。', filter: (f) => f.time === '快' || f.scene === '外卖' }
]

const WEEK_THEMES = ['周一能量站', '周二小确幸', '周三午后惊喜', '周四愉悦时刻', '周五度假前夕', '周六浪漫日', '周日休闲时光']
const PK_CATEGORIES = ['辣', '甜', '酸', '鲜', '烤', '蒸', '炒', '煮', '炸']

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
const WHEEL_COLORS = ['#FF6B6B','#FF9F43','#FFCD56','#4BC0C0','#36A2EB','#9966FF','#FF99CC','#C9CBCF']

const SCENE_OPTIONS = ['全部场景', '外卖', '堂食', '自己做', '公司食堂']
const BUDGET_OPTIONS = ['全部预算', '💰', '💰💰', '💰💰💰']
const TIME_OPTIONS = ['全部时间', '快', '慢']
const CATEGORY_OPTIONS = ['中式快餐', '西式', '日韩', '轻食', '火锅烧烤', '街边小吃', '家常菜']

Page({
  data: {
    // 状态数据
    foods: [],
    history: [],
    favorites: [],
    pkData: { matches: 0, total: 0 },
    excludeRecent: true,
    filters: { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, avoid: '' },
    currentMode: 'wheel',
    currentResult: null,
    isSpinning: false,
    isStopping: false,
    tarotAssigned: [],
    tarotFlipped: [false, false, false],
    tarotFortune: null,
    showTarotReset: false,
    showResult: false,
    showBlindboxResult: false,
    pkSelections: { A: null, B: null },
    pkCats: [],
    showPKReveal: false,
    showPKReset: false,
    pkMatch: false,
    pkResultText: '',
    pkResultTitle: '',
    pkPunishment: '',
    showReveal: false,
    showEmptyWheel: false,
    blindboxOpened: false,
    blindboxShaking: false,
    wheelAngle: 0,
    wheelTransition: '',
    wheelPool: [],
    blindboxFood: null,
    weekFood: null,
    weekTheme: '',
    foodCount: 0,
    historyDisplay: [],
    favoritesDisplay: [],
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
    categoryOptions: CATEGORY_OPTIONS,
    // 缓存
    _filteredCache: null,
    _cacheKey: '',
    // 启动页
    showIntro: true,
    introFading: false,
  },

  onLoad() {
    this.initData()
    setTimeout(() => {
      this.setData({ introFading: true })
      setTimeout(() => {
        this.setData({ showIntro: false, introFading: false })
      }, 800)
    }, 2000)
  },

  onShow() {
    this.initData()
  },

  onReady() {
  },

  // ========== 初始化 ==========

  initData() {
    const localVersion = wx.getStorageSync(STORAGE_KEYS.localVersion)
    const localFoods = wx.getStorageSync(STORAGE_KEYS.foods)
    let foods = []

    if (localVersion === APP_VERSION && Array.isArray(localFoods) && localFoods.length > 0) {
      foods = localFoods.map(util.migrateFood)
    } else {
      foods = foodsData.map(util.migrateFood)
    }

    const history = wx.getStorageSync(STORAGE_KEYS.history) || []
    const favorites = wx.getStorageSync(STORAGE_KEYS.favorites) || []
    const pkData = wx.getStorageSync(STORAGE_KEYS.pkData) || { matches: 0, total: 0 }

    const now = new Date()
    const headerDate = now.toLocaleDateString('zh-CN', { weekday: 'long', month: 'short', day: 'numeric' })
    const day = now.getDay()
    const weekTheme = WEEK_THEMES[day === 0 ? 6 : day - 1]

    this.setData({ foods, history, favorites, pkData, headerDate, weekTheme, weekSubtitle: '今天的主题是专属于你们的味道' }, () => {
      this.invalidateCache()
      this.updateFilteredFoods()
      this.updateDisplays()
      this.initTarot()
    })
  },

  // ========== 存储 ==========

  saveState() {
    const { foods, history, favorites, pkData } = this.data
    wx.setStorageSync(STORAGE_KEYS.foods, foods)
    wx.setStorageSync(STORAGE_KEYS.localVersion, APP_VERSION)
    wx.setStorageSync(STORAGE_KEYS.history, history)
    wx.setStorageSync(STORAGE_KEYS.favorites, favorites)
    wx.setStorageSync(STORAGE_KEYS.pkData, pkData)
  },

  // ========== 过滤与缓存 ==========

  invalidateCache() {
    this.setData({ _filteredCache: null, _cacheKey: '' })
  },

  getFilteredFoods() {
    const { foods, filters, excludeRecent, history, _filteredCache, _cacheKey } = this.data
    const key = JSON.stringify({ s: filters.sceneIdx, b: filters.budgetIdx, t: filters.timeIdx, a: filters.avoid, e: excludeRecent, h: history.length })
    if (_filteredCache && _cacheKey === key) return _filteredCache

    this.setData({ _cacheKey: key })

    const recentNames = new Set()
    if (excludeRecent && history.length > 0) {
      const now = Date.now()
      const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
      history.forEach(h => {
        try {
          const d = new Date(h.date).getTime()
          if (!Number.isNaN(d) && (now - d) <= THREE_DAYS) recentNames.add(h.name)
        } catch (e) {}
      })
    }

    const avoidSet = new Set(filters.avoid.split(/[,，\s]+/).filter(Boolean))
    const sceneValue = SCENE_OPTIONS[filters.sceneIdx]
    const budgetValue = BUDGET_OPTIONS[filters.budgetIdx]
    const timeValue = TIME_OPTIONS[filters.timeIdx]

    const result = foods.filter(f => {
      if (filters.sceneIdx > 0 && f.scene !== sceneValue) return false
      if (filters.budgetIdx > 0 && f.budget !== budgetValue) return false
      if (filters.timeIdx > 0 && f.time !== timeValue) return false
      if (excludeRecent && recentNames.has(f.name)) return false
      if (avoidSet.size > 0) {
        const foodTags = new Set(f.tags || [])
        for (const a of avoidSet) if (foodTags.has(a)) return false
      }
      return true
    })

    this.setData({ _filteredCache: result })
    return result
  },

  pickRandom(fromPool) {
    const pool = fromPool || this.getFilteredFoods()
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  },

  updateFilteredFoods() {
    const filtered = this.getFilteredFoods()
    const maxDisplay = 50
    const display = filtered.slice(0, maxDisplay)
    const showHint = filtered.length > maxDisplay
    const hintText = showHint ? `显示前${maxDisplay}个，共${filtered.length}个` : ''
    // 随机选取 8 个用于转盘
    const wheelPool = util.shuffleArray(filtered).slice(0, 8)
    this.setData({
      wheelPool
    })
  },

  updateDisplays() {
    const { history, favorites } = this.data
    this.setData({
      historyDisplay: history.slice(0, 15).map(h => {
        const dateStr = h.date ? new Date(h.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''
        return { ...h, dateStr }
      }),
      favoritesDisplay: favorites
    })
  },

  // ========== 筛选器事件 ==========

  onSceneChange(e) {
    this.setData({ 'filters.sceneIdx': e.detail.value }, () => {
      this.invalidateCache()
      this.updateFilteredFoods()
    })
  },

  onBudgetChange(e) {
    this.setData({ 'filters.budgetIdx': e.detail.value }, () => {
      this.invalidateCache()
      this.updateFilteredFoods()
    })
  },

  onTimeChange(e) {
    this.setData({ 'filters.timeIdx': e.detail.value }, () => {
      this.invalidateCache()
      this.updateFilteredFoods()
    })
  },

  onAvoidInput(e) {
    const value = e.detail.value
    this.setData({ 'filters.avoid': value })
    clearTimeout(this._avoidTimer)
    this._avoidTimer = setTimeout(() => {
      this.invalidateCache()
      this.updateFilteredFoods()
    }, 300)
  },

  onToggleExclude() {
    const excludeRecent = !this.data.excludeRecent
    this.setData({ excludeRecent }, () => {
      this.invalidateCache()
      this.updateFilteredFoods()
    })
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
  },

  // ========== Tab 切换 ==========

  onWheelBtnTap() {
    if (this.data.isSpinning) this.stopWheel()
    else this.spinWheel()
  },

  switchTab(e) {
    const mode = e.currentTarget.dataset.mode
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

  onModalContentTap(e) {
    // 阻止冒泡，防止点击模态框内容时关闭
  },

  onConfirmResult() {
    this.setData({ showResult: false, blindboxOpened: false, blindboxFood: null })
  },

  onRetryResult() {
    const mode = this.data.currentMode
    this.setData({ showResult: false, blindboxOpened: false, blindboxFood: null })
    if (mode === 'wheel') this.spinWheel()
    else if (mode === 'week') this.rollWeek()
    else if (mode === 'blindbox') this.openBlindbox()
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
      this.updateDisplays()
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
      this.updateDisplays()
    })
  },

  // ========== 转盘 ==========

  spinWheel() {
    if (this.data.isSpinning) return
    const filtered = this.getFilteredFoods()
    if (filtered.length === 0) {
      this.setData({ showEmptyWheel: true })
      return
    }
    this.setData({ showEmptyWheel: false })
    const pool = util.shuffleArray(filtered).slice(0, 8)
    this._wheelAngle = this._wheelAngle || 0
    this.setData({ isSpinning: true, isStopping: false, wheelPool: pool, wheelTransition: 'transition: transform 0.08s linear;', wheelAngle: this._wheelAngle })
    // 无限旋转：每 50ms 更新角度，不使用 CSS transition
    this._spinTimer = setInterval(() => {
      this._wheelAngle += 30
      this.setData({ wheelAngle: this._wheelAngle })
      if (Math.floor(this._wheelAngle / 45) !== this._lastTickSector) {
        this._lastTickSector = Math.floor(this._wheelAngle / 45)
        this.playTick()
      }
    }, 50)
    this._lastTickSector = -1

    this._stopWheel = () => {
      if (this.data.isStopping || !this._spinTimer) return
      clearInterval(this._spinTimer)
      this._spinTimer = null
      this.setData({ isStopping: true })
      // 计算最终角度：再转 3-5 圈 + 停在某个扇区
      const extraRounds = 3 + Math.floor(Math.random() * 3)
      const stopSector = Math.floor(Math.random() * 8)
      const sectorOffset = stopSector * 45 + 22.5
      const finalAngle = this._wheelAngle + extraRounds * 360 + (360 - sectorOffset)
      this._wheelAngle = finalAngle
      this.setData({ wheelAngle: this._wheelAngle, wheelTransition: 'transition: transform 3s cubic-bezier(0.15, 0.5, 0.3, 1);' })
      setTimeout(() => {
        this.playDing()
        this.setData({ showReveal: true })
        setTimeout(() => {
          this.setData({ showReveal: false, isSpinning: false, isStopping: false })
          const normalized = ((this._wheelAngle % 360) + 360) % 360
          const pointerAt = (360 - normalized + 22.5) % 360
          const idx = Math.floor(pointerAt / 45) % 8
          this.showResultModal(pool[idx], 'wheel')
        }, 600)
      }, 3000)
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
    const tarotAssigned = []
    for (let i = 0; i < 3; i++) {
      const food = tarotPool.length > 0 ? tarotPool[Math.floor(Math.random() * tarotPool.length)] : { emoji: '🍽️', name: '暂无' }
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
  },

  onResetTarot() {
    this.initTarot()
  },

  // ========== 星期 ==========

  rollWeek() {
    const pool = this.getFilteredFoods()
    const food = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null
    if (!food) {
      wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
      return
    }
    this.setData({ weekFood: food })
    this.showResultModal(food, 'week')
  },

  // ========== PK ==========

  initPK() {
    const cats = []
    while (cats.length < 6) {
      const c = PK_CATEGORIES[Math.floor(Math.random() * PK_CATEGORIES.length)]
      if (!cats.includes(c)) cats.push(c)
    }
    this.setData({
      pkSelections: { A: null, B: null },
      pkCats: cats,
      showPKReveal: false,
      showPKReset: false,
      pkMatch: false,
      pkResultTitle: '',
      pkResultText: ''
    })
  },

  selectPK(e) {
    const side = e.currentTarget.dataset.side
    const cat = e.currentTarget.dataset.cat
    const { pkSelections } = this.data
    if (pkSelections[side] !== null) return
    const newSelections = { ...pkSelections, [side]: cat }
    this.setData({ pkSelections: newSelections }, () => {
      if (newSelections.A !== null && newSelections.B !== null) {
        this.setData({ showPKReveal: true })
      }
    })
  },

  revealPK() {
    const { pkSelections, pkData } = this.data
    const match = pkSelections.A === pkSelections.B
    const newPkData = { ...pkData, total: pkData.total + 1, matches: pkData.matches + (match ? 1 : 0) }
    const punishments = PK_PUNISHMENTS.filter(p => p.match === match)
    const punishment = punishments[Math.floor(Math.random() * punishments.length)]
    this.setData({ pkData: newPkData, showPKReveal: false, showPKReset: true, pkMatch: match, pkPunishment: punishment ? punishment.text : '' }, () => {
      this.saveState()
      const pool = this.getFilteredFoods().filter(f => f.tags && f.tags.includes(pkSelections.A))
      const food = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : this.pickRandom()
      const pct = newPkData.total > 0 ? Math.round(newPkData.matches / newPkData.total * 100) : 0
      const title = match ? '🎉 默契成功！' : '😌 有点不同，但也很棒'
      const text = match
        ? `你们都选了"${pkSelections.A}"，默契度 ${pct}%！今天就吃 ${food ? food.name : '大餐'}吧~`
        : `你选了"${pkSelections.A}"，TA选了"${pkSelections.B}"，不过这道${food ? food.name : ''}能让你们都满意~`
      this.setData({ pkResultTitle: title, pkResultText: text })
      if (food) this.addToHistory(food)
    })
  },

  resetPK() {
    this.initPK()
  },

  // ========== 盲盒 ==========

  openBlindbox() {
    if (this.data.blindboxOpened) return
    this.setData({ blindboxShaking: true })
    setTimeout(() => {
      this.setData({ blindboxShaking: false, blindboxOpened: true })
      const food = this.pickRandom()
      if (!food) {
        wx.showToast({ title: '没有符合条件的食物', icon: 'none' })
        this.setData({ blindboxOpened: false })
        return
      }
      this.showResultModal(food, 'blindbox')
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
  },

  playDing() {
    if (!this._dingAudio) {
      this._dingAudio = wx.createInnerAudioContext()
      this._dingAudio.src = DING_SOUND
      this._dingAudio.volume = 0.5
    }
    this._dingAudio.stop()
    this._dingAudio.play()
  },

  // ========== 空状态处理 ==========

  onRelaxedSpin() {
    const { filters } = this.data
    const relaxed = { ...filters }
    if (relaxed.sceneIdx > 0) relaxed.sceneIdx = 0
    else if (relaxed.budgetIdx > 0) relaxed.budgetIdx = 0
    else if (relaxed.timeIdx > 0) relaxed.timeIdx = 0
    this.setData({ filters: relaxed }, () => {
      this.invalidateCache()
      this.updateFilteredFoods()
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
        const dpr = wx.getSystemInfoSync().pixelRatio
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
