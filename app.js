const { runMigrations } = require('./utils/migrations.js')

App({
  onLaunch() {
    runMigrations() // 必须先于任何页面 onLoad 读数据；onLaunch 同步、保证时序
    console.log('到底吃点啥 · 情侣版 启动')
  },
  onShow() {
    console.log('小程序显示')
  },
  onHide() {
    console.log('小程序隐藏')
  }
})
