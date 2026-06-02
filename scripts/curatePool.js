// scripts/curatePool.js —— 菜品合理性一次性治理（幂等）。
// 用法（本地，无沙箱）：node scripts/curatePool.js   |   node scripts/curatePool.js --dry
// 设计见 docs/superpowers/specs/2026-06-02-dish-reasonableness-design.md
const fs = require('fs')
const path = require('path')
const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const foods = require('../data/foods.js')
const DRY = process.argv.includes('--dry')

// 旧分类落盘归一（对齐 utils/util.js normalizeCategory）
const LEGACY = { 中式快餐: '饭类套餐', 街边小吃: '小吃点心', 日韩: '日韩料理', 西式: '西式简餐' }
const normCat = f =>
  f.category === '火锅烧烤'
    ? ((f.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(f.name || '')) ? '烧烤' : '火锅冒菜')
    : (LEGACY[f.category] || f.category)

// ===== 逐道定位表 O =====
// name -> { w?:权重 , off?:true出池停用 , meal?:canBeMeal , mp?:[mealPeriods追加] , bud?:budget , spicy?:spicyLevel , tags?:[tag追加] }
const O = {}
const set = (name, o) => { O[name] = { ...(O[name] || {}), ...o } }
const setAll = (names, o) => names.forEach(n => set(n, o))

// — 出池/停用：内脏猎奇 / 地方小众 / 异国小众 —
setAll([
  '印尼炒饭', '椰浆饭', '炒粿条', '咖喱牛腩饭', '天妇罗盖饭', '鳗鱼饭', '炸虾盖饭', '三文鱼饭',
  '羊肉泡馍', '豆花饭', '裤带面', '宜宾燃面', '米皮', '擀面皮',
  '猪脏粉', '肥肠粉', '生鱼片', '醉蟹', '美蛙鱼头',
], { off: true })
const OFF_FUZZY = ['油泼扯面'] // 名字带全角括号，用 includes 兜底

// — 激活进池：火锅 / 烧烤（偶尔共享大餐，中低权重）/ 早餐（限早餐时段）—
Object.entries({
  四川火锅: .45, 重庆火锅: .45, 牛肉火锅: .4, 潮汕牛肉火锅: .4, 猪肚鸡火锅: .4, 椰子鸡火锅: .35,
  菌菇火锅: .35, 番茄火锅: .35, 老北京涮羊肉: .4, 串串香: .4, 酸菜鱼火锅: .4, 鸡公煲: .4,
  东北烧烤: .4, 新疆烧烤: .4, 自助烧烤: .4, 烤肉: .4, 铁板烧: .35, 户外烧烤: .3,
  皮蛋瘦肉粥: .7, 小笼包: .7, 生煎包: .6, 煎饼果子: .7, 鸡蛋灌饼: .6, 肠粉: .6, 胡辣汤: .6, 豆浆油条套餐: .7, 手抓饼: .6, 馄饨: .7,
}).forEach(([n, w]) => set(n, { w }))
setAll(['皮蛋瘦肉粥', '小笼包', '生煎包', '煎饼果子', '鸡蛋灌饼', '肠粉', '胡辣汤', '豆浆油条套餐', '手抓饼', '馄饨'], { mp: ['早餐'] })

// ===== Task 4 逐分类决策（子代理产出 → 在此 Object.assign 合并，每批一块）=====
// 例： Object.assign(O, { 红烧肉:{w:.9,meal:true}, 清炒西兰花:{w:.2,meal:false} })

// ===== apply =====
const seenName = new Set(foods.map(f => f.name))
const seenId = new Set(foods.map(f => f._id))
let normed = 0, off = 0, changed = 0, added = 0
const out = foods.map(f => {
  const g = { ...f }
  const nc = normCat(g); if (nc !== g.category) { g.category = nc; normed++ }
  const ov = O[g.name] || (OFF_FUZZY.some(s => g.name.includes(s)) ? { off: true } : null)
  if (ov) {
    if (ov.off) { g.defaultPoolWeight = 0; g.enabled = false; off++ }
    if (ov.w != null) { g.defaultPoolWeight = ov.w; g.enabled = true }
    if (ov.meal != null) g.canBeMeal = ov.meal
    if (ov.bud) g.budget = ov.bud
    if (ov.spicy != null) g.spicyLevel = ov.spicy
    if (ov.tags) g.tags = Array.from(new Set([...(g.tags || []), ...ov.tags]))
    if (ov.mp) g.mealPeriods = Array.from(new Set([...ov.mp, ...(g.mealPeriods || [])]))
  }
  if (JSON.stringify(g) !== JSON.stringify(f)) changed++
  return g
})

// ===== Task 5 新增菜（子代理产出 → 填入）=====
const NEW_FOODS = [
  // { _id:'a1b2c3d4e5f60001', name:'西红柿炒鸡蛋', emoji:'🍅', category:'家常菜', scene:'自己做',
  //   scenes:['自己做','外卖','食堂'], budget:'💰', time:'快', tags:['家常','鲜','下饭'],
  //   cuisine:'中式料理', foodType:'热菜', mealRole:'正餐', canBeMeal:true, mealPeriods:['午餐','晚餐'],
  //   defaultPoolWeight:0.7, spicyLevel:0, enabled:true },
]
for (const nf of NEW_FOODS) {
  if (seenName.has(nf.name) || seenId.has(nf._id)) continue // 幂等：已存在则跳过
  out.push(nf); seenName.add(nf.name); seenId.add(nf._id); added++
}

const inPool = out.filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false).length
console.log(`归一 ${normed} | 出池 ${off} | 改动记录 ${changed} | 新增 ${added} | 总 ${out.length} | 池内 ${inPool}`)
if (DRY) {
  console.log('--dry：未写回')
} else {
  fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(out, null, 2) + '\n')
  console.log('已写回 data/foods.js')
}
