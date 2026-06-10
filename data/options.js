// 共享常量：index 页与 manage 页统一从此处引用，避免重复定义导致不一致
// 仅作导出/导入的数据格式标记（manage 导出 payload.version）。
// ⚠️ 绝不进任何 storage key——用户数据 key 已与版本解耦，见 STORAGE_KEYS 与 utils/migrations.js。
const APP_VERSION = 'v3'

// foods 种子版本：仅用于「是否从 data/foods.js 重播种菜品库」的闸门（与用户数据无关）。
// bump 它 → 下次启动从 data/foods.js 重播种菜品库；history/收藏/SSR 图鉴全不受影响，
// 用户自建菜经 util.mergeSeedWithLocal 保留（对内置菜的编辑会被新种子覆盖）。
// v5: 同名菜去重 524→519（scripts/dedupeFoods.js）
const FOODS_SEED_VERSION = 'v5'

// 所有 key 稳定、与版本号解耦：版本变更永不误删用户数据。数据结构变更走 utils/migrations.js。
const STORAGE_KEYS = {
  foods: 'wtec_foods',
  history: 'wtec_history',
  favorites: 'wtec_fav',
  pkData: 'wtec_pk',
  localVersion: 'wtec_foods_local_version',
  foodsRev: 'wtec_foods_rev', // 菜品库修订标记：管理页每次持久化时更新，供首页判断是否需重建全量 foods
  cooldownFamilyPicks: 'wtec_cooldown_fam',
  ssrPity: 'wtec_ssr_pity',        // 抽卡保底计数（自上次 SSR 后的累计抽数）
  ssrCollection: 'wtec_ssr_dex',   // SSR 图鉴（抽到过的 SSR 菜，去重）
  schemaVersion: 'wtec_schema_version' // 存储 schema 版本，见 utils/migrations.js
}

const SCENE_OPTIONS = ['全部场景', '外卖', '堂食', '自己做', '公司食堂']
const BUDGET_OPTIONS = ['全部预算', '💰', '💰💰', '💰💰💰']
const TIME_OPTIONS = ['全部时间', '快', '慢']
const CATEGORY_OPTIONS = ['家常菜', '小吃点心', '日韩料理', '汤粥炖品', '火锅冒菜', '烧烤', '甜品饮品', '西式简餐', '轻食', '配菜', '面食粉类', '饭类套餐']
const TASTE_OPTIONS = ['全部口味', '辣', '甜', '酸', '鲜']
const AVOID_TAG_OPTIONS = ['无', '肉', '鲜', '香', '素', '辣', '甜', '海鲜', '脆', '热', '清淡', '健康', '糯', '酱香', '酸', '咸', '凉']

// NEW: 时段与类型选项（v3 智能池）
const MEAL_PERIOD_OPTIONS = ['全部时段', '早餐', '午餐', '晚餐', '夜宵', '加餐']
const MEAL_ROLE_OPTIONS = ['全部类型', '正餐', '配菜', '小吃', '甜品', '饮品', '汤品']

module.exports = {
  APP_VERSION,
  FOODS_SEED_VERSION,
  STORAGE_KEYS,
  SCENE_OPTIONS,
  BUDGET_OPTIONS,
  TIME_OPTIONS,
  CATEGORY_OPTIONS,
  TASTE_OPTIONS,
  AVOID_TAG_OPTIONS,
  MEAL_PERIOD_OPTIONS,
  MEAL_ROLE_OPTIONS
}
