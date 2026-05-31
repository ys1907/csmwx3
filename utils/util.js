function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function debounce(fn, ms) {
  let t
  return function(...args) {
    clearTimeout(t)
    t = setTimeout(() => fn.apply(this, args), ms)
  }
}

function shuffleArray(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  debounce,
  shuffleArray,
  escapeHtml,
  migrateFood
}
