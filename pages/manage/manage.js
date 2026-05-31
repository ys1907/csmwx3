const util = require('../../utils/util.js')
const foodsData = require('../../data/foods.js')

const APP_VERSION = 'v3'
const STORAGE_KEYS = {
  foods: 'wtec_foods_' + APP_VERSION,
  history: 'wtec_history_' + APP_VERSION,
  favorites: 'wtec_fav_' + APP_VERSION,
  localVersion: 'wtec_foods_local_version'
}

const SCENE_OPTIONS = ['全部场景', '外卖', '堂食', '自己做', '公司食堂']
const BUDGET_OPTIONS = ['全部预算', '💰', '💰💰', '💰💰💰']
const TIME_OPTIONS = ['全部时间', '快', '慢']
const CATEGORY_OPTIONS = ['中式快餐', '西式', '日韩', '轻食', '火锅烧烤', '街边小吃', '家常菜']

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
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const localVersion = wx.getStorageSync(STORAGE_KEYS.localVersion)
    const localFoods = wx.getStorageSync(STORAGE_KEYS.foods)
    let foods = []

    if (localVersion === APP_VERSION && Array.isArray(localFoods)) {
      foods = localFoods.map(util.migrateFood)
    } else {
      foods = foodsData.map(util.migrateFood)
    }

    const history = wx.getStorageSync(STORAGE_KEYS.history) || []
    const favorites = wx.getStorageSync(STORAGE_KEYS.favorites) || []

    const historyDisplay = history.slice(0, 30).map(h => {
      const dateStr = h.date ? new Date(h.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''
      return { ...h, dateStr }
    })
    this.setData({ foods, history, favorites, foodCount: foods.length, historyDisplay })
  },

  saveState() {
    const { foods, history, favorites } = this.data
    wx.setStorageSync(STORAGE_KEYS.foods, foods)
    wx.setStorageSync(STORAGE_KEYS.localVersion, APP_VERSION)
    wx.setStorageSync(STORAGE_KEYS.history, history)
    wx.setStorageSync(STORAGE_KEYS.favorites, favorites)
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
      this.saveState()
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
        this.saveState()
      })
    }
  },

  updateHistoryDisplay() {
    const { history } = this.data
    const historyDisplay = history.slice(0, 30).map(h => {
      const dateStr = h.date ? new Date(h.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''
      return { ...h, dateStr }
    })
    this.setData({ historyDisplay })
  },

  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空最近记录吗？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [], historyDisplay: [] }, () => {
            this.saveState()
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
            this.saveState()
            wx.showToast({ title: '已清空', icon: 'success' })
          })
        }
      }
    })
  },
})
