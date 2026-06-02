# 菜品合理性治理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 给全库 ~479 道菜逐道核准"定位"（category/tags/budget/mealPeriods/scene/canBeMeal/权重）、删/停用不合理项、激活火锅烧烤早餐、新增约 60 道家常菜，让盲盒出菜符合中国人日常，且 5 个心情 chip 各有 ≥15 池内候选。

**Architecture:** 治理逻辑写成**一个幂等脚本 `scripts/curatePool.js`**，由用户在**本地无沙箱**环境运行，读 `data/foods.js` → 应用规则与决策表 → 写回。判断决策（cut/activate/权重/打标）以数据表形式填进脚本；约 60 道新菜作为 `NEW_FOODS` 追加。一支 `utils/foods.integrity.test.js` 用不变量把成果焊死，一支 `scripts/samplePool.js` 抽样验证分布。

**Tech Stack:** 原生微信小程序（无后端/无依赖）；Node ≥18 + `node:test`；纯 JS。

> ⚠️ **沙箱铁律**（见 `docs/superpowers/specs/2026-06-02-dish-reasonableness-design.md` §背景/§七 + 记忆 `sandbox-blocks-node-workspace-writes`）：本 agent 环境里 `node` 写不进真实工作区文件、且读 `data/foods.js` 的 `category` 是归一后的影子副本。**脚本的真实运行与 `npm test` 验证必须由用户在本地执行**。agent 侧只用 Edit/Write 写脚本与数据、用 Grep/Read 核对真实文件。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `data/options.js` | 共享常量 | 改：加 `FOODS_SEED_VERSION` |
| `pages/index/index.js` | 首页 | 改：2 处重播种闸门（:167,:206） |
| `pages/manage/manage.js` | 管理页 | 改：1 闸门（:74）+ 1 持久化（:150） |
| `scripts/curatePool.js` | 一次性治理脚本（幂等） | 新建 |
| `data/foods.js` | 菜品库 | 由脚本本地改写 |
| `utils/foods.integrity.test.js` | 数据体检（不变量） | 新建 |
| `scripts/samplePool.js` | 抽样分布验证 | 新建 |

---

## Task 1: FOODS_SEED_VERSION —— 只重置菜、保住图鉴/历史/收藏

**Files:**
- Modify: `data/options.js:1-2,40-53`
- Modify: `pages/index/index.js:167,206`
- Modify: `pages/manage/manage.js:74,150`

**为什么**：`STORAGE_KEYS` 的 foods/history/favorites/pkData/ssrPity/ssrCollection 全带 `APP_VERSION` 后缀。直接 bump `APP_VERSION` 会清空一切。新增独立 `FOODS_SEED_VERSION` 只 gate foods 重播种。

- [ ] **Step 1: `data/options.js` 加常量并导出**

第 2 行 `const APP_VERSION = 'v3'` 下方加：
```js
// foods 种子版本：仅用于「是否从 data/foods.js 重播种菜品库」的闸门。
// 与 APP_VERSION 解耦，故更新菜品数据不会动 history/收藏/SSR 图鉴/PK（它们的 key 仍挂 APP_VERSION）。
const FOODS_SEED_VERSION = 'v4'
```
`module.exports = { ... }` 内加入 `FOODS_SEED_VERSION,`（紧跟 `APP_VERSION,` 后）。

- [ ] **Step 2: `pages/index/index.js` 引入并改 2 处闸门**

第 7 行起的解构 `const { APP_VERSION, STORAGE_KEYS, ... }` 加上 `FOODS_SEED_VERSION`。
将 `:167` 与 `:206` 两处的 `localVersion === APP_VERSION` 改为 `localVersion === FOODS_SEED_VERSION`：
```js
this._foods = (localVersion === FOODS_SEED_VERSION && Array.isArray(localFoods) && localFoods.length > 0)
  ? localFoods.map(util.migrateFood)
  : foodsData.map(util.migrateFood)
```

- [ ] **Step 3: `pages/manage/manage.js` 引入并改闸门 + 持久化**

第 6-12 行解构加 `FOODS_SEED_VERSION`。
`:74` 改为 `if (localVersion === FOODS_SEED_VERSION && Array.isArray(localFoods) && localFoods.length > 0) {`
`:150` 改为 `safeSet(STORAGE_KEYS.localVersion, FOODS_SEED_VERSION)`

- [ ] **Step 4: 验证（页面代码不可单测 → 本地 DevTools）**

本地编译后：① 已有图鉴/历史/收藏仍在；② 菜品库已是新数据（随便点开管理页看新增的家常菜在）。
（agent 侧只能确认改动落盘：`Grep "FOODS_SEED_VERSION" -n` 应在 options/index/manage 各命中。）

- [ ] **Step 5: Commit**
```bash
git add data/options.js pages/index/index.js pages/manage/manage.js
git commit -m "feat: FOODS_SEED_VERSION 隔离菜品重播种，保护图鉴/历史/收藏"
```

---

## Task 2: 数据体检测试（先写，定义"完成"）

**Files:**
- Create: `utils/foods.integrity.test.js`

TDD：此测试在当前数据上**会失败**（旧分类残留、chip 候选不足、内脏在池…），治理后转绿。它就是验收标准。

- [ ] **Step 1: 写测试**

```js
const { test } = require('node:test')
const assert = require('node:assert')
const rawFoods = require('../data/foods.js')
const { migrateFood } = require('./util.js')

const CATEGORIES = ['家常菜','小吃点心','日韩料理','汤粥炖品','火锅冒菜','烧烤','甜品饮品','西式简餐','轻食','配菜','面食粉类','饭类套餐']
const LEGACY = ['中式快餐','街边小吃','日韩','西式','火锅烧烤']
const OFFAL = /肥肠|猪脏|大肠|腰花|生鱼片|醉蟹|美蛙/
const foods = rawFoods.map(migrateFood)
const inPool = f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false
const pool = foods.filter(inPool)
const isForeign = f => !/中/.test(f.cuisine || '中式')

test('磁盘无残留旧分类（落盘归一，本地运行才可信）', () => {
  const bad = rawFoods.filter(f => LEGACY.includes(f.category)).map(f => f.name)
  assert.deepStrictEqual(bad, [], `仍有旧分类: ${bad.slice(0,5).join('、')}…(${bad.length})`)
})

test('category 全部合法、weight ∈ [0,1]', () => {
  for (const f of foods) {
    assert.ok(CATEGORIES.includes(f.category), `非法分类 ${f.category}@${f.name}`)
    const w = f.defaultPoolWeight
    assert.ok(w >= 0 && w <= 1, `weight 越界 ${w}@${f.name}`)
  }
})

test('池内无内脏猎奇', () => {
  const bad = pool.filter(f => OFFAL.test(f.name)).map(f => f.name)
  assert.deepStrictEqual(bad, [], `内脏入池: ${bad.join('、')}`)
})

test('池内异国占比 ≤ 15%', () => {
  const ratio = pool.filter(isForeign).length / pool.length
  assert.ok(ratio <= 0.15, `异国占比 ${(ratio*100).toFixed(1)}%`)
})

test('池内非成餐项（canBeMeal=false）权重 ≤ 0.3', () => {
  const bad = pool.filter(f => f.canBeMeal === false && f.defaultPoolWeight > 0.3).map(f => f.name)
  assert.deepStrictEqual(bad, [], `非成餐项权重过高: ${bad.slice(0,5).join('、')}`)
})

test('池量充足（防误删空池）', () => {
  assert.ok(pool.length >= 80, `池量仅 ${pool.length}`)
})

test('每个心情 chip 池内候选 ≥ 15', () => {
  const has = (f, t) => (f.tags || []).includes(t)
  const chip = {
    早餐: f => (f.mealPeriods || []).includes('早餐'),
    辣: f => has(f, '辣') || f.spicyLevel > 0,
    清淡: f => has(f, '清淡'),
    家常菜: f => f.category === '家常菜',
    奢侈: f => f.budget === '💰💰💰',
  }
  for (const [name, pred] of Object.entries(chip)) {
    const n = pool.filter(pred).length
    assert.ok(n >= 15, `chip「${name}」池内仅 ${n} 道`)
  }
})
```

- [ ] **Step 2: 本地跑，确认 FAIL**

Run（本地）：`node --test utils/foods.integrity.test.js`
Expected: 多条 FAIL（旧分类 291、家常菜 chip 仅 2、奢侈仅 3…）。这是预期，证明测试有效。

- [ ] **Step 3: Commit**
```bash
git add utils/foods.integrity.test.js
git commit -m "test: 新增菜品库数据体检（不变量，治理前预期红）"
```

---

## Task 3: `scripts/curatePool.js` —— 幂等治理引擎 + 已定决策

**Files:**
- Create: `scripts/curatePool.js`

引擎现在就能跑（DISABLE/ACTIVATE 用已核准清单，`NEW_FOODS` 先空、Task 5 填，权重规则 Task 4 细化）。幂等：重复运行结果一致。

- [ ] **Step 1: 写脚本**

```js
// scripts/curatePool.js —— 菜品合理性一次性治理（幂等）。
// 用法（本地，无沙箱）：node scripts/curatePool.js   或   node scripts/curatePool.js --dry
const fs = require('fs')
const path = require('path')
const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const foods = require('../data/foods.js')
const DRY = process.argv.includes('--dry')

// 1) 旧分类落盘归一（权威，对齐 utils/util.js normalizeCategory）
const LEGACY = { 中式快餐: '饭类套餐', 街边小吃: '小吃点心', 日韩: '日韩料理', 西式: '西式简餐' }
const normCat = f =>
  f.category === '火锅烧烤'
    ? ((f.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(f.name || '')) ? '烧烤' : '火锅冒菜')
    : (LEGACY[f.category] || f.category)

// 2) 出池+停用（weight0 + enabled false）。按 name 精确匹配。
const DISABLE = new Set([
  '印尼炒饭', '椰浆饭', '炒粿条', '咖喱牛腩饭',                         // 东南亚小众
  '天妇罗盖饭', '鳗鱼饭', '炸虾盖饭', '三文鱼饭',                       // 猎奇日料
  '羊肉泡馍', '豆花饭', '裤带面', '宜宾燃面', '米皮', '擀面皮',          // 地方小众
  '猪脏粉', '肥肠粉', '生鱼片', '醉蟹', '美蛙鱼头',                     // 内脏猎奇
])
const DISABLE_FUZZY = ['油泼扯面']  // 名字带全角括号，用 includes 兜底

// 3) 激活进池（name -> weight）。火锅/烧烤偏共享大餐给中低权重；早餐 0.6-0.8。
const ACTIVATE = {
  四川火锅: 0.45, 重庆火锅: 0.45, 牛肉火锅: 0.4, 潮汕牛肉火锅: 0.4, 猪肚鸡火锅: 0.4,
  椰子鸡火锅: 0.35, 菌菇火锅: 0.35, 番茄火锅: 0.35, 老北京涮羊肉: 0.4, 串串香: 0.4,
  酸菜鱼火锅: 0.4, 鸡公煲: 0.4,
  东北烧烤: 0.4, 新疆烧烤: 0.4, 自助烧烤: 0.4, 烤肉: 0.4, 铁板烧: 0.35, 户外烧烤: 0.3,
  皮蛋瘦肉粥: 0.7, 小笼包: 0.7, 生煎包: 0.6, 煎饼果子: 0.7, 鸡蛋灌饼: 0.6,
  肠粉: 0.6, 胡辣汤: 0.6, 豆浆油条套餐: 0.7, 手抓饼: 0.6, 馄饨: 0.7,
}
// 早餐项需 mealPeriods 含「早餐」
const BREAKFAST = new Set(['皮蛋瘦肉粥','小笼包','生煎包','煎饼果子','鸡蛋灌饼','肠粉','胡辣汤','豆浆油条套餐','手抓饼','馄饨'])

// 4) 权重规则（兜底：按品类/形态给默认权重；ACTIVATE/逐道覆盖优先）。Task 4 据审查细化。
function ruleWeight(f) {
  const c = f.category
  if (c === '烧烤' || c === '火锅冒菜') return 0.4
  return null // null = 保持现值
}

// 5) chip 打标兜底：确保 辣/清淡 tag、奢侈 budget 命中。Task 4 据审查补全 TAG_FIX。
const TAG_FIX = {
  // name: { addTags?: [], budget?: '💰💰💰', spicyLevel?: n }
}

// 6) 新增菜（Task 5 填）。每条 16-hex _id，字段照既有条目。
const NEW_FOODS = [
  // 例（Task 5 批量补全）：
  // { _id:'a1b2c3d4e5f60001', name:'西红柿炒鸡蛋', emoji:'🍅', category:'家常菜',
  //   scene:'自己做', scenes:['自己做','外卖','食堂'], budget:'💰', time:'快',
  //   tags:['家常','鲜','下饭'], cuisine:'中式料理', foodType:'热菜', mealRole:'正餐',
  //   canBeMeal:true, mealPeriods:['午餐','晚餐'], defaultPoolWeight:0.7, spicyLevel:0, enabled:true },
]

// ---------- apply ----------
const seenName = new Set(foods.map(f => f.name))
const seenId = new Set(foods.map(f => f._id))
let changed = 0, disabled = 0, activated = 0, normed = 0, added = 0

const out = foods.map(f => {
  const g = { ...f }
  const nc = normCat(g)
  if (nc !== g.category) { g.category = nc; normed++ }
  if (DISABLE.has(g.name) || DISABLE_FUZZY.some(s => g.name.includes(s))) {
    if (g.defaultPoolWeight !== 0 || g.enabled !== false) { g.defaultPoolWeight = 0; g.enabled = false; disabled++ }
  } else if (ACTIVATE[g.name] != null) {
    if (g.defaultPoolWeight !== ACTIVATE[g.name] || g.enabled === false) { g.defaultPoolWeight = ACTIVATE[g.name]; g.enabled = true; activated++ }
    if (BREAKFAST.has(g.name) && !(g.mealPeriods || []).includes('早餐')) g.mealPeriods = ['早餐', ...(g.mealPeriods || [])]
  } else {
    const w = ruleWeight(g)
    if (w != null && g.defaultPoolWeight !== w) { g.defaultPoolWeight = w }
  }
  const fix = TAG_FIX[g.name]
  if (fix) {
    if (fix.addTags) g.tags = Array.from(new Set([...(g.tags || []), ...fix.addTags]))
    if (fix.budget) g.budget = fix.budget
    if (fix.spicyLevel != null) g.spicyLevel = fix.spicyLevel
  }
  if (JSON.stringify(g) !== JSON.stringify(f)) changed++
  return g
})

for (const nf of NEW_FOODS) {
  if (seenName.has(nf.name) || seenId.has(nf._id)) continue // 幂等：已存在则跳过
  out.push(nf); seenName.add(nf.name); seenId.add(nf._id); added++
}

console.log(`归一 ${normed} | 停用 ${disabled} | 激活 ${activated} | 新增 ${added} | 改动记录 ${changed} | 总 ${out.length}`)
if (!DRY) {
  fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(out, null, 2) + '\n')
  console.log('已写回 data/foods.js')
} else {
  console.log('--dry：未写回')
}
```

- [ ] **Step 2: 本地 dry-run，确认数目合理**

Run（本地）：`node scripts/curatePool.js --dry`
Expected: 形如 `归一 291 | 停用 ~19 | 激活 ~28 | 新增 0 | …`。归一应 ≈ 291（沙箱内会是 0，因影子文件——以本地为准）。

- [ ] **Step 3: Commit（脚本，未跑）**
```bash
git add scripts/curatePool.js
git commit -m "feat: curatePool 治理脚本（归一/停用/激活引擎 + 已核准清单）"
```

---

## Task 4: 逐分类定位（填充 ruleWeight / ACTIVATE / DISABLE / TAG_FIX）

把 spec §二判断标准 + §三权重体系逐道落到每个品类。**可并行子代理**，每批一个品类。

**每批的输入/输出契约（所有批一致）：**
- 输入：`data/foods.js` 中该 `category`（经 `normCat` 后）的全部菜（用 `node -e` 按名列出，注意沙箱 category 是影子值——按 normCat 后的逻辑分类思考即可，名字可信）。
- 判据：spec §二（异国/地方/内脏：国民级留、小众出池）+ §三（权重档）+ **canBeMeal 规则**：有荤/能当主角 → `canBeMeal:true` 且 weight 0.6–1.0；纯素/凉/汤 → `canBeMeal:false` 且 weight 0.15–0.3（与体检不变量一致）。
- 输出：往 `curatePool.js` 的表里追加——
  - 出池项 → `DISABLE`
  - 该品类的默认权重 → 扩展 `ruleWeight`（如 `if (c==='汤粥炖品' && f.mealRole==='汤品') return 0.2`）
  - 需打 `辣`/`清淡` 标或升 `💰💰💰` 的 → `TAG_FIX`
- 验收：该批跑 `node scripts/curatePool.js --dry` 不报错；改动数与预期一致。

**批次（按当前规模，可并行）：**
- [ ] 4a 饭类套餐（~79，主食盖饭：常见 1.0、套餐变体 0.65、异国按标准）
- [ ] 4b 面食粉类（~59，普及 1.0、地方小众已在 DISABLE、复核漏网）
- [ ] 4c 家常菜（~92，硬菜 0.8–1.0 / 半荤 0.6–0.8 / 纯素 0.15–0.3；canBeMeal 据荤素定；打 辣/清淡 标）
- [ ] 4d 配菜（~54，多为凉菜/小菜：canBeMeal=false、weight 0.15–0.3 或维持 0）
- [ ] 4e 小吃点心（~74，含早餐项 → mealPeriods 早餐 + ACTIVATE；其余小吃多 0 或低权重）
- [ ] 4f 汤粥炖品（~40，汤 weight ~0.2 canBeMeal=false；粥早餐项激活）
- [ ] 4g 火锅冒菜 + 4h 烧烤（已大批 ACTIVATE，复核剩余：宴席级如烤全羊/烤乳猪维持 0）
- [ ] 4i 西式简餐 + 4j 日韩料理 + 东南亚 cuisine（异国总量控 ≤15%，国民级留、给 0.45–0.65）
- [ ] 4k 甜品饮品（~21，多 canBeMeal=false；奶茶/饮品给低权重或 0）+ 4l 轻食（~5，清淡标）
- [ ] 4m **Commit**：`git add scripts/curatePool.js && git commit -m "feat: 逐分类定位决策填充"`

---

## Task 5: 新增 ~60 道家常菜（NEW_FOODS）

按用户 100 道清单中**未匹配的 ~57 + 仅有盖饭版的 ~6**（见 spec §四）建标准家常版。可并行子代理，按类型分批。

- [ ] **Step 1: 生成记录**，每条字段（照既有条目，缺省由 migrateFood 兜底）：

```js
{ _id:'<16位hex,全库唯一>', name:'<菜名>', emoji:'<单字>', category:'<家常菜|汤粥炖品|配菜>',
  scene:'自己做', scenes:['自己做','外卖','食堂'], budget:'💰|💰💰|💰💰💰', time:'快|慢',
  tags:['家常', ...口味], cuisine:'中式料理', foodType:'热菜|凉菜|汤', mealRole:'正餐|配菜|汤品',
  canBeMeal:<有荤true/纯素凉汤false>, mealPeriods:['午餐','晚餐'], defaultPoolWeight:<按档>, spicyLevel:<0-3>, enabled:true }
```

权重档（同 Task 4c）：硬菜 0.8–1.0 / 半荤 0.6–0.8 / 纯素·凉 0.15–0.3 / 汤 ~0.2。
分批：荤菜硬菜（红烧/糖醋/水煮…）、半荤炒菜（西红柿炒蛋/各种炒肉）、纯素（清炒/蒜蓉…）、凉菜（凉拌…）、汤（蛋花/排骨汤…）。

- [ ] **Step 2: _id 唯一性自检**：所有新 `_id` 互不重复、且不在现有库（脚本 apply 已按 name/_id 去重兜底，但仍应保证）。
- [ ] **Step 3: Commit**：`git add scripts/curatePool.js && git commit -m "feat: 新增约60道家常菜（NEW_FOODS）"`

---

## Task 6: `scripts/samplePool.js` —— 抽样分布验证

**Files:** Create: `scripts/samplePool.js`

- [ ] **Step 1: 写脚本**

```js
// scripts/samplePool.js —— 模拟 N 次盲盒加权抽取，打印分布。用法：node scripts/samplePool.js [N]
const foods = require('../data/foods.js')
const { migrateFood } = require('../utils/util.js')
const N = parseInt(process.argv[2] || '2000', 10)
const pool = foods.map(migrateFood).filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false)
const total = pool.reduce((s, f) => s + f.defaultPoolWeight, 0)
const pick = () => { let r = Math.random() * total; for (const f of pool) { r -= f.defaultPoolWeight; if (r <= 0) return f } return pool[pool.length - 1] }
const byCat = {}, byCuisine = {}; let bowl = 0
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
console.log('品类分布', Object.fromEntries(Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,pct(v)])))
```

- [ ] **Step 2: Commit**：`git add scripts/samplePool.js && git commit -m "feat: 盲盒抽样分布验证脚本"`

---

## Task 7: 本地落地 + 验证（交付用户执行）

agent 不能在沙箱内真正落盘/验证，把以下交给用户在本地仓库根目录跑：

- [ ] **Step 1:** `node scripts/curatePool.js`（写回 `data/foods.js`）
- [ ] **Step 2:** `git diff --stat data/foods.js` 抽查改动合理
- [ ] **Step 3:** `npm test` —— 全绿（含新 `foods.integrity.test.js` 的全部不变量 + 原 65）
- [ ] **Step 4:** `node scripts/samplePool.js` —— 碗装占比明显下降、异国 ≤15%、火锅/烧烤/早餐/家常菜都抽得到
- [ ] **Step 5:** 微信开发者工具：反复点盲盒，确认"像中国人今天会吃的"；图鉴/历史/收藏仍在
- [ ] **Step 6: Commit 数据**：`git add data/foods.js && git commit -m "feat: 全库菜品定位治理（落盘归一+停用+激活+新增家常菜）"`

---

## Self-Review

- **Spec 覆盖**：①判断标准→Task3/4；②权重→Task3/4/5；③家常菜→Task5；④定位6维→Task4；⑤落盘归一→Task3(normCat)/Task2(断言)；⑥版本→Task1；⑦测试→Task2、验证→Task6/7；⑧chip 候选→Task2 断言 + Task4/5 喂数据。✓
- **沙箱**：所有"真实落盘/验证"集中在 Task7（本地）；agent 侧只写文件 + Grep 核对。✓
- **类型一致**：`defaultPoolWeight`/`enabled`/`canBeMeal`/`mealPeriods`/`category` 命名跨任务一致，与 `migrateFood` 字段对齐。✓
- **canBeMeal↔weight 不变量**：Task4c/5 的"荤 true/素汤 false"与 Task2"非成餐项 ≤0.3"断言一致，不冲突。✓
