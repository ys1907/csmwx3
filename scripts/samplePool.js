// scripts/samplePool.js —— 模拟 N 次盲盒加权抽取，打印分布，验证治理效果。
// 用法（本地）：node scripts/samplePool.js [N]
const foods = require('../data/foods.js')
const { migrateFood } = require('../utils/util.js')
const N = parseInt(process.argv[2] || '2000', 10)
const pool = foods.map(migrateFood).filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false)
const total = pool.reduce((s, f) => s + f.defaultPoolWeight, 0)
const pick = () => {
  let r = Math.random() * total
  for (const f of pool) { r -= f.defaultPoolWeight; if (r <= 0) return f }
  return pool[pool.length - 1]
}
const byCat = {}, byCuisine = {}
let bowl = 0
for (let i = 0; i < N; i++) {
  const f = pick()
  byCat[f.category] = (byCat[f.category] || 0) + 1
  const cu = /中/.test(f.cuisine || '中式') ? '中式' : '异国'
  byCuisine[cu] = (byCuisine[cu] || 0) + 1
  if (f.category === '饭类套餐' || f.category === '面食粉类') bowl++
}
const pct = n => (n / N * 100).toFixed(1) + '%'
console.log(`池量 ${pool.length} | 抽样 ${N}`)
console.log('碗装(盖饭+面)占比', pct(bowl))
console.log('异国占比', pct(byCuisine['异国'] || 0))
console.log('品类分布', Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v)])))
