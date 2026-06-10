// 菜品库读写闭环：种子闸门 + 重播种合并 + 记录归一 + 三键持久化。
// 这是「重播种是否保留用户自建菜」核心不变式的唯一归属——index 与 manage 一律经此读写，
// 页面不得自行拼接闸门条件（曾经三处逐字重复，bump FOODS_SEED_VERSION 时极易漏改）。
// store 可注入便于单测（默认走 storage.js 的 safeGet/safeSet），范式同 utils/migrations.js。
const { safeGet, safeSet } = require('./storage.js')
const { migrateFood, mergeSeedWithLocal } = require('./util.js')
const { STORAGE_KEYS, FOODS_SEED_VERSION } = require('../data/options.js')

const defaultStore = { get: safeGet, set: safeSet }

// 加载菜品库：localVersion 命中当前种子版本且本地非空 → 用本地；
// 否则从种子重播种（经 mergeSeedWithLocal 保留用户自建菜）。结果逐条过 migrateFood。
// seedFoods 由调用方传入（不在本模块 require data/foods.js，避免它进所有引用方的依赖链）。
function loadFoods(seedFoods, store) {
  const s = store || defaultStore
  const localVersion = s.get(STORAGE_KEYS.localVersion, '')
  const localFoods = s.get(STORAGE_KEYS.foods, null)
  return (localVersion === FOODS_SEED_VERSION && Array.isArray(localFoods) && localFoods.length > 0)
    ? localFoods.map(migrateFood)
    : mergeSeedWithLocal(seedFoods, localFoods).map(migrateFood)
}

// foods 的唯一持久化入口：foods / localVersion / foodsRev 三键必须一起落盘。
// foodsRev 是跨页同步信号：manage 每次持久化时更新，index 在 onShow 比对它决定是否重建全量。
function persistFoods(foods, store) {
  const s = store || defaultStore
  s.set(STORAGE_KEYS.foods, foods)
  s.set(STORAGE_KEYS.localVersion, FOODS_SEED_VERSION)
  s.set(STORAGE_KEYS.foodsRev, Date.now())
}

function getFoodsRev(store) {
  const s = store || defaultStore
  return s.get(STORAGE_KEYS.foodsRev, 0)
}

module.exports = { loadFoods, persistFoods, getFoodsRev }
