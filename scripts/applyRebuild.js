// 菜品库重审裁决应用（幂等、支持 --dry）：输入 scripts/rebuild_verdict.json（dish-rebuild-review 工作流产物：
// 3 人设巡库 → 终审裁决 → 26 批逐道校正 → 抽检）。执行顺序：字段校正(453) → 抽检覆盖 → 出池(58) → 删除(42) → 新增(40)。
// REVIEW_OVERRIDES = 抽检环节 6+2 条意见的采纳落地，逐条注明理由。
// 运行：node scripts/applyRebuild.js [--dry]（沙箱内 node 写盘可能落 overlay，正式跑用 PowerShell）
const fs = require('fs')
const path = require('path')

const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const DRY = process.argv.includes('--dry')

const verdict = require('./rebuild_verdict.json')
const { uid } = require('../utils/util.js')

const VALID_CATEGORIES = ['家常菜', '小吃点心', '日韩料理', '汤粥炖品', '火锅冒菜', '烧烤', '甜品饮品', '西式简餐', '轻食', '配菜', '面食粉类', '饭类套餐']
const TAG_VOCAB = new Set(['肉', '素', '辣', '甜', '酸', '鲜', '香', '海鲜', '脆', '热', '清淡', '健康', '糯', '酱香', '咸', '凉', '家常', '蛋', '饱腹', '嫩'])

// 抽检意见采纳表：key=菜名，value=对该记录的最终覆盖（在 patch 之后应用）
const REVIEW_OVERRIDES = {
  // 抽检①：patch 收缩 scenes=[堂食] 但漏改主场景，scene 必须同步
  '美蛙鱼头': f => { f.scene = '堂食' },
  // 抽检②：scenes 含「外卖」但 availability 外卖=极低，违反自洽规则（已停用条目也要干净）
  '烤乳猪': f => { f.scenes = f.scenes.filter(s => s !== '外卖') },
  // 抽检③：炖汤 canBeMeal 双重标准——统一按多数派（排骨汤/鸡汤类大炖汤可配饭当主角），回退这两条的降级
  '冬瓜排骨汤': f => { f.canBeMeal = true; f.defaultPoolWeight = 0.5 },
  '椰子鸡汤': f => { f.canBeMeal = true; f.defaultPoolWeight = 0.6 },
  // 抽检④：淡水鱼不算海鲜的口径统一（美蛙鱼头 patch 已删海鲜，鳜鱼同理）
  '松鼠鳜鱼': f => { f.tags = f.tags.map(t => (t === '海鲜' ? '鲜' : t)).filter((t, i, a) => a.indexOf(t) === i) },
  // 抽检⑤：停用条目词表清理漏网
  '香煎鳕鱼': f => { f.tags = f.tags.map(t => (t === '嫩滑' ? '嫩' : t)).filter((t, i, a) => a.indexOf(t) === i) },
  '厦门炒面线': f => { f.tags = f.tags.filter(t => t !== '面食') },
  // 抽检⑥：炸藕盒与炸茄盒同类同售卖渠道，对齐处理（藕夹在家常菜馆同样常见）
  '炸藕盒': f => {
    f.scenes = ['自己做', '堂食', '公司食堂']
    f.availability = { 外卖: '低', 堂食: '中', 自己做: '高', 公司食堂: '中' }
  },
  // dry-run 校验暴露的最后两个词表外 tag（抽检样本未覆盖到的记录）
  '烧麦': f => { f.tags = f.tags.map(t => (t === '软糯' ? '糯' : t)).filter((t, i, a) => a.indexOf(t) === i) },
  '福建炒面': f => { f.tags = f.tags.filter(t => t !== '面食') },
}

const foods = require(FOODS_PATH).map(f => ({ ...f }))
const byId = new Map(foods.map((f, i) => [f._id, i]))
const removalSet = new Set(verdict.removals.map(r => r.name))
const disableSet = new Set(verdict.disables.map(d => d.name))

// ① 字段校正
let patched = 0
for (const p of verdict.patches) {
  if (!byId.has(p._id) || removalSet.has(p.name)) continue
  const f = foods[byId.get(p._id)]
  const before = JSON.stringify(f)
  Object.assign(f, p.changes)
  if (JSON.stringify(f) !== before) patched++
}

// ①.5 抽检覆盖
for (const [name, apply] of Object.entries(REVIEW_OVERRIDES)) {
  const f = foods.find(x => x.name === name)
  if (f) apply(f)
}

// ② 出池
let disabled = 0
for (const f of foods) {
  if (disableSet.has(f.name) && (f.enabled !== false || (f.defaultPoolWeight || 0) > 0)) {
    f.enabled = false
    f.defaultPoolWeight = 0
    disabled++
  }
}

// ③ 删除
const beforeCount = foods.length
let out = foods.filter(f => !removalSet.has(f.name))
const removed = beforeCount - out.length

// ④ 新增（availability 缺失 → 由 scenes 推导：主场景=高、其余可行渠道=中、不可行=低；抽检：canBeMeal=false 权重钳到 ≤0.3）
const existingNames = new Set(out.map(f => f.name))
let added = 0
for (const a of verdict.additions) {
  if (existingNames.has(a.name)) continue
  const rec = { _id: uid(), ...a }
  if (!rec.availability) {
    rec.availability = {}
    for (const s of ['外卖', '堂食', '自己做', '公司食堂']) {
      rec.availability[s] = s === rec.scene ? '高' : (rec.scenes.includes(s) ? '中' : '低')
    }
  }
  if (rec.canBeMeal === false && rec.defaultPoolWeight > 0.3) rec.defaultPoolWeight = 0.3
  rec.enabled = true
  out.push(rec)
  existingNames.add(rec.name)
  added++
}

// 不变量校验
const errors = []
const warns = []
const nameSeen = new Set()
for (const f of out) {
  if (nameSeen.has(f.name)) errors.push(`重名: ${f.name}`)
  nameSeen.add(f.name)
  if (!VALID_CATEGORIES.includes(f.category)) errors.push(`非法分类 ${f.category}@${f.name}`)
  if (!Array.isArray(f.scenes) || f.scenes.length === 0) { f.scenes = [f.scene].filter(Boolean); warns.push(`scenes 为空已回填@${f.name}`) }
  if (f.canBeMeal === false && (f.defaultPoolWeight || 0) > 0.3) { f.defaultPoolWeight = 0.3; warns.push(`非成餐权重钳到0.3@${f.name}`) }
  for (const t of f.tags || []) if (!TAG_VOCAB.has(t)) warns.push(`词表外 tag「${t}」@${f.name}`)
}
if (errors.length) {
  console.error('不变量失败，拒绝写回：\n' + errors.join('\n'))
  process.exit(1)
}

const pool = out.filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false)
const luxe = pool.filter(f => f.budget === '💰💰💰').length
console.log(`校正 ${patched} | 出池 ${disabled} | 删除 ${removed} | 新增 ${added}`)
console.log(`总 ${beforeCount} → ${out.length} | 池内 ${pool.length}（💰💰💰 ${luxe}）`)
if (warns.length) console.log('警告（不阻断）：\n  ' + [...new Set(warns)].join('\n  '))

const changed = removed + added > 0 || patched > 0 || disabled > 0
if (!changed) {
  console.log('无改动，跳过写回（幂等）')
} else if (DRY) {
  console.log('--dry：未写回')
} else {
  fs.writeFileSync(FOODS_PATH + '.rebuild_backup', 'module.exports = ' + JSON.stringify(require(FOODS_PATH), null, 2) + '\n')
  fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(out, null, 2) + '\n')
  console.log('已写回 data/foods.js（备份在 data/foods.js.rebuild_backup）')
}
