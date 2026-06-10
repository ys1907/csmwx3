// 词表归一（幂等、支持 --dry）：把 data/foods.js 的场景/标签词表对齐 UI 措辞，
// 让 utils/foodLogic.js 可以删掉 SCENE_ALIASES/TAG_ALIASES 桥接层、按字面比较。
//   scenes / availability key：到店吃→堂食、食堂→公司食堂
//   tags：肉食→肉、素食→素、酥脆→脆、热食→热（映射后去重）
// 另修两类数据缺口：scenes 为空的记录回填 [scene]；availability 为「高」但 scenes 漏标的场景补进 scenes
// （此前靠 matchesScene 的运行时兜底分支顶着，归一后该分支删除）。
// 运行：node scripts/normalizeVocab.js [--dry]（沙箱内 node 写盘可能落 overlay，正式跑用 PowerShell）
const fs = require('fs')
const path = require('path')

const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const DRY = process.argv.includes('--dry')

const SCENE_MAP = { '到店吃': '堂食', '食堂': '公司食堂' }
const TAG_MAP = { '肉食': '肉', '素食': '素', '酥脆': '脆', '热食': '热' }
const UI_SCENES = ['外卖', '堂食', '自己做', '公司食堂']

const foods = require(FOODS_PATH)

let sceneMapped = 0, tagMapped = 0, availKeyMapped = 0, emptyScenesFixed = 0, highBackfilled = 0
const out = foods.map(raw => {
  const f = { ...raw }
  // scenes 词表映射 + 去重
  if (Array.isArray(f.scenes)) {
    const mapped = f.scenes.map(s => {
      if (SCENE_MAP[s]) { sceneMapped++; return SCENE_MAP[s] }
      return s
    })
    f.scenes = [...new Set(mapped)]
  }
  // 顶层 scene 同样映射（正常数据不含旧词，防御性）
  if (SCENE_MAP[f.scene]) { f.scene = SCENE_MAP[f.scene]; sceneMapped++ }
  // availability key 映射
  if (f.availability && typeof f.availability === 'object') {
    const av = {}
    for (const [k, v] of Object.entries(f.availability)) {
      if (SCENE_MAP[k]) { av[SCENE_MAP[k]] = v; availKeyMapped++ }
      else av[k] = v
    }
    f.availability = av
  }
  // tags 词表映射 + 去重
  if (Array.isArray(f.tags)) {
    const mapped = f.tags.map(t => {
      if (TAG_MAP[t]) { tagMapped++; return TAG_MAP[t] }
      return t
    })
    f.tags = [...new Set(mapped)]
  }
  // scenes 为空回填主场景
  if (!Array.isArray(f.scenes) || f.scenes.length === 0) {
    f.scenes = [f.scene].filter(Boolean)
    emptyScenesFixed++
  }
  // availability=高 但 scenes 漏标 → 补进 scenes
  if (f.availability) {
    for (const s of UI_SCENES) {
      if (f.availability[s] === '高' && !f.scenes.includes(s)) {
        f.scenes.push(s)
        highBackfilled++
      }
    }
  }
  return f
})

const changed = out.filter((f, i) => JSON.stringify(f) !== JSON.stringify(foods[i])).length
console.log(`记录 ${foods.length} | 场景词映射 ${sceneMapped} | 标签词映射 ${tagMapped} | availability key 映射 ${availKeyMapped}`)
console.log(`空 scenes 回填 ${emptyScenesFixed} | 高可得补标 ${highBackfilled} | 改动记录 ${changed}`)

if (changed === 0) {
  console.log('无需归一，跳过写回（幂等）')
} else if (DRY) {
  console.log('--dry：未写回')
} else {
  fs.writeFileSync(FOODS_PATH + '.vocab_backup', 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n')
  fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(out, null, 2) + '\n')
  console.log('已写回 data/foods.js（备份在 data/foods.js.vocab_backup）')
}
