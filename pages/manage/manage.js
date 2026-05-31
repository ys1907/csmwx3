const util = require('../../utils/util.js')
const foodsData = require('../../data/foods.js')
const { safeGet, safeSet } = require('../../utils/storage.js')
const foodLogic = require('../../utils/foodLogic.js')
const {
  APP_VERSION,
  STORAGE_KEYS,
  SCENE_OPTIONS,
  BUDGET_OPTIONS,
  TIME_OPTIONS,
  CATEGORY_OPTIONS
} = require('../../data/options.js')

Page({
  data: {
    foods: [],
    history: [],
    favorites: [],
    foodCount: 0,
    sceneOptions: SCENE_OPTIONS,
    budgetOptions: BUDGET_OPTIONS,
    timeOptions: TIME_OPTIONS,
    categoryOptions: CATEGORY_OPTIONS,
    newFood: { name: '', emoji: '', categoryIdx: 0, sceneIdx: 1, budgetIdx: 1, timeIdx: 1, tags: '' },
    statusBarHeight: 44,
  },

  onLoad() {
    const win = (wx.getWindowInfo && wx.getWindowInfo()) || {}
    this.setData({ statusBarHeight: win.statusBarHeight || 44 })
    this.loadData()
    // FIX: 暗黑模式系统跟随
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ darkMode: sysInfo.theme === 'dark' })
    wx.onThemeChange && wx.onThemeChange((res) => {
      this.setData({ darkMode: res.theme === 'dark' })
    })
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const localVersion = safeGet(STORAGE_KEYS.localVersion, '')
    const localFoods = safeGet(STORAGE_KEYS.foods, null)
    let foods = []

    if (localVersion === APP_VERSION && Array.isArray(localFoods) && localFoods.length > 0) {
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
    // 进化③⑤：口味画像（Spotify Wrapped）+ 决策连胜（微信运动 / Duolingo）
    const tasteProfile = foodLogic.buildTasteProfile(history, favorites, foods)
    const streak = foodLogic.computeStreak(history, Date.now())
    this.setData({ foods, history, favorites, foodCount: foods.length, historyDisplay, tasteProfile, streak })
  },

  // 历史/收藏变更后刷新画像与连胜（saveUserData 是它们唯一的落盘入口，挂在这里即可全覆盖）
  refreshProfile() {
    const { history, favorites, foods } = this.data
    this.setData({
      tasteProfile: foodLogic.buildTasteProfile(history, favorites, foods),
      streak: foodLogic.computeStreak(history, Date.now())
    })
  },

  // foods 的唯一持久化入口：增删后写回存储
  persistFoods(foods) {
    safeSet(STORAGE_KEYS.foods, foods)
    safeSet(STORAGE_KEYS.localVersion, APP_VERSION)
  },

  saveUserData() {
    const { history, favorites } = this.data
    safeSet(STORAGE_KEYS.history, history)
    safeSet(STORAGE_KEYS.favorites, favorites)
    this.refreshProfile() // 画像随历史/收藏变更而更新
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  onNewFoodName(e) { this.setData({ 'newFood.name': e.detail.value }) },
  onNewFoodEmoji(e) { this.setData({ 'newFood.emoji': e.detail.value }) },
  onNewFoodCategory(e) { this.setData({ 'newFood.categoryIdx': parseInt(e.detail.value) }) },
  onNewFoodScene(e) { this.setData({ 'newFood.sceneIdx': parseInt(e.detail.value) }) },
  onNewFoodBudget(e) { this.setData({ 'newFood.budgetIdx': parseInt(e.detail.value) }) },
  onNewFoodTime(e) { this.setData({ 'newFood.timeIdx': parseInt(e.detail.value) }) },
  onNewFoodTags(e) { this.setData({ 'newFood.tags': e.detail.value }) },

  addFood() {
    const { newFood, foods } = this.data
    const name = newFood.name.trim()
    const emoji = newFood.emoji.trim() || '🍽️'
    if (!name) {
      wx.showToast({ title: '请输入食物名称', icon: 'none' })
      return
    }
    if (foods.some(f => f.name === name)) {
      wx.showToast({ title: '该食物已存在', icon: 'none' })
      return
    }
    const food = {
      _id: util.uid(),
      name,
      emoji,
      category: CATEGORY_OPTIONS[newFood.categoryIdx],
      scene: SCENE_OPTIONS[newFood.sceneIdx],
      budget: BUDGET_OPTIONS[newFood.budgetIdx],
      time: TIME_OPTIONS[newFood.timeIdx],
      tags: newFood.tags.split(/[,，\s]+/).filter(Boolean)
    }
    const newFoods = [...foods, food]
    this.setData({
      foods: newFoods,
      foodCount: newFoods.length,
      newFood: { name: '', emoji: '', categoryIdx: 0, sceneIdx: 1, budgetIdx: 1, timeIdx: 1, tags: '' }
    }, () => {
      this.persistFoods(newFoods)
      wx.showToast({ title: '添加成功', icon: 'success' })
    })
  },

  deleteFood(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.data.foods.findIndex(f => f._id === id)
    if (idx >= 0) {
      const newFoods = this.data.foods.slice()
      newFoods.splice(idx, 1)
      this.setData({ foods: newFoods, foodCount: newFoods.length }, () => {
        this.persistFoods(newFoods)
      })
    }
  },

  deleteHistoryItem(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const { history } = this.data
    if (idx >= 0 && idx < history.length) {
      const newHistory = history.slice()
      newHistory.splice(idx, 1)
      const historyDisplay = newHistory.slice(0, 30).map(h => ({
        ...h,
        dateStr: h.date ? util.formatDate(new Date(h.date)) : ''
      }))
      this.setData({ history: newHistory, historyDisplay }, () => {
        this.saveUserData()
      })
    }
  },

  removeFavorite(e) {
    const name = e.currentTarget.dataset.name
    const { favorites } = this.data
    const newFavorites = favorites.filter(f => f.name !== name)
    this.setData({ favorites: newFavorites }, () => {
      this.saveUserData()
      wx.showToast({ title: '已取消收藏', icon: 'success' })
    })
  },

  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空最近记录吗？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [], historyDisplay: [] }, () => {
            this.saveUserData()
            wx.showToast({ title: '已清空', icon: 'success' })
          })
        }
      }
    })
  },

  clearFavorites() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空爱吃榜吗？',
      confirmColor: '#FF3B30',
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

  // FIX: 数据导出（JSON 到剪贴板）
  exportData() {
    const { foods, history, favorites } = this.data
    const pkData = safeGet(STORAGE_KEYS.pkData, { matches: 0, total: 0 })
    const payload = {
      version: APP_VERSION,
      exportAt: new Date().toISOString(),
      foods: foods.filter(f => !foodsData.some(df => df.name === f.name && df._id)),
      history,
      favorites,
      pkData
    }
    const json = JSON.stringify(payload, null, 2)
    wx.setClipboardData({
      data: json,
      success: () => wx.showToast({ title: '数据已复制到剪贴板', icon: 'success' })
    })
  },

  // FIX: 数据导入（从剪贴板 JSON）
  importData() {
    wx.getClipboardData({
      success: (res) => {
        try {
          const payload = JSON.parse(res.data)
          if (!payload || typeof payload !== 'object') throw new Error('格式错误')
          const { foods: importFoods, history: importHistory, favorites: importFavorites, pkData: importPk } = payload
          const { foods, history, favorites } = this.data
          // 合并食物，按名称去重
          const nameSet = new Set(foods.map(f => f.name))
          const mergedFoods = foods.slice()
          if (Array.isArray(importFoods)) {
            importFoods.forEach(f => {
              if (f && f.name && !nameSet.has(f.name)) {
                mergedFoods.push(util.migrateFood(f))
                nameSet.add(f.name)
              }
            })
          }
          // 合并历史，按名称+日期去重
          const historyKeySet = new Set(history.map(h => h.name + '|' + h.date))
          const mergedHistory = history.slice()
          if (Array.isArray(importHistory)) {
            importHistory.forEach(h => {
              const key = h.name + '|' + h.date
              if (!historyKeySet.has(key)) {
                mergedHistory.push(h)
                historyKeySet.add(key)
              }
            })
          }
          // 合并收藏，按名称去重
          const favNameSet = new Set(favorites.map(f => f.name))
          const mergedFavorites = favorites.slice()
          if (Array.isArray(importFavorites)) {
            importFavorites.forEach(f => {
              if (f && f.name && !favNameSet.has(f.name)) {
                mergedFavorites.push(f)
                favNameSet.add(f.name)
              }
            })
          }
          this.setData({
            foods: mergedFoods,
            history: mergedHistory,
            favorites: mergedFavorites,
            foodCount: mergedFoods.length
          }, () => {
            this.persistFoods(mergedFoods)
            this.saveUserData()
            if (importPk && typeof importPk === 'object') {
              safeSet(STORAGE_KEYS.pkData, importPk)
            }
            wx.showToast({ title: '导入成功', icon: 'success' })
          })
        } catch (e) {
          wx.showToast({ title: '剪贴板数据格式错误', icon: 'none' })
        }
      }
    })
  },
})
