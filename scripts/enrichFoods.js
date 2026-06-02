/**
 * 数据字段扩充脚本
 * 为全部 478 条数据增加 6 类新字段
 * itemLevel / availability / aliases / regionTags / weatherTags / dietWarnings / allergenTags
 */

const fs = require('fs')
const path = require('path')

const INPUT = path.join(__dirname, '..', 'data', 'foods.js')
const OUTPUT = path.join(__dirname, '..', 'data', 'foods.js')
const BACKUP = path.join(__dirname, '..', 'data', 'foods.js.enrich_backup')

// ========================
// 1. itemLevel 判定
// ========================
function inferItemLevel(item) {
  const { name, category, canBeMeal, mealRole, foodType, budget, features = [] } = item

  // 餐厅品类（泛指类）
  if (/自选|快餐|盒饭|套餐$/.test(name) && !name.includes('饭')) {
    return '餐厅品类'
  }

  // 聚餐方式
  if (budget === '💰💰💰' && (features.includes('适合聚餐') || /烤全|自助|聚会/.test(name))) {
    return '聚餐方式'
  }
  if (category === '火锅冒菜' && /火锅$/.test(name) && canBeMeal) {
    return '聚餐方式'
  }
  if (category === '烧烤' && /自助|烤全|烧烤$/.test(name) && canBeMeal) {
    return '聚餐方式'
  }

  // 早餐单品
  if (!canBeMeal && mealRole !== '正餐' && (item.mealPeriods || []).every(p => ['早餐', '加餐'].includes(p))) {
    return '早餐单品'
  }

  // 饮品
  if (mealRole === '饮品' || foodType === '饮品') {
    return '饮品'
  }

  // 甜品
  if (mealRole === '甜品' || foodType === '甜品') {
    return '甜品'
  }

  // 小吃
  if (mealRole === '小吃' || (!canBeMeal && category === '小吃点心')) {
    return '小吃'
  }

  // 配菜
  if (mealRole === '配菜' || category === '配菜') {
    return '配菜'
  }

  // 汤羹
  if (mealRole === '汤品' || (category === '汤粥炖品' && !canBeMeal)) {
    return '汤羹'
  }

  // 主食
  if (!canBeMeal && (foodType === '米饭/谷物' || foodType === '面食/谷物' || /馒头|花卷|饼$|饭团/.test(name))) {
    return '主食'
  }

  // 完整餐食 vs 单道菜
  if (canBeMeal && mealRole === '正餐') {
    const fullMealCats = ['饭类套餐', '面食粉类', '火锅冒菜', '烧烤', '西式简餐', '日韩料理', '轻食']
    if (fullMealCats.includes(category)) {
      return '完整餐食'
    }
    if (category === '家常菜') {
      // 家常菜中，如果是明确的一道菜（非套餐），标记为单道菜
      if (/饭$|面$|粉$|米线$|套餐/.test(name)) {
        return '完整餐食'
      }
      return '单道菜'
    }
    return '完整餐食'
  }

  return '完整餐食' // 兜底
}

// ========================
// 2. availability 判定
// ========================
function inferAvailability(item) {
  const { name, category, foodType, scene, canBeMeal, mealRole, budget, time } = item
  const tags = item.tags || []

  const result = { 外卖: '中', 堂食: '中', 自己做: '中', 食堂: '中' }

  // 基于 category 的基础判定
  const catMap = {
    '火锅冒菜': { 外卖: '高', 堂食: '高', 自己做: '低', 食堂: '低' },
    '烧烤': { 外卖: '中', 堂食: '高', 自己做: '低', 食堂: '低' },
    '面食粉类': { 外卖: '高', 堂食: '高', 自己做: '中', 食堂: '中' },
    '饭类套餐': { 外卖: '高', 堂食: '中', 自己做: '低', 食堂: '高' },
    '家常菜': { 外卖: '低', 堂食: '中', 自己做: '高', 食堂: '中' },
    '小吃点心': { 外卖: '高', 堂食: '高', 自己做: '低', 食堂: '低' },
    '西式简餐': { 外卖: '高', 堂食: '高', 自己做: '低', 食堂: '低' },
    '日韩料理': { 外卖: '中', 堂食: '高', 自己做: '低', 食堂: '低' },
    '轻食': { 外卖: '高', 堂食: '中', 自己做: '中', 食堂: '低' },
    '汤粥炖品': { 外卖: '中', 堂食: '中', 自己做: '高', 食堂: '中' },
    '甜品饮品': { 外卖: '高', 堂食: '高', 自己做: '低', 食堂: '低' },
    '配菜': { 外卖: '低', 堂食: '低', 自己做: '高', 食堂: '中' },
  }

  if (catMap[category]) {
    Object.assign(result, catMap[category])
  }

  // 特殊修正
  if (!canBeMeal) {
    // 不能单独成餐的，外卖/堂食/食堂都降低
    if (mealRole === '配菜' || mealRole === '汤品') {
      result.外卖 = '低'
      result.堂食 = '低'
      result.食堂 = '中'
      result.自己做 = '高'
    }
    if (mealRole === '小吃' || mealRole === '甜品' || mealRole === '饮品') {
      result.外卖 = '高'
      result.堂食 = '高'
      result.食堂 = '低'
      result.自己做 = '低'
    }
  }

  // 高预算聚餐类
  if (budget === '💰💰💰') {
    result.外卖 = '极低'
    result.堂食 = '高'
    result.自己做 = '极低'
    result.食堂 = '极低'
  }

  // 慢菜
  if (time === '慢' && category === '家常菜') {
    result.外卖 = '低'
    result.堂食 = '中'
    result.自己做 = '高'
  }

  // 特定名称修正
  if (/麻辣烫|麻辣香锅|冒菜/.test(name)) {
    result.外卖 = '高'
    result.堂食 = '高'
  }
  if (/烤全羊|烤乳猪|美蛙鱼头/.test(name)) {
    result.外卖 = '极低'
    result.堂食 = '高'
    result.自己做 = '极低'
  }
  if (/番茄炒蛋|青椒炒肉|农家小炒肉|蒜蓉|清炒/.test(name)) {
    result.外卖 = '低'
    result.堂食 = '低'
    result.自己做 = '高'
  }
  if (/饺子|水饺|云吞|馄饨|抄手/.test(name)) {
    result.外卖 = '高'
    result.堂食 = '中'
    result.自己做 = '高'
  }

  return result
}

// ========================
// 3. aliases 判定
// ========================
const ALIAS_MAP = {
  '馄饨': ['云吞', '抄手'],
  '云吞': ['馄饨', '抄手'],
  '抄手': ['馄饨', '云吞'],
  '龙抄手': ['馄饨', '抄手', '红油抄手'],
  '红油抄手': ['馄饨', '抄手', '龙抄手'],
  '米线': ['米粉', '粉'],
  '米粉': ['米线', '粉'],
  '长沙米粉': ['米线', '粉'],
  '桂林米粉': ['米线', '粉'],
  '常德米粉': ['米线', '粉'],
  '贵州羊肉粉': ['米线', '粉', '羊肉粉'],
  '云南饵丝': ['饵丝'],
  '水饺': ['饺子', '扁食', '水饺'],
  '饺子': ['水饺', '扁食'],
  '钟水饺': ['饺子', '水饺'],
  '肉夹馍': ['腊汁肉夹馍'],
  '猪脚饭': ['猪蹄饭', '隆江猪脚饭'],
  '煎饼果子': ['杂粮煎饼', '煎饼'],
  '杂粮煎饼': ['煎饼果子', '煎饼'],
  '鸡蛋灌饼': ['灌饼'],
  '手抓饼': ['抓饼'],
  '兰州拉面': ['拉面', '兰州牛肉面'],
  '牛肉面': ['兰州牛肉面', '拉面'],
  '炸酱面': ['老北京炸酱面'],
  '北京炸酱面': ['炸酱面'],
  '四川火锅': ['川味火锅', '火锅'],
  '重庆火锅': ['渝味火锅', '火锅'],
  '重庆小面': ['小面'],
  '麻婆豆腐': ['麻婆豆腐饭'],
  '麻婆豆腐饭': ['麻婆豆腐'],
  '红烧肉': ['红烧肉盖饭'],
  '红烧肉盖饭': ['红烧肉'],
  '回锅肉': ['回锅肉饭'],
  '回锅肉饭': ['回锅肉'],
  '宫保鸡丁': ['宫保鸡丁饭'],
  '宫保鸡丁饭': ['宫保鸡丁'],
  '黄焖鸡': ['黄焖鸡米饭'],
  '黄焖鸡米饭': ['黄焖鸡'],
  '梅菜扣肉': ['梅菜扣肉饭'],
  '梅菜扣肉饭': ['梅菜扣肉'],
  '白切鸡': ['白切鸡饭'],
  '白切鸡饭': ['白切鸡'],
  '盐焗鸡': ['盐焗鸡饭'],
  '盐焗鸡饭': ['盐焗鸡'],
  '猪排饭': ['炸猪排饭', '烤猪排饭'],
  '炸猪排饭': ['猪排饭'],
  '烤猪排': ['炸猪排', '猪排'],
  '福建炒面': ['炒面'],
  '炒面': ['福建炒面', '家常炒面', '香炒面'],
  '家常炒面': ['炒面'],
  '大阪烧（御好烧）': ['大阪煎饼', '御好烧'],
  '韩式部队锅': ['部队火锅'],
  '咸味法式可丽饼': ['咸味可丽饼'],
  '柬埔寨金边粉': ['金边粉'],
  '马来西亚椰浆饭': ['椰浆饭'],
  '肉骨茶套餐': ['肉骨茶饭', '肉骨茶'],
  '韩式生拌牛肉饭': ['生牛肉拌饭'],
  '鱼排汉堡': ['鱼肉汉堡'],
  '海南鸡饭（新加坡式）': ['新加坡鸡饭', '海南鸡饭'],
  '扁肉': ['馄饨', '云吞'],
  '沙县拌面': ['拌面'],
  '扁食': ['馄饨', '云吞'],
  '豆浆油条套餐': ['豆浆', '油条'],
}

function inferAliases(item) {
  const base = ALIAS_MAP[item.name] || []
  // 去重并排除自身
  return [...new Set(base.filter(a => a !== item.name))]
}

// ========================
// 4. regionTags 判定
// ========================
function inferRegionTags(item) {
  const { name, category, cuisine } = item
  const tags = item.tags || []
  const regions = []

  // 全国常见基础判定
  const nationalCommon = ['饭类套餐', '面食粉类', '家常菜', '小吃点心', '汤粥炖品']
  if (nationalCommon.includes(category) && !/^[a-zA-Z]/.test(name)) {
    regions.push('全国常见')
  }

  // 名称关键词匹配
  const regionRules = [
    { keywords: ['炸酱面', '烧饼', '驴肉火烧', '卤煮', '豆汁', '炸灌肠', '爆肚'], region: '华北' },
    { keywords: ['东北', '锅包肉', '乱炖', '地三鲜', '杀猪菜', '酸菜白肉'], region: '东北' },
    { keywords: ['上海', '江浙', '杭帮', '本帮', '苏式', '淮扬', '无锡', '宁波'], region: '华东' },
    { keywords: ['武汉', '长沙', '热干面', '剁椒', '口味虾', '臭豆腐', '米粉'], region: '华中' },
    { keywords: ['广东', '粤', '潮汕', '肠粉', '烧腊', '煲仔', '广式', '茶餐厅'], region: '华南' },
    { keywords: ['川', '渝', '成都', '重庆', '麻辣', '火锅', '串串', '钵钵鸡', '兔头'], region: '西南' },
    { keywords: ['兰州', '陕西', '新疆', '羊肉泡馍', '肉夹馍', '凉皮', 'biang', '大盘鸡', '抓饭'], region: '西北' },
    { keywords: ['兰州拉面', '牛肉面'], region: '西北' },
    { keywords: ['过桥米线', '云南', '饵丝', '汽锅鸡'], region: '西南' },
    { keywords: ['桂林', '螺蛳粉', '老友粉', '酸笋'], region: '华南' },
    { keywords: ['贵州', '酸汤', '羊肉粉', '丝娃娃'], region: '西南' },
    { keywords: ['沙县', '扁肉', '拌面', '福建', '厦门', '福州'], region: '华东' },
    { keywords: ['日', '寿司', '拉面', '天妇罗', '日式', '大阪', '和风'], region: '日韩' },
    { keywords: ['韩', '泡菜', '石锅', '韩式', '部队', '炸鸡'], region: '日韩' },
    { keywords: ['泰', '冬阴功', '咖喱', '东南亚', '越南', '河粉'], region: '东南亚' },
    { keywords: ['意', '披萨', '意面', '意式', '西班牙', '法式', '可丽饼', '汉堡'], region: '西式' },
  ]

  for (const rule of regionRules) {
    if (rule.keywords.some(k => name.includes(k))) {
      if (!regions.includes(rule.region)) regions.push(rule.region)
    }
  }

  // 细分区域
  if (regions.includes('华东') && (/上海/.test(name) || /江浙/.test(name) || /苏式/.test(name))) {
    if (!regions.includes('江浙沪')) regions.push('江浙沪')
  }
  if (regions.includes('西南') && (/四川|成都|重庆|麻辣/.test(name))) {
    if (!regions.includes('川渝')) regions.push('川渝')
  }
  if (regions.includes('华南') && (/广东|港式|澳门|潮汕/.test(name))) {
    if (!regions.includes('粤港澳')) regions.push('粤港澳')
  }

  // 日韩料理统一标记
  if (category === '日韩料理' || cuisine === '日韩料理') {
    if (!regions.includes('日韩')) regions.push('日韩')
  }

  return regions
}

// ========================
// 5. weatherTags 判定
// ========================
function inferWeatherTags(item) {
  const { name, category, tags = [], foodType, mealRole } = item
  const weather = []

  // 炎热适合
  if (tags.includes('凉') || tags.includes('清爽') || category === '轻食') {
    weather.push('炎热适合')
  }
  if (/凉皮|冷面|沙拉|凉面|凉粉|冰/.test(name)) {
    if (!weather.includes('炎热适合')) weather.push('炎热适合')
  }
  if (foodType === '饮品' || mealRole === '饮品') {
    if (!weather.includes('炎热适合')) weather.push('炎热适合')
  }

  // 降温适合
  if (tags.includes('热食') || tags.includes('辣') || category === '火锅冒菜' || category === '烧烤') {
    weather.push('降温适合')
  }
  if (/火锅|羊肉汤|麻辣烫|烧烤|烤肉|烤鱼|串串/.test(name)) {
    if (!weather.includes('降温适合')) weather.push('降温适合')
  }
  if (category === '汤粥炖品' && mealRole === '汤品') {
    if (!weather.includes('降温适合')) weather.push('降温适合')
  }

  // 雨天适合
  if (/馄饨|云吞|抄手|热汤|汤面|拉面|火锅/.test(name)) {
    if (!weather.includes('雨天适合')) weather.push('雨天适合')
  }
  if (category === '火锅冒菜' || category === '汤粥炖品') {
    if (!weather.includes('雨天适合')) weather.push('雨天适合')
  }

  return weather
}

// ========================
// 6. dietWarnings + allergenTags
// ========================
function inferDietWarnings(item) {
  const { name, tags = [], ingredients = [], rawFood, spicyLevel } = item
  const warnings = []

  if (tags.includes('海鲜') || ingredients.some(i => /海鲜|鱼|虾|蟹|贝|鱿/.test(i))) {
    warnings.push('含海鲜')
  }
  if (rawFood) {
    warnings.push('含生食')
  }
  if (tags.includes('辣') || tags.includes('麻辣') || spicyLevel >= 1) {
    warnings.push('含辣')
  }
  if (/肚|肠|肝|腰|脑花|内脏|百叶|黄喉/.test(name)) {
    warnings.push('含内脏')
  }
  if (tags.includes('油炸') || tags.includes('酥脆') || /炸|酥|油/.test(name)) {
    warnings.push('高油')
  }
  if (item.category === '面食粉类' || item.category === '饭类套餐' || item.category === '小吃点心') {
    if (item.canBeMeal) {
      warnings.push('高碳水')
    }
  }

  return warnings
}

function inferAllergenTags(item) {
  const { name, tags = [], ingredients = [] } = item
  const allergens = []

  if (tags.includes('海鲜') || ingredients.some(i => /海鲜|鱼|虾|蟹|贝/.test(i))) {
    allergens.push('海鲜')
  }
  if (/花生|坚果|腰果|杏仁/.test(name) || ingredients.some(i => /花生|坚果/.test(i))) {
    allergens.push('花生坚果')
  }
  if (item.category === '面食粉类' || /面|饼|馒头|包子|饺子|馄饨|抄手|云吞/.test(name)) {
    allergens.push('麸质')
  }
  if (/豆浆|豆腐|豆花|豆皮|腐竹/.test(name) || ingredients.some(i => /豆制品|黄豆/.test(i))) {
    allergens.push('大豆')
  }
  if (/奶|芝士|奶酪|奶油|酸奶/.test(name)) {
    allergens.push('乳制品')
  }
  if (tags.includes('蛋') || ingredients.some(i => /蛋/.test(i)) || /蛋/.test(name)) {
    allergens.push('蛋')
  }

  return allergens
}

// ========================
// 主流程
// ========================
function main() {
  const raw = fs.readFileSync(INPUT, 'utf8')
  fs.writeFileSync(BACKUP, raw)
  console.log('✓ 已备份到', BACKUP)

  let foods = JSON.parse(raw.replace(/^module\.exports\s*=\s*/, ''))
  console.log('✓ 读取', foods.length, '条数据')

  let changed = 0
  const reviewList = []

  for (const item of foods) {
    const before = JSON.stringify({
      itemLevel: item.itemLevel,
      availability: item.availability,
      aliases: item.aliases,
      regionTags: item.regionTags,
      weatherTags: item.weatherTags,
      dietWarnings: item.dietWarnings,
      allergenTags: item.allergenTags,
    })

    // 自动推断
    item.itemLevel = inferItemLevel(item)
    item.availability = inferAvailability(item)
    item.aliases = inferAliases(item)
    item.regionTags = inferRegionTags(item)
    item.weatherTags = inferWeatherTags(item)
    item.dietWarnings = inferDietWarnings(item)
    item.allergenTags = inferAllergenTags(item)

    const after = JSON.stringify({
      itemLevel: item.itemLevel,
      availability: item.availability,
      aliases: item.aliases,
      regionTags: item.regionTags,
      weatherTags: item.weatherTags,
      dietWarnings: item.dietWarnings,
      allergenTags: item.allergenTags,
    })

    if (before !== after) changed++

    // 收集需要人工确认的边界案例
    if (item.itemLevel === '聚餐方式' && item.budget !== '💰💰💰') {
      reviewList.push(`${item.name}: itemLevel=聚餐方式 但 budget=${item.budget}`)
    }
    if (item.regionTags.length === 0 && item.cuisine === '中式料理' && item.canBeMeal) {
      reviewList.push(`${item.name}: 无地区标签`)
    }
    if (item.availability.外卖 === '极低' && item.availability.堂食 === '极低' && item.availability.自己做 === '极低') {
      reviewList.push(`${item.name}: 所有渠道都是极低`)
    }
  }

  // 输出
  const output = 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n'
  fs.writeFileSync(OUTPUT, output)

  // 统计
  const stats = {}
  for (const f of foods) {
    stats.itemLevel = stats.itemLevel || {}
    stats.itemLevel[f.itemLevel] = (stats.itemLevel[f.itemLevel] || 0) + 1
  }

  console.log('\n========== 字段扩充完成 ==========')
  console.log('处理条数:', foods.length)
  console.log('发生变更:', changed)
  console.log('\nitemLevel 分布:')
  for (const [level, count] of Object.entries(stats.itemLevel).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${level}: ${count}`)
  }
  console.log('\n需人工确认（', reviewList.length, '条）:')
  reviewList.slice(0, 20).forEach(r => console.log('  -', r))
  if (reviewList.length > 20) console.log('  ... 还有', reviewList.length - 20, '条')
  console.log('==================================\n')

  // 写入审核清单
  const reviewPath = path.join(__dirname, 'enrichReview.md')
  fs.writeFileSync(reviewPath, '# 数据字段扩充审核清单\n\n' + reviewList.map(r => `- ${r}`).join('\n') + '\n')
  console.log('✓ 审核清单已写入', reviewPath)
}

main()
