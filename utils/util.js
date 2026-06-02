// 旧分类 → 新 12 分类（权威映射源自 scripts/cleanFoods.js）
const LEGACY_CATEGORY_MAP = {
  '中式快餐': '饭类套餐',
  '街边小吃': '小吃点心',
  '日韩': '日韩料理',
  '西式': '西式简餐',
}

// 归一单条记录的 category；火锅烧烤按 foodType/菜名细分到烧烤 vs 火锅冒菜
function normalizeCategory(food) {
  const c = food.category
  if (c === '火锅烧烤') {
    if (food.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(food.name || '')) return '烧烤'
    return '火锅冒菜'
  }
  return LEGACY_CATEGORY_MAP[c] || c || '家常菜'
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function shuffleArray(arr, rng) {
  const random = rng || Math.random
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 手写日期格式化，替代在部分小程序运行时不稳定的 toLocaleDateString(locale, options)
function formatDate(date, withWeekday) {
  if (!date || Number.isNaN(date.getTime())) return ''
  const base = `${date.getMonth() + 1}月${date.getDate()}日`
  return withWeekday ? `${WEEKDAYS[date.getDay()]} ${base}` : base
}

function migrateFood(food) {
  return {
    _id: food._id || uid(),
    name: food.name || '未知食物',
    emoji: food.emoji || '🍽️',
    category: normalizeCategory(food),
    scene: food.scene || '堂食',
    budget: food.budget || '💰',
    time: food.time || '快',
    tags: Array.isArray(food.tags) ? food.tags : [],
    calories: food.calories ?? null,
    spicyLevel: food.spicyLevel ?? 0,
    // NEW: 智能池字段（v3 数据清洗后新增）
    canBeMeal: food.canBeMeal !== false,
    mealPeriods: Array.isArray(food.mealPeriods) ? food.mealPeriods : ['午餐', '晚餐'],
    mealRole: food.mealRole || '正餐',
    defaultPoolWeight: food.defaultPoolWeight ?? 1.0,
    equivalentGroupId: food.equivalentGroupId || null,
    cooldownFamilyId: food.cooldownFamilyId || null,
    rawFood: food.rawFood || false,
    safetyNotice: food.safetyNotice || '',
    seasonTags: Array.isArray(food.seasonTags) ? food.seasonTags : [],
    festivalTags: Array.isArray(food.festivalTags) ? food.festivalTags : [],
    enabled: food.enabled !== false,
    // NEW: v3 字段扩充（阶段1）
    itemLevel: food.itemLevel || '完整餐食',
    availability: food.availability || { 外卖: '中', 堂食: '中', 自己做: '中', 食堂: '中' },
    aliases: Array.isArray(food.aliases) ? food.aliases : [],
    regionTags: Array.isArray(food.regionTags) ? food.regionTags : [],
    weatherTags: Array.isArray(food.weatherTags) ? food.weatherTags : [],
    dietWarnings: Array.isArray(food.dietWarnings) ? food.dietWarnings : [],
    allergenTags: Array.isArray(food.allergenTags) ? food.allergenTags : [],
  }
}

module.exports = {
  uid,
  shuffleArray,
  formatDate,
  migrateFood
}
