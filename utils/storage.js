// 存储容错封装：包装 wx.*StorageSync，避免配额/容量超限抛出未捕获异常中断业务流程

function safeGet(key, fallback) {
  try {
    const v = wx.getStorageSync(key)
    return (v === '' || v === null || v === undefined) ? fallback : v
  } catch (e) {
    console.error('[storage] getStorageSync failed:', key, e)
    return fallback
  }
}

function safeSet(key, val) {
  try {
    wx.setStorageSync(key, val)
    return true
  } catch (e) {
    console.error('[storage] setStorageSync failed:', key, e)
    wx.showToast({ title: '保存失败，存储空间可能已满', icon: 'none' })
    return false
  }
}

function safeRemove(key) {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (e) {
    console.error('[storage] removeStorageSync failed:', key, e)
    return false
  }
}

module.exports = { safeGet, safeSet, safeRemove }
