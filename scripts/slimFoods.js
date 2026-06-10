// foods.js 瘦身（幂等、支持 --dry）：把运行时零引用的治理元数据剥离到 scripts/foods.meta.json（不进主包），
// data/foods.js 只保留运行时字段。守 2MB 主包上限（治理元数据约占文件一半体积）。
// 保留字段清单 = utils/util.js migrateFood 的白名单（运行时消费的权威来源）
//   + cuisine/foodType（integrity 测试与 normalizeCategory/inferWeatherTags 的输入）。
// 安全自检：剥离前后每条记录过 migrateFood 的结果必须逐字段一致，否则拒绝写回。
// 运行：node scripts/slimFoods.js [--dry]（沙箱内 node 写盘可能落 overlay，正式跑用 PowerShell）
const fs = require('fs')
const path = require('path')

const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const META_PATH = path.join(__dirname, 'foods.meta.json')
const DRY = process.argv.includes('--dry')

const KEEP = new Set([
  // migrateFood 白名单
  '_id', 'name', 'emoji', 'category', 'scene', 'scenes', 'budget', 'time', 'tags',
  'calories', 'spicyLevel', 'canBeMeal', 'mealPeriods', 'mealRole', 'defaultPoolWeight',
  'equivalentGroupId', 'cooldownFamilyId', 'rawFood', 'safetyNotice', 'seasonTags',
  'festivalTags', 'enabled', 'itemLevel', 'availability', 'aliases', 'regionTags',
  'weatherTags', 'dietWarnings', 'allergenTags',
  // migrateFood 白名单之外但有消费方
  'cuisine',  // foods.integrity.test.js / samplePool 的异国占比
  'foodType', // normalizeCategory 火锅烧烤二分、inferWeatherTags 推断输入
])

const foods = require(FOODS_PATH)
const { migrateFood } = require('../utils/util.js')

const slim = []
const meta = {}
let strippedFields = 0
for (const f of foods) {
  const kept = {}
  const dropped = {}
  let hasDropped = false
  for (const [k, v] of Object.entries(f)) {
    if (KEEP.has(k)) kept[k] = v
    else { dropped[k] = v; hasDropped = true; strippedFields++ }
  }
  if (hasDropped) meta[f._id] = dropped
  slim.push(kept)
}

// 安全自检：运行时 shape 必须不变
for (let i = 0; i < foods.length; i++) {
  const before = JSON.stringify(migrateFood(foods[i]))
  const after = JSON.stringify(migrateFood(slim[i]))
  if (before !== after) {
    console.error(`自检失败：${foods[i].name}（${foods[i]._id}）剥离后 migrateFood 结果改变，拒绝写回`)
    process.exit(1)
  }
}

const beforeSize = fs.statSync(FOODS_PATH).size
const slimText = 'module.exports = ' + JSON.stringify(slim, null, 2) + '\n'
console.log(`记录 ${foods.length} | 剥离字段 ${strippedFields} 个（${Object.keys(meta).length} 条记录有元数据）`)
console.log(`体积 ${(beforeSize / 1024).toFixed(0)} KB → ${(Buffer.byteLength(slimText) / 1024).toFixed(0)} KB`)

if (strippedFields === 0) {
  console.log('无可剥离字段，跳过写回（幂等）')
} else if (DRY) {
  console.log('--dry：未写回')
} else {
  fs.writeFileSync(FOODS_PATH + '.slim_backup', 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n')
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n')
  fs.writeFileSync(FOODS_PATH, slimText)
  console.log(`已写回 data/foods.js；元数据存档 ${path.relative(process.cwd(), META_PATH)}（git 保留、packOptions 已排除 scripts/）`)
}
