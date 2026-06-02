const util = require('../../utils/util.js')
const foodsData = require('../../data/foods.js')
const { safeGet, safeSet } = require('../../utils/storage.js')
const foodLogic = require('../../utils/foodLogic.js')
const {
  APP_VERSION,
  FOODS_SEED_VERSION,
  STORAGE_KEYS,
  SCENE_OPTIONS,
  BUDGET_OPTIONS,
  TIME_OPTIONS,
  CATEGORY_OPTIONS
} = require('../../data/options.js')

const MANAGE_PAGE_SIZE = 40 // 菜品列表单批渲染数量（分批渲染，避免一次性把数百道菜全部塞进渲染层）

Page({
  data: {
    displayFoods: [],            // 当前渲染切片（全量在 this._foods 实例上，不进 data）
    filteredCount: 0,            // 当前搜索/分类命中总数
    hasMore: false,              // 是否还有未渲染的菜品（控制「显示更多」）
    historyDisplay: [],
    favorites: [],
    foodCount: 0,
    sceneOptions: SCENE_OPTIONS,
    budgetOptions: BUDGET_OPTIONS,
    timeOptions: TIME_OPTIONS,
    categoryOptions: CATEGORY_OPTIONS,
    categoryFilterOptions: ['全部', ...CATEGORY_OPTIONS],
    categoryFilterIdx: 0,
    searchText: '',
    // 新增/编辑 Sheet
    showFoodSheet: false,
    editingId: null,             // null=新增，否则编辑该 _id
    foodForm: { name: '', emoji: '', categoryIdx: 0, sceneIdx: 1, budgetIdx: 1, timeIdx: 1, tags: '' },
    statusBarHeight: 44,
  },

  onLoad() {
    this._isPageVisible = true
    const win = (wx.getWindowInfo && wx.getWindowInfo()) || {}
    this.setData({ statusBarHeight: win.statusBarHeight || 44 })
    // 暗黑模式系统跟随
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ darkMode: sysInfo.theme === 'dark' })
    this._offThemeChange = wx.onThemeChange && wx.onThemeChange((res) => {
      const darkMode = res.theme === 'dark'
      if (this._isPageVisible) this.setData({ darkMode })
      else this._pendingDarkMode = darkMode
    })
  },

  onHide() {
    this._isPageVisible = false
  },

  onUnload() {
    this._isPageVisible = false
    if (this._offThemeChange) { this._offThemeChange(); this._offThemeChange = null }
  },

  onShow() {
    this._isPageVisible = true
    if (typeof this._pendingDarkMode === 'boolean') {
      this.setData({ darkMode: this._pendingDarkMode })
      this._pendingDarkMode = null
    }
    this.loadData()
  },

  loadData() {
    const localVersion = safeGet(STORAGE_KEYS.localVersion, '')
    const localFoods = safeGet(STORAGE_KEYS.foods, null)
    let foods = []
    if (localVersion === FOODS_SEED_VERSION && Array.isArray(localFoods) && localFoods.length > 0) {
      foods = localFoods.map(util.migrateFood)
    } else {
      foods = foodsData.map(util.migrateFood)
    }

    const history = safeGet(STORAGE_KEYS.history, [])
    const favorites = safeGet(STORAGE_KEYS.favorites, [])
    const historyDisplay = history.slice(0, 30).map(h => ({
      ...h,
      dateStr: h.date ? util.formatDate(new Date(h.date)) : ''
    }))
    // 口味画像 + 决策连胜
    const tasteProfile = foodLogic.buildTasteProfile(history, favorites, foods)
    const streak = foodLogic.computeStreak(history, Date.now())
    this._foods = foods // 全量菜品库放实例上，不进 data（避免大数组跨渲染层序列化）
    this._history = history
    this.computeDisplayFoods(true, { favorites, foodCount: foods.length, historyDisplay, tasteProfile, streak })
  },

  // 按搜索词 + 分类过滤；全量结果存实例 this._filtered，data 只放当前切片，避免一次性渲染数百节点
  computeDisplayFoods(resetPage, updates) {
    updates = updates || {}
    const searchText = Object.prototype.hasOwnProperty.call(updates, 'searchText') ? updates.searchText : this.data.searchText
    const categoryFilterIdx = Object.prototype.hasOwnProperty.call(updates, 'categoryFilterIdx') ? updates.categoryFilterIdx : this.data.categoryFilterIdx
    const { categoryFilterOptions } = this.data
    const q = (searchText || '').trim()
    const cat = categoryFilterIdx > 0 ? categoryFilterOptions[categoryFilterIdx] : null
    const filtered = (this._foods || []).filter(f => {
      if (cat && f.category !== cat) return false
      if (q && f.name.indexOf(q) < 0) return false
      return true
    })
    this._filtered = filtered
    if (resetPage || !this._shown) this._shown = MANAGE_PAGE_SIZE
    const shown = Math.min(this._shown, filtered.length)
    this.setData({
      ...updates,
      displayFoods: filtered.slice(0, shown),
      filteredCount: filtered.length,
      hasMore: filtered.length > shown
    })
  },

  // 「显示更多」：再渲染一批
  showMoreFoods() {
    this._shown = (this._shown || MANAGE_PAGE_SIZE) + MANAGE_PAGE_SIZE
    this.computeDisplayFoods(false)
  },

  onSearchInput(e) {
    this.computeDisplayFoods(true, { searchText: e.detail.value })
  },
  onClearSearch() {
    this.computeDisplayFoods(true, { searchText: '' })
  },

  onClearSearchAndFilter() {
    this.computeDisplayFoods(true, { searchText: '', categoryFilterIdx: 0 })
  },
  onCategoryFilter(e) {
    this.computeDisplayFoods(true, { categoryFilterIdx: parseInt(e.currentTarget.dataset.index) })
  },

  refreshProfile() {
    const favorites = this.data.favorites
    const history = this._history || []
    this.setData({
      tasteProfile: foodLogic.buildTasteProfile(history, favorites, this._foods || []),
      streak: foodLogic.computeStreak(history, Date.now())
    })
  },

  // foods 的唯一持久化入口
  persistFoods(foods) {
    safeSet(STORAGE_KEYS.foods, foods)
    safeSet(STORAGE_KEYS.localVersion, FOODS_SEED_VERSION)
    safeSet(STORAGE_KEYS.foodsRev, Date.now()) // 标记菜品库已变更，首页据此决定是否重建全量 foods
  },

  saveUserData() {
    const favorites = this.data.favorites
    const history = this._history || []
    safeSet(STORAGE_KEYS.history, history)
    safeSet(STORAGE_KEYS.favorites, favorites)
    this.refreshProfile()
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  onModalContentTap() {
    // 阻止冒泡，点击 Sheet 内容不关闭
  },

  // ===== 新增 / 编辑 Sheet =====

  openAddSheet() {
    this.setData({
      showFoodSheet: true,
      editingId: null,
      foodForm: { name: '', emoji: '', categoryIdx: 0, sceneIdx: 1, budgetIdx: 1, timeIdx: 1, tags: '' }
    })
  },

  openEditSheet(e) {
    const id = e.currentTarget.dataset.id
    const food = (this._foods || []).find(f => f._id === id)
    if (!food) return
    const sIdx = SCENE_OPTIONS.indexOf(food.scene)
    const bIdx = BUDGET_OPTIONS.indexOf(food.budget)
    const tIdx = TIME_OPTIONS.indexOf(food.time)
    const cIdx = CATEGORY_OPTIONS.indexOf(food.category)
    this.setData({
      showFoodSheet: true,
      editingId: id,
      foodForm: {
        name: food.name,
        emoji: food.emoji,
        categoryIdx: cIdx >= 0 ? cIdx : 0,
        sceneIdx: sIdx > 0 ? sIdx : 1,
        budgetIdx: bIdx > 0 ? bIdx : 1,
        timeIdx: tIdx > 0 ? tIdx : 1,
        tags: (food.tags || []).join(',')
      }
    })
  },

  closeFoodSheet() {
    this.setData({ showFoodSheet: false })
  },

  onFormName(e) { this.setData({ 'foodForm.name': e.detail.value }) },
  onFormEmoji(e) { this.setData({ 'foodForm.emoji': e.detail.value }) },
  onFormCategory(e) { this.setData({ 'foodForm.categoryIdx': parseInt(e.detail.value) }) },
  onFormScene(e) { this.setData({ 'foodForm.sceneIdx': parseInt(e.detail.value) }) },
  onFormBudget(e) { this.setData({ 'foodForm.budgetIdx': parseInt(e.detail.value) }) },
  onFormTime(e) { this.setData({ 'foodForm.timeIdx': parseInt(e.detail.value) }) },
  onFormTags(e) {
    const tagsStr = e.detail.value
    const tagsPreview = (tagsStr || '').split(/[,，\s]+/).filter(Boolean)
    this.setData({ 'foodForm.tags': tagsStr, foodFormTagsPreview: tagsPreview })
  },

  saveFood() {
    const { foodForm, editingId } = this.data
    const foods = this._foods || []
    const name = (foodForm.name || '').trim()
    const emoji = (foodForm.emoji || '').trim() || '🍽️'
    if (!name) {
      wx.showToast({ title: '请输入食物名称', icon: 'none' })
      return
    }
    if (foods.some(f => f.name === name && f._id !== editingId)) {
      wx.showToast({ title: '该食物已存在', icon: 'none' })
      return
    }
    const tags = (foodForm.tags || '').split(/[,，\s]+/).filter(Boolean)
    const fields = {
      name, emoji,
      category: CATEGORY_OPTIONS[foodForm.categoryIdx],
      scene: SCENE_OPTIONS[foodForm.sceneIdx],
      budget: BUDGET_OPTIONS[foodForm.budgetIdx],
      time: TIME_OPTIONS[foodForm.timeIdx],
      tags
    }
    let newFoods
    if (editingId) {
      newFoods = foods.map(f => f._id === editingId ? { ...f, ...fields } : f)
    } else {
      newFoods = [...foods, { _id: util.uid(), ...fields }]
    }
    this._foods = newFoods
    this.setData({ foodCount: newFoods.length, showFoodSheet: false }, () => {
      this.persistFoods(newFoods)
      this.computeDisplayFoods(false)
      wx.showToast({ title: editingId ? '已保存' : '添加成功', icon: 'success' })
    })
  },

  // 删除（破坏性，需确认）
  deleteFood(e) {
    const id = e.currentTarget.dataset.id || this.data.editingId
    const food = (this._foods || []).find(f => f._id === id)
    wx.showModal({
      title: '删除菜品',
      content: food ? `确定删除「${food.name}」吗？` : '确定删除吗？',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (!res.confirm) return
        const newFoods = (this._foods || []).filter(f => f._id !== id)
        this._foods = newFoods
        this.setData({ foodCount: newFoods.length, showFoodSheet: false }, () => {
          this.persistFoods(newFoods)
          this.computeDisplayFoods(false)
          wx.showToast({ title: '已删除', icon: 'success' })
        })
      }
    })
  },

  // ===== 历史 / 收藏 =====

  deleteHistoryItem(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const history = this._history || []
    if (idx >= 0 && idx < history.length) {
      const newHistory = history.slice()
      newHistory.splice(idx, 1)
      this._history = newHistory
      const historyDisplay = newHistory.slice(0, 30).map(h => ({
        ...h,
        dateStr: h.date ? util.formatDate(new Date(h.date)) : ''
      }))
      this.setData({ historyDisplay }, () => {
        this.saveUserData()
      })
    }
  },

  removeFavorite(e) {
    const name = e.currentTarget.dataset.name
    const newFavorites = this.data.favorites.filter(f => f.name !== name)
    this.setData({ favorites: newFavorites }, () => {
      this.saveUserData()
      wx.showToast({ title: '已取消收藏', icon: 'success' })
    })
  },

  clearHistory() {
    wx.showModal({
      title: '确认清空', content: '确定要清空最近记录吗？', confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          this._history = []
          this.setData({ historyDisplay: [] }, () => {
            this.saveUserData()
            wx.showToast({ title: '已清空', icon: 'success' })
          })
        }
      }
    })
  },

  clearFavorites() {
    wx.showModal({
      title: '确认清空', content: '确定要清空爱吃榜吗？', confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          this.setData({ favorites: [] }, () => {
            this.saveUserData()
            wx.showToast({ title: '已清空', icon: 'success' })
          })
        }
      }
    })
  },

  // ===== 数据导出 / 导入 =====

  exportData() {
    const favorites = this.data.favorites
    const history = this._history || []
    const foods = this._foods || []
    const pkData = safeGet(STORAGE_KEYS.pkData, { matches: 0, total: 0 })
    // 仅导出「新增 + 被编辑过」的菜：按 _id 比对内置种子并逐字段判断差异，
    // 避免旧逻辑「按菜名剔除内置菜」导致改过的内置菜被当作原版而丢失编辑
    const seedById = new Map(foodsData.map(util.migrateFood).map(f => [f._id, f]))
    const isCustomOrEdited = (f) => {
      const seed = seedById.get(f._id)
      if (!seed) return true
      return f.name !== seed.name || f.emoji !== seed.emoji || f.category !== seed.category ||
        f.scene !== seed.scene || f.budget !== seed.budget || f.time !== seed.time ||
        (f.tags || []).join(',') !== (seed.tags || []).join(',')
    }
    const payload = {
      version: APP_VERSION,
      exportAt: new Date().toISOString(),
      foods: foods.filter(isCustomOrEdited),
      history,
      favorites,
      pkData
    }
    wx.setClipboardData({
      data: JSON.stringify(payload, null, 2),
      success: () => wx.showToast({ title: '数据已复制到剪贴板', icon: 'success' })
    })
  },

  importData() {
    wx.getClipboardData({
      success: (res) => {
        try {
          const payload = JSON.parse(res.data)
          if (!payload || typeof payload !== 'object') throw new Error('格式错误')
          const { foods: importFoods, history: importHistory, favorites: importFavorites, pkData: importPk } = payload
          const favorites = this.data.favorites
          const history = this._history || []
          // 按 _id 优先合并：同 _id 覆盖（恢复对内置菜的编辑），同名异 id 合并字段保留本地 id，全新菜追加
          const mergedFoods = (this._foods || []).slice()
          const idIndex = new Map(mergedFoods.map((f, i) => [f._id, i]))
          const nameIndex = new Map(mergedFoods.map((f, i) => [f.name, i]))
          if (Array.isArray(importFoods)) {
            importFoods.forEach(raw => {
              if (!raw || !raw.name) return
              const f = util.migrateFood(raw)
              if (idIndex.has(f._id)) {
                mergedFoods[idIndex.get(f._id)] = f
              } else if (nameIndex.has(f.name)) {
                const i = nameIndex.get(f.name)
                mergedFoods[i] = { ...mergedFoods[i], ...f, _id: mergedFoods[i]._id }
              } else {
                const i = mergedFoods.push(f) - 1
                idIndex.set(f._id, i)
                nameIndex.set(f.name, i)
              }
            })
          }
          const historyKeySet = new Set(history.map(h => h.name + '|' + h.date))
          const mergedHistory = history.slice()
          if (Array.isArray(importHistory)) {
            importHistory.forEach(h => {
              const key = h.name + '|' + h.date
              if (!historyKeySet.has(key)) { mergedHistory.push(h); historyKeySet.add(key) }
            })
          }
          const favNameSet = new Set(favorites.map(f => f.name))
          const mergedFavorites = favorites.slice()
          if (Array.isArray(importFavorites)) {
            importFavorites.forEach(f => {
              if (f && f.name && !favNameSet.has(f.name)) { mergedFavorites.push(f); favNameSet.add(f.name) }
            })
          }
          this._foods = mergedFoods
          this._history = mergedHistory
          const historyDisplay = mergedHistory.slice(0, 30).map(h => ({
            ...h,
            dateStr: h.date ? util.formatDate(new Date(h.date)) : ''
          }))
          this.setData({
            historyDisplay,
            favorites: mergedFavorites,
            foodCount: mergedFoods.length
          }, () => {
            this.persistFoods(mergedFoods)
            this.saveUserData()
            if (importPk && typeof importPk === 'object') safeSet(STORAGE_KEYS.pkData, importPk)
            this.computeDisplayFoods(false)
            wx.showToast({ title: '导入成功', icon: 'success' })
          })
        } catch (e) {
          wx.showToast({ title: '剪贴板数据格式错误', icon: 'none' })
        }
      }
    })
  },
})
