function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function shuffleArray(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 手写日期格式化，替代在部分小程序运行时不稳定的 toLocaleDateString(locale, options)
function formatDate(date, withWeekday) {
  const base = `${date.getMonth() + 1}月${date.getDate()}日`
  return withWeekday ? `${WEEKDAYS[date.getDay()]} ${base}` : base
}

function migrateFood(food) {
  return {
    _id: food._id || uid(),
    name: food.name || '未知食物',
    emoji: food.emoji || '🍽️',
    category: food.category || '家常菜',
    scene: food.scene || '堂食',
    budget: food.budget || '💰',
    time: food.time || '快',
    tags: Array.isArray(food.tags) ? food.tags : [],
    calories: food.calories === null || food.calories === undefined ? null : food.calories,
    spicyLevel: food.spicyLevel === null || food.spicyLevel === undefined ? 0 : food.spicyLevel,
  }
}

module.exports = {
  uid,
  shuffleArray,
  formatDate,
  migrateFood
}
