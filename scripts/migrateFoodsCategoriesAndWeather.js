// 一次性迁移：① 旧分类归一到新 12 分类 ② 按规则填充 weatherTags（此前全空）
// 顺序：必须先归一 category，inferWeatherTags 才能命中「火锅冒菜/烧烤」等新分类。
// 备份写到 *.backup（被 .gitignore 忽略，且 git 历史已可回溯）。
const fs = require('fs')
const path = require('path')

const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const BACKUP_PATH = path.join(__dirname, '..', 'data', 'foods.js.pre_migrate.backup')
const foods = require(FOODS_PATH)

// ① 分类归一（权威映射源自 scripts/cleanFoods.js）
const CATEGORY_REMAP = {
  '中式快餐': '饭类套餐',
  '街边小吃': '小吃点心',
  '日韩': '日韩料理',
  '西式': '西式简餐',
}
function normalizeCategory(item) {
  const c = item.category
  if (c === '火锅烧烤') {
    if (item.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(item.name || '')) return '烧烤'
    return '火锅冒菜'
  }
  return CATEGORY_REMAP[c] || c || '家常菜'
}

// ② weatherTags 推断（逻辑源自 scripts/enrichFoods.js inferWeatherTags）
function inferWeatherTags(item) {
  const { name = '', category, tags = [], foodType, mealRole } = item
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

fs.copyFileSync(FOODS_PATH, BACKUP_PATH)

let catChanged = 0, weatherFilled = 0
for (const item of foods) {
  const newCat = normalizeCategory(item)
  if (newCat !== item.category) { item.category = newCat; catChanged++ }
  item.weatherTags = inferWeatherTags(item)
  if (item.weatherTags.length > 0) weatherFilled++
}

fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n')
console.log(`完成：分类归一 ${catChanged} 条；weatherTags 非空 ${weatherFilled} / ${foods.length} 条；备份 → ${BACKUP_PATH}`)
