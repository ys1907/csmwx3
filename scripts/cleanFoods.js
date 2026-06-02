/**
 * 食谱数据清洗脚本
 * 输入: data/foods.js (现有 V2 兼容版)
 * 输出: data/foods.js (清洗后)
 *
 * 处理规则:
 * 1. 命名修正与合并
 * 2. canBeMeal / mealRole / mealPeriods 重新标记
 * 3. equivalentGroupId + cooldownFamilyId 拆分
 * 4. defaultPoolWeight 赋值
 * 5. 新增高频菜品
 * 6. 旧分类统一为 12 新分类
 */

const fs = require('fs')
const path = require('path')

const INPUT = path.join(__dirname, '..', 'data', 'foods.js')
const OUTPUT = path.join(__dirname, '..', 'data', 'foods.js')
const BACKUP = path.join(__dirname, '..', 'data', 'foods.js.backup')

// ========================
// 1. 命名修正映射
// ========================
const RENAME_MAP = {
  '香炒面': '家常炒面',
  '大阪煎饼': '大阪烧（御好烧）',
  '部队火锅': '韩式部队锅',
  '咸味可丽饼': '咸味法式可丽饼',
  '金边粉': '柬埔寨金边粉',
  '椰浆饭': '马来西亚椰浆饭',
  '肉骨茶饭': '肉骨茶套餐',
  '生牛肉拌饭': '韩式生拌牛肉饭',
  '鱼肉汉堡': '鱼排汉堡',
  '新加坡鸡饭': '海南鸡饭（新加坡式）',
}

// ========================
// 2. 需要禁用的菜品
// ========================
const DISABLED_NAMES = new Set([
  '辣椒船',
])

// ========================
// 3. 需要拆分的菜品
// ========================
// 福建面 → 拆为三条，原条目删除
const SPLIT_RULES = {
  '福建面': [
    { name: '福建炒面', aliases: ['福建面'], tags: ['鲜', '香', '热食', '面食'], category: '面食粉类', scene: '外卖', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '午餐', '晚餐', '夜宵'] },
    { name: '厦门炒面线', aliases: [], tags: ['鲜', '香', '热食', '面食'], category: '面食粉类', scene: '外卖', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '午餐', '晚餐', '夜宵'] },
    { name: '福州拌面', aliases: [], tags: ['酱香', '热食', '面食'], category: '面食粉类', scene: '外卖', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '午餐', '晚餐', '夜宵'] },
  ]
}

// ========================
// 4. 合并规则
// ========================
// 咖喱叻沙 / 叻沙 → 统一为 叻沙米粉
const MERGE_RULES = {
  '叻沙米粉': { keepName: '咖喱叻沙', newName: '叻沙米粉', dropName: '叻沙' }
}

// ========================
// 5. canBeMeal = false 的汤类
// ========================
const SOUP_NAMES = new Set([
  '玉米排骨汤', '山药排骨汤', '肉丸汤', '鱼头豆腐汤', '椰子鸡汤',
  '虫草花鸡汤', '萝卜牛腩汤', '冬瓜排骨汤', '鲫鱼豆腐汤',
])
// 注意：白菜豆腐汤、番茄蛋汤、紫菜蛋花汤 已经是 canBeMeal=false

// ========================
// 6. 早餐/轻食 → mealPeriods 修正
// ========================
const BREAKFAST_ONLY = new Set([
  '咸豆浆', '粢饭团', '饭团', '小米粥', '绿豆粥', '燕麦粥', '紫薯粥',
  '吐司', '三明治', '酸奶碗', '粽子',
])
const BREAKFAST_PRIMARY = new Set([
  '煎饼果子', '鸡蛋灌饼',
])
const BREAKFAST_PLUS_LUNCH_DINNER = new Set([
  '小笼包', '灌汤包', '烧麦',
])

// ========================
// 7. 单一食材/小份菜 → canBeMeal=false
// ========================
const SIDE_DISH_NAMES = new Set([
  '糖拌西红柿', '烤培根', '香肠', '煎蛋', '溏心蛋', '卤蛋', '茶叶蛋',
  '毛豆', '煮花生', '拍黄瓜', '凉拌黄瓜', '白灼菜心',
  '蒸南瓜', '蒸红薯', '蒸紫薯', '蒸山药', '烤玉米', '煮玉米', '蒸玉米',
  '烤鸡心', '烤牛肉串', '烤羊肉串',
])

// ========================
// 8. 生食/生腌标记
// ========================
const RAW_FOOD_NAMES = new Set([
  '生鱼片', '韩式生拌牛肉饭', '醉蟹',
])

// ========================
// 9. 季节性标记
// ========================
const SEASON_TAGS_MAP = {
  '清蒸大闸蟹': ['秋季'],
  '醉蟹': ['秋季'],
}

const FESTIVAL_TAGS_MAP = {
  '粽子': ['端午节'],
}

// ========================
// 10. equivalentGroupId（严格等价/套餐变体）
// ========================
const EQUIVALENT_GROUPS = [
  ['红烧肉', '红烧肉盖饭'],
  ['回锅肉', '回锅肉饭'],
  ['宫保鸡丁', '宫保鸡丁饭'],
  ['麻婆豆腐', '麻婆豆腐饭'],
  ['黄焖鸡', '黄焖鸡米饭'],
  ['梅菜扣肉', '梅菜扣肉饭'],
  ['白切鸡', '白切鸡饭'],
  ['盐焗鸡', '盐焗鸡饭'],
]

// ========================
// 11. cooldownFamilyId（同类冷却族）
// ========================
const COOLDOWN_FAMILIES = {
  '火锅族': ['四川火锅', '重庆火锅', '潮汕牛肉火锅', '老北京涮羊肉', '椰子鸡火锅', '猪肚鸡火锅', '花胶鸡火锅', '酸菜鱼火锅', '菌菇火锅', '番茄火锅', '串串香', '韩式部队锅'],
  '烧烤族': ['自助烧烤', '东北烧烤', '新疆烧烤', '烤羊肉串', '烤牛肉串', '烤鸡心', '烤羊腿'],
  '烤鱼族': ['纸上烤鱼', '万州烤鱼'],
  '饭团族': ['粢饭团', '饭团', '烤饭团'],
  '红薯族': ['蒸红薯', '烤红薯'],
  '鱿鱼族': ['炸鱿鱼', '烤鱿鱼'],
  '烧饼族': ['油酥烧饼', '糖火烧', '芝麻烧饼'],
  '猪排族': ['烤猪排', '炸猪排', '猪排饭', '炸猪排饭'],
  '豆花族': ['豆花饭', '豆腐脑'],
  '面食族': ['福建炒面', '厦门炒面线', '福州拌面'],
  '煎饼族': ['煎饼果子', '鸡蛋灌饼', '杂粮煎饼', '鸡蛋饼'],
  '粥族': ['小米粥', '绿豆粥', '燕麦粥', '紫薯粥', '皮蛋瘦肉粥'],
  '包子族': ['小笼包', '灌汤包', '烧麦', '鲜肉包', '菜包'],
}

// ========================
// 12. 旧分类 → 新分类映射
// ========================
const CATEGORY_REMAP = {
  '中式快餐': '饭类套餐',
  '火锅烧烤': '火锅冒菜',   // 需要按 name 进一步区分到火锅冒菜/烧烤
  '街边小吃': '小吃点心',
  '日韩': '日韩料理',
  '西式': '西式简餐',
}

// ========================
// 13. defaultPoolWeight 规则
// ========================
function computeDefaultPoolWeight(item) {
  // 物理排除：不能成餐的
  if (item.canBeMeal === false) return 0.0

  // 地区扩展包
  const regionalNames = new Set([
    '桂林米粉', '常德米粉', '沙县拌面', '扁肉', '广式烧腊双拼饭',
    '武汉豆皮', '长沙米粉', '东北盒饭', '新疆抓饭', '云南饵丝', '贵州羊肉粉',
  ])
  if (regionalNames.has(item.name)) return 0.30

  // 套餐变体（等价组中的盖饭/套餐版）
  const comboVariants = new Set([
    '红烧肉盖饭', '回锅肉饭', '宫保鸡丁饭', '麻婆豆腐饭',
    '黄焖鸡米饭', '梅菜扣肉饭', '白切鸡饭', '盐焗鸡饭',
    '猪排饭', '炸猪排饭',
  ])
  if (comboVariants.has(item.name)) return 0.65

  // 季节性（非当季 0.10，当季 0.70 —— 脚本无法判断当季，统一给 0.70，由运行时根据季节调整）
  if (item.seasonTags && item.seasonTags.length > 0) return 0.70

  // 异国料理（非中式）
  if (item.cuisine && item.cuisine !== '中式料理') {
    // 但全国已经很常见的除外
    const commonForeign = new Set([
      '兰州拉面', '牛肉面', '番茄鸡蛋面', '水饺',
    ])
    if (!commonForeign.has(item.name)) return 0.30
  }

  // 默认完整餐食
  return 1.00
}

// ========================
// 14. 新增高频菜品
// ========================
const NEW_FOODS = [
  // === 全国通用日常餐食 ===
  { name: '水饺', emoji: '🥟', category: '面食粉类', scene: '自己做', budget: '💰', time: '慢', tags: ['家常', '饱腹', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '牛肉面', emoji: '🍜', category: '面食粉类', scene: '外卖', budget: '💰💰', time: '快', tags: ['鲜', '香', '辣', '面食', '肉'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐', '夜宵'] },
  { name: '西红柿鸡蛋面', emoji: '🍜', category: '面食粉类', scene: '自己做', budget: '💰', time: '快', tags: ['家常', '鲜', '素食', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '鸡公煲', emoji: '🍲', category: '火锅冒菜', scene: '外卖', budget: '💰💰', time: '慢', tags: ['辣', '香', '热食', '肉', '适合聚餐'], cuisine: '中式料理', foodType: '火锅', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐', '夜宵'] },
  { name: '烤肉拌饭', emoji: '🍚', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['香', '肉', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '鸡腿饭', emoji: '🍗', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['肉', '酥脆', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '红烧排骨饭', emoji: '🍚', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['甜', '酱香', '肉', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '土豆烧牛肉饭', emoji: '🍚', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['家常', '肉', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '青椒炒肉饭', emoji: '🍚', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['辣', '香', '肉', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '农家小炒肉饭', emoji: '🍚', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['辣', '香', '肉', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '自选中式快餐', emoji: '🍱', category: '饭类套餐', scene: '堂食', budget: '💰💰', time: '快', tags: ['家常', '饱腹', '适合聚餐'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '两荤一素盒饭', emoji: '🍱', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['家常', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },

  // === 在家做饭常见菜 ===
  { name: '青椒炒肉', emoji: '🫑', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['辣', '香', '肉', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '农家小炒肉', emoji: '🌶️', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['辣', '香', '肉', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '红烧排骨', emoji: '🍖', category: '家常菜', scene: '自己做', budget: '💰💰', time: '慢', tags: ['甜', '酱香', '肉', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '土豆烧牛肉', emoji: '🥔', category: '家常菜', scene: '自己做', budget: '💰💰', time: '慢', tags: ['家常', '肉', '饱腹'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '红烧鸡块', emoji: '🍗', category: '家常菜', scene: '自己做', budget: '💰', time: '慢', tags: ['酱香', '肉', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '蒜薹炒肉', emoji: '🧄', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['香', '肉', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '青椒土豆丝', emoji: '🥔', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['酸辣', '素食', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '蒜蓉油麦菜', emoji: '🥬', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['素', '清淡', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '清炒上海青', emoji: '🥬', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['素', '清淡', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '清炒西兰花', emoji: '🥦', category: '家常菜', scene: '自己做', budget: '💰', time: '快', tags: ['素', '清淡', '健康', '家常'], cuisine: '中式料理', foodType: '家常热菜', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '冬瓜排骨汤', emoji: '🍲', category: '汤粥炖品', scene: '自己做', budget: '💰', time: '慢', tags: ['鲜', '清淡', '热食', '肉'], cuisine: '中式料理', foodType: '汤羹炖品', mealRole: '汤品', canBeMeal: false, mealPeriods: ['午餐', '晚餐'] },
  { name: '紫菜蛋花汤', emoji: '🥣', category: '汤粥炖品', scene: '自己做', budget: '💰', time: '快', tags: ['鲜', '清淡', '热食'], cuisine: '中式料理', foodType: '汤羹炖品', mealRole: '汤品', canBeMeal: false, mealPeriods: ['午餐', '晚餐'] },
  { name: '西红柿鸡蛋汤', emoji: '🍅', category: '汤粥炖品', scene: '自己做', budget: '💰', time: '快', tags: ['鲜', '酸', '清淡', '热食'], cuisine: '中式料理', foodType: '汤羹炖品', mealRole: '汤品', canBeMeal: false, mealPeriods: ['午餐', '晚餐'] },

  // === 早餐池 ===
  { name: '鲜肉包', emoji: '🥟', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['肉', '家常', '热食'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '菜包', emoji: '🥬', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['素', '家常', '热食'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '馒头', emoji: '🫓', category: '小吃点心', scene: '自己做', budget: '💰', time: '慢', tags: ['家常', '饱腹'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '花卷', emoji: '🫓', category: '小吃点心', scene: '自己做', budget: '💰', time: '慢', tags: ['家常', '香'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '皮蛋瘦肉粥', emoji: '🥣', category: '汤粥炖品', scene: '外卖', budget: '💰', time: '快', tags: ['鲜', '咸', '热食'], cuisine: '中式料理', foodType: '粥品', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '夜宵', '加餐'] },
  { name: '肠粉', emoji: '🍥', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['鲜', '滑嫩', '热食'], cuisine: '中式料理', foodType: '小吃', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '夜宵', '加餐'] },
  { name: '豆浆油条套餐', emoji: '🥣', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['家常', '酥脆', '热食'], cuisine: '中式料理', foodType: '小吃', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '鸡蛋饼', emoji: '🥚', category: '小吃点心', scene: '自己做', budget: '💰', time: '快', tags: ['家常', '香', '热食'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '杂粮煎饼', emoji: '🌯', category: '小吃点心', scene: '外卖', budget: '💰', time: '快', tags: ['香', '酥脆', '热食'], cuisine: '中式料理', foodType: '小吃', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '加餐'] },
  { name: '锅贴', emoji: '🥟', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['肉', '酥脆', '热食'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '午餐', '晚餐'] },
  { name: '生煎包', emoji: '🥟', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['肉', '鲜', '热食'], cuisine: '中式料理', foodType: '中式面点', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '午餐', '晚餐'] },

  // === 地区扩展包 (低权重 0.30) ===
  { name: '桂林米粉', emoji: '🍜', category: '面食粉类', scene: '外卖', budget: '💰', time: '快', tags: ['酸辣', '香', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐', '夜宵'] },
  { name: '常德米粉', emoji: '🍜', category: '面食粉类', scene: '外卖', budget: '💰', time: '快', tags: ['辣', '香', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐', '夜宵'] },
  { name: '沙县拌面', emoji: '🍜', category: '面食粉类', scene: '外卖', budget: '💰', time: '快', tags: ['酱香', '香', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐', '夜宵'] },
  { name: '扁肉', emoji: '🥟', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['鲜', '肉', '热食'], cuisine: '中式料理', foodType: '小吃', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '午餐', '晚餐'] },
  { name: '广式烧腊双拼饭', emoji: '🍚', category: '饭类套餐', scene: '外卖', budget: '💰💰', time: '快', tags: ['肉', '香', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '武汉豆皮', emoji: '🫓', category: '小吃点心', scene: '堂食', budget: '💰', time: '快', tags: ['香', '酥脆', '热食'], cuisine: '中式料理', foodType: '小吃', mealRole: '小吃', canBeMeal: false, mealPeriods: ['早餐', '午餐'] },
  { name: '长沙米粉', emoji: '🍜', category: '面食粉类', scene: '外卖', budget: '💰', time: '快', tags: ['辣', '香', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '午餐', '晚餐', '夜宵'] },
  { name: '东北盒饭', emoji: '🍱', category: '饭类套餐', scene: '外卖', budget: '💰', time: '快', tags: ['家常', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '新疆抓饭', emoji: '🍚', category: '饭类套餐', scene: '堂食', budget: '💰💰', time: '慢', tags: ['香', '肉', '饱腹'], cuisine: '中式料理', foodType: '米饭套餐', mealRole: '正餐', canBeMeal: true, mealPeriods: ['午餐', '晚餐'] },
  { name: '云南饵丝', emoji: '🍜', category: '面食粉类', scene: '堂食', budget: '💰', time: '快', tags: ['鲜', '香', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '午餐', '晚餐'] },
  { name: '贵州羊肉粉', emoji: '🍜', category: '面食粉类', scene: '外卖', budget: '💰', time: '快', tags: ['辣', '香', '肉', '面食'], cuisine: '中式料理', foodType: '面食粉类', mealRole: '正餐', canBeMeal: true, mealPeriods: ['早餐', '午餐', '晚餐', '夜宵'] },
]

// ========================
// 工具函数
// ========================

function uid() {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

function generateId() {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

// ========================
// 主流程
// ========================

function main() {
  // 读取并解析
  const raw = fs.readFileSync(INPUT, 'utf8')
  fs.writeFileSync(BACKUP, raw)
  console.log('✓ 已备份到', BACKUP)

  let foods = JSON.parse(raw.replace(/^module\.exports\s*=\s*/, ''))
  console.log('✓ 读取', foods.length, '条数据')

  // ---- 1. 命名修正 ----
  for (const item of foods) {
    if (RENAME_MAP[item.name]) {
      item.name = RENAME_MAP[item.name]
      if (!Array.isArray(item.reviewNotes)) item.reviewNotes = []
      item.reviewNotes.push(`2026-06-01: 名称标准化 "${item.name}"`)
    }
  }

  // ---- 2. 禁用菜品 ----
  for (const item of foods) {
    if (DISABLED_NAMES.has(item.name)) {
      item.enabled = false
      if (!Array.isArray(item.reviewNotes)) item.reviewNotes = []
      item.reviewNotes.push('2026-06-01: 暂停启用（名称/质量问题）')
    }
  }

  // ---- 3. 拆分菜品 ----
  for (const [origName, variants] of Object.entries(SPLIT_RULES)) {
    const idx = foods.findIndex(f => f.name === origName)
    if (idx >= 0) {
      const base = foods[idx]
      foods.splice(idx, 1) // 删除原条目
      for (const v of variants) {
        foods.push({
          ...base,
          _id: generateId(),
          name: v.name,
          aliases: v.aliases,
          tags: v.tags,
          category: v.category,
          scene: v.scene,
          foodType: v.foodType,
          mealRole: v.mealRole,
          canBeMeal: v.canBeMeal,
          mealPeriods: v.mealPeriods,
          reviewNotes: [`2026-06-01: 从"${origName}"拆分`],
          groupId: v.name,
        })
      }
      console.log(`  拆分 "${origName}" → ${variants.length} 条`)
    }
  }

  // ---- 4. 合并菜品 ----
  for (const [newName, rule] of Object.entries(MERGE_RULES)) {
    const keepIdx = foods.findIndex(f => f.name === rule.keepName)
    const dropIdx = foods.findIndex(f => f.name === rule.dropName)
    if (keepIdx >= 0 && dropIdx >= 0) {
      const keep = foods[keepIdx]
      const drop = foods[dropIdx]
      keep.name = rule.newName
      keep.aliases = [...new Set([...(keep.aliases || []), rule.dropName, ...(drop.aliases || [])])]
      if (!Array.isArray(keep.reviewNotes)) keep.reviewNotes = []
      keep.reviewNotes.push(`2026-06-01: 合并 "${rule.keepName}" + "${rule.dropName}" → "${rule.newName}"`)
      foods.splice(dropIdx, 1)
      console.log(`  合并 "${rule.keepName}" + "${rule.dropName}" → "${rule.newName}"`)
    }
  }

  // ---- 5. 汤类修正 ----
  for (const item of foods) {
    if (SOUP_NAMES.has(item.name)) {
      item.canBeMeal = false
      item.mealRole = '汤品'
      if (!Array.isArray(item.reviewNotes)) item.reviewNotes = []
      item.reviewNotes.push('2026-06-01: 归为汤品，不作为单独正餐推荐')
    }
  }

  // ---- 6. 早餐/轻食修正 ----
  for (const item of foods) {
    if (BREAKFAST_ONLY.has(item.name)) {
      item.canBeMeal = false
      item.mealRole = '小吃'
      item.mealPeriods = ['早餐', '加餐']
    } else if (BREAKFAST_PRIMARY.has(item.name)) {
      item.canBeMeal = false
      item.mealRole = '小吃'
      item.mealPeriods = ['早餐', '加餐']
    } else if (BREAKFAST_PLUS_LUNCH_DINNER.has(item.name)) {
      item.mealPeriods = ['早餐', '午餐', '晚餐']
      // canBeMeal 保持 true，但 defaultPoolWeight 会在后续降低
    }
  }

  // ---- 7. 单一食材/小份菜修正 ----
  for (const item of foods) {
    if (SIDE_DISH_NAMES.has(item.name)) {
      item.canBeMeal = false
      item.mealRole = item.mealRole === '正餐' ? '配菜' : item.mealRole
    }
  }

  // ---- 8. 生食标记 ----
  for (const item of foods) {
    if (RAW_FOOD_NAMES.has(item.name)) {
      item.rawFood = true
      item.safetyNotice = '含生食或生腌食材，请根据个人情况谨慎选择'
    }
  }

  // ---- 9. 季节性/节令标记 ----
  for (const item of foods) {
    if (SEASON_TAGS_MAP[item.name]) {
      item.seasonTags = SEASON_TAGS_MAP[item.name]
    }
    if (FESTIVAL_TAGS_MAP[item.name]) {
      item.festivalTags = FESTIVAL_TAGS_MAP[item.name]
    }
  }

  // ---- 10. 聚餐标记 ----
  const GATHERING_NAMES = new Set([
    '四川火锅', '重庆火锅', '潮汕牛肉火锅', '老北京涮羊肉', '椰子鸡火锅',
    '猪肚鸡火锅', '花胶鸡火锅', '酸菜鱼火锅', '菌菇火锅', '番茄火锅',
    '烤全羊', '烤羊腿', '烤乳猪', '美蛙鱼头', '纸上烤鱼', '万州烤鱼',
    '串串香', '自助烧烤', '东北烧烤', '新疆烧烤',
  ])
  for (const item of foods) {
    if (GATHERING_NAMES.has(item.name)) {
      if (!Array.isArray(item.features)) item.features = []
      if (!item.features.includes('适合聚餐')) item.features.push('适合聚餐')
    }
  }

  // ---- 11. 和风炸酱面标记 ----
  for (const item of foods) {
    if (item.name === '和风炸酱面') {
      if (!Array.isArray(item.reviewNotes)) item.reviewNotes = []
      item.reviewNotes.push('2026-06-01: 需人工确认做法归属（日式/韩式）')
      item.reviewStatus = '需人工确认'
    }
  }

  // ---- 12. equivalentGroupId ----
  for (const group of EQUIVALENT_GROUPS) {
    const groupId = group[0] + '_套餐族'
    for (const name of group) {
      const item = foods.find(f => f.name === name)
      if (item) {
        item.equivalentGroupId = groupId
      }
    }
  }

  // ---- 13. cooldownFamilyId ----
  for (const [familyName, names] of Object.entries(COOLDOWN_FAMILIES)) {
    for (const name of names) {
      const item = foods.find(f => f.name === name)
      if (item) {
        item.cooldownFamilyId = familyName
      }
    }
  }

  // ---- 14. 旧分类统一 ----
  for (const item of foods) {
    if (CATEGORY_REMAP[item.category]) {
      // 火锅烧烤需要进一步区分
      if (item.category === '火锅烧烤') {
        if (item.foodType === '烧烤' || item.name.includes('烧烤') || item.name.includes('烤串') || item.name.includes('烤羊')) {
          item.category = '烧烤'
        } else {
          item.category = '火锅冒菜'
        }
      } else {
        item.category = CATEGORY_REMAP[item.category]
      }
    }
  }

  // ---- 15. defaultPoolWeight ----
  for (const item of foods) {
    item.defaultPoolWeight = computeDefaultPoolWeight(item)
  }

  // ---- 16. 新增菜品 ----
  for (const nf of NEW_FOODS) {
    const full = {
      _id: generateId(),
      name: nf.name,
      aliases: nf.aliases || [],
      emoji: nf.emoji,
      category: nf.category,
      scene: nf.scene,
      budget: nf.budget,
      time: nf.time,
      tags: nf.tags,
      cuisine: nf.cuisine || '中式料理',
      foodType: nf.foodType,
      mealRole: nf.mealRole,
      canBeMeal: nf.canBeMeal,
      mealPeriods: nf.mealPeriods,
      scenes: [nf.scene, '自己做', '外卖', '堂食'].filter((v, i, a) => a.indexOf(v) === i),
      primaryScene: nf.scene,
      budgetCnyByScene: {
        [nf.scene]: { min: 5, max: 30 },
        '自己做': { min: 3, max: 20 },
        '外卖': { min: 8, max: 35 },
        '堂食': { min: 10, max: 40 },
      },
      budgetBasis: '中国城市常见消费估算',
      timeLevel: nf.time,
      timeMinutesByScene: {
        [nf.scene]: { min: nf.time === '快' ? 10 : 30, max: nf.time === '快' ? 25 : 60 },
        '自己做': { min: nf.time === '快' ? 10 : 30, max: nf.time === '快' ? 25 : 60 },
      },
      groupId: nf.name,
      flavors: nf.tags.slice(0, 3),
      ingredients: ['综合食材'],
      dietaryFlags: nf.tags.includes('素') ? ['可作为素食'] : ['含肉'],
      features: [],
      cookingMethods: ['常规制作'],
      spicyLevel: nf.tags.includes('辣') ? 2 : 0,
      enabled: true,
      pickCount: 0,
      lastPickedAt: null,
      cooldownDays: 3,
      favorite: false,
      reviewStatus: '已审查',
      reviewNotes: ['2026-06-01: 新增高频菜品'],
      legacy: null,
      // 新字段
      defaultPoolWeight: nf.name === '冬瓜排骨汤' || nf.name === '紫菜蛋花汤' || nf.name === '西红柿鸡蛋汤'
        ? 0.0
        : (computeDefaultPoolWeight({ canBeMeal: nf.canBeMeal, cuisine: nf.cuisine, seasonTags: nf.seasonTags, name: nf.name })),
      equivalentGroupId: null,
      cooldownFamilyId: null,
      rawFood: false,
      safetyNotice: '',
      seasonTags: [],
      festivalTags: [],
    }
    foods.push(full)
  }
  console.log('✓ 新增', NEW_FOODS.length, '条菜品')

  // ---- 17. 确保所有条目都有完整的新字段 ----
  for (const item of foods) {
    if (item.canBeMeal === undefined) item.canBeMeal = true
    if (!Array.isArray(item.mealPeriods)) item.mealPeriods = ['午餐', '晚餐']
    if (!item.mealRole) item.mealRole = '正餐'
    if (item.defaultPoolWeight === undefined) item.defaultPoolWeight = 1.0
    if (item.equivalentGroupId === undefined) item.equivalentGroupId = null
    if (item.cooldownFamilyId === undefined) item.cooldownFamilyId = null
    if (item.rawFood === undefined) item.rawFood = false
    if (item.safetyNotice === undefined) item.safetyNotice = ''
    if (!Array.isArray(item.seasonTags)) item.seasonTags = []
    if (!Array.isArray(item.festivalTags)) item.festivalTags = []
    if (item.enabled === undefined) item.enabled = true
  }

  // ---- 18. 输出 ----
  const output = 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n'
  fs.writeFileSync(OUTPUT, output)

  // ---- 统计 ----
  const canBeMealCount = foods.filter(f => f.canBeMeal).length
  const disabledCount = foods.filter(f => f.enabled === false).length
  const categories = {}
  for (const f of foods) categories[f.category] = (categories[f.category] || 0) + 1

  console.log('\n========== 清洗完成 ==========')
  console.log('总条数:', foods.length)
  console.log('可作为正餐 (canBeMeal=true):', canBeMealCount)
  console.log('已禁用:', disabledCount)
  console.log('分类分布:')
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`)
  }
  console.log('==============================\n')
}

main()
