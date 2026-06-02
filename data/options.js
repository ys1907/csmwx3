// 共享常量：index 页与 manage 页统一从此处引用，避免重复定义导致不一致
const APP_VERSION = 'v3'

const STORAGE_KEYS = {
  foods: 'wtec_foods_' + APP_VERSION,
  history: 'wtec_history_' + APP_VERSION,
  favorites: 'wtec_fav_' + APP_VERSION,
  pkData: 'wtec_pk_' + APP_VERSION,
  localVersion: 'wtec_foods_local_version',
  foodsRev: 'wtec_foods_rev', // 菜品库修订标记：管理页每次持久化时更新，供首页判断是否需重建全量 foods
  weekFood: 'wtec_week_food',
  weekFoodDate: 'wtec_week_food_date',
  cooldownFamilyPicks: 'wtec_cooldown_fam_' + APP_VERSION
}

const SCENE_OPTIONS = ['全部场景', '外卖', '堂食', '自己做', '公司食堂']
const BUDGET_OPTIONS = ['全部预算', '💰', '💰💰', '💰💰💰']
const TIME_OPTIONS = ['全部时间', '快', '慢']
const CATEGORY_OPTIONS = ['家常菜', '小吃点心', '日韩料理', '汤粥炖品', '火锅冒菜', '烧烤', '甜品饮品', '西式简餐', '轻食', '配菜', '面食粉类', '饭类套餐']
const WEEK_THEMES = ['周日休闲时光', '周一能量站', '周二小确幸', '周三午后惊喜', '周四愉悦时刻', '周五度假前夕', '周六浪漫日']
const TASTE_OPTIONS = ['全部口味', '辣', '甜', '酸', '鲜']
const AVOID_TAG_OPTIONS = ['无', '肉', '鲜', '香', '素', '辣', '甜', '海鲜', '脆', '热', '清淡', '健康', '糯', '酱香', '酸', '咸', '凉']
// FIX: 星期主题对应偏好标签（周日=0 ~ 周六=6）
const WEEK_THEME_TAGS = [
  ['素', '健康', '清爽'],
  ['肉', '饱腹', '家常'],
  ['甜', '香', '奶香'],
  ['鲜', '脆', '芝士'],
  ['辣', '热', '酸甜'],
  ['社交', '香', '肉'],
  ['甜', '嫩', '清淡']
]

// NEW: 时段与类型选项（v3 智能池）
const MEAL_PERIOD_OPTIONS = ['全部时段', '早餐', '午餐', '晚餐', '夜宵', '加餐']
const MEAL_ROLE_OPTIONS = ['全部类型', '正餐', '配菜', '小吃', '甜品', '饮品', '汤品']

module.exports = {
  APP_VERSION,
  STORAGE_KEYS,
  SCENE_OPTIONS,
  BUDGET_OPTIONS,
  TIME_OPTIONS,
  CATEGORY_OPTIONS,
  WEEK_THEMES,
  TASTE_OPTIONS,
  AVOID_TAG_OPTIONS,
  WEEK_THEME_TAGS,
  MEAL_PERIOD_OPTIONS,
  MEAL_ROLE_OPTIONS
}
