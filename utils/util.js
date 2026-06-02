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

// 按 name/category/tags/foodType/mealRole 推断季节适配标签（炎热/降温/雨天适合）。
// 供 migrateFood 在 weatherTags 缺失时运行时填充，使季节弱信号加权生效。
function inferWeatherTags(food) {
  const name = food.name || ''
  const category = food.category
  const tags = Array.isArray(food.tags) ? food.tags : []
  const foodType = food.foodType
  const mealRole = food.mealRole
  const weather = []
  if (tags.includes('凉') || tags.includes('清爽') || category === '轻食') weather.push('炎热适合')
  if (/凉皮|冷面|沙拉|凉面|凉粉|冰/.test(name) && !weather.includes('炎热适合')) weather.push('炎热适合')
  if ((foodType === '饮品' || mealRole === '饮品') && !weather.includes('炎热适合')) weather.push('炎热适合')
  if (tags.includes('热食') || tags.includes('辣') || category === '火锅冒菜' || category === '烧烤') weather.push('降温适合')
  if (/火锅|羊肉汤|麻辣烫|烧烤|烤肉|烤鱼|串串/.test(name) && !weather.includes('降温适合')) weather.push('降温适合')
  if (category === '汤粥炖品' && mealRole === '汤品' && !weather.includes('降温适合')) weather.push('降温适合')
  if (/馄饨|云吞|抄手|热汤|汤面|拉面|火锅/.test(name) && !weather.includes('雨天适合')) weather.push('雨天适合')
  if ((category === '火锅冒菜' || category === '汤粥炖品') && !weather.includes('雨天适合')) weather.push('雨天适合')
  return weather
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
  const category = normalizeCategory(food)
  return {
    _id: food._id || uid(),
    name: food.name || '未知食物',
    emoji: food.emoji || '🍽️',
    category,
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
    weatherTags: (Array.isArray(food.weatherTags) && food.weatherTags.length > 0)
      ? food.weatherTags
      : inferWeatherTags({ name: food.name, category, tags: food.tags, foodType: food.foodType, mealRole: food.mealRole }),
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
