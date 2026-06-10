// 同名菜去重（幂等、支持 --dry）：每组同名记录保留首条（原始治理代），
// 把重复条的 scenes/tags/mealPeriods 并集合并进保留条后删除重复条。
// 背景：治理新增 45 道家常菜时误与既有菜重复（生煎包/鸡蛋饼/锅贴/冬瓜排骨汤/紫菜蛋花汤），
// 双双 enabled 入池 → 管理页重名校验卡死编辑、凑一桌 wx:key="name" 撞 key。
// 运行：node scripts/dedupeFoods.js [--dry]（沙箱内 node 写盘可能落 overlay，正式跑用 PowerShell）
const fs = require('fs')
const path = require('path')

const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const DRY = process.argv.includes('--dry')

const foods = require(FOODS_PATH)

function unionInto(keeper, dup, key) {
  const base = Array.isArray(keeper[key]) ? keeper[key] : []
  const extra = (Array.isArray(dup[key]) ? dup[key] : []).filter(v => !base.includes(v))
  if (extra.length > 0) keeper[key] = base.concat(extra)
}

const byName = new Map()
const out = []
const removed = []
for (const f of foods) {
  const keeper = byName.get(f.name)
  if (!keeper) {
    byName.set(f.name, f)
    out.push(f)
  } else {
    // 重复条：信息并入保留条后丢弃
    unionInto(keeper, f, 'scenes')
    unionInto(keeper, f, 'tags')
    unionInto(keeper, f, 'mealPeriods')
    removed.push({ name: f.name, _id: f._id })
  }
}

const inPool = out.filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false).length
console.log(`总 ${foods.length} → ${out.length} | 删除重复 ${removed.length} | 池内 ${inPool}`)
removed.forEach(r => console.log(`  - 删除: ${r.name} (${r._id})`))

if (removed.length === 0) {
  console.log('无同名重复，跳过写回（幂等）')
} else if (DRY) {
  console.log('--dry：未写回')
} else {
  fs.writeFileSync(FOODS_PATH + '.dedupe_backup', 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n')
  fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(out, null, 2) + '\n')
  console.log('已写回 data/foods.js（备份在 data/foods.js.dedupe_backup）')
}
