# 数据修复实现计划（分类归一 / 季节弱信号 / 产物清理）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复菜品分类新旧混用、接通纯本地的季节弱信号加权、清理散落构建产物。

**Architecture:** 纯逻辑改动集中在 `utils/`（可单测）；季节信号是注入式纯函数 `inferSeason`，由页面 `buildCtx` 调用；一次性数据迁移脚本归一分类并填充 `weatherTags`；运行时 `migrateFood` 兜底保证导入数据也正确。

**Tech Stack:** 原生微信小程序（WXML/WXSS/JS），无第三方依赖；测试用 Node 内置 `node:test` + `node:assert`，`npm test` 等价于 `node --test utils/*.test.js`（需 Node ≥ 18）。

**全局约定：** 每条 `git commit` 的 message 末尾追加一行（与本仓库规范一致）：
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
为简洁，下文 commit 步骤只写主 message，执行时请附上上述署名行。提交前只 `git add` 该任务明确列出的文件，不要 `git add -A`（工作区另有大量无关未提交改动）。

---

## File Structure

| 文件 | 职责 | 本计划改动 |
|---|---|---|
| `utils/util.js` | 记录归一 `migrateFood` | 新增旧分类→新分类运行时兜底 |
| `utils/util.test.js` | util 单测 | 新增分类归一用例 |
| `utils/foodLogic.js` | 纯决策引擎 | 新增 `inferSeason`；删除 `foodWeight` 地区加权分支 |
| `utils/foodLogic.test.js` | foodLogic 单测 | 新增 `inferSeason` 用例；删除地区匹配用例 |
| `pages/index/index.js` | 玩法编排 | `buildCtx` 注入季节 `weatherTags` |
| `scripts/migrateFoodsCategoriesAndWeather.js` | 一次性数据迁移 | 新建：归一分类 + 填充 weatherTags |
| `data/foods.js` | 菜品数据 | 由迁移脚本改写（分类归一、weatherTags 非空） |
| `.gitignore` | 忽略规则 | 追加 `*.backup`、`食谱导出_*` |

`manage.js` **不改**：其 `_foods` 全部经 `migrateFood`，分类归一后 `openEditSheet` 的 `CATEGORY_OPTIONS.indexOf(food.category)` 必 ≥ 0，现有 `cIdx >= 0 ? cIdx : 0` 兜底即正确。

---

## Task 1: migrateFood 运行时分类归一兜底

**Files:**
- Modify: `utils/util.js`（`migrateFood`，第 24-57 行附近）
- Test: `utils/util.test.js`

- [ ] **Step 1: 写失败测试**

在 `utils/util.test.js` 末尾（第 48 行 `uid` 测试之后）追加：

```javascript
test('migrateFood: 旧分类归一到新分类', () => {
  assert.strictEqual(migrateFood({ name: '黄焖鸡', category: '中式快餐' }).category, '饭类套餐')
  assert.strictEqual(migrateFood({ name: '煎饼', category: '街边小吃' }).category, '小吃点心')
  assert.strictEqual(migrateFood({ name: '寿司', category: '日韩' }).category, '日韩料理')
  assert.strictEqual(migrateFood({ name: '意面', category: '西式' }).category, '西式简餐')
  // 火锅烧烤需细分：foodType 或菜名命中烧烤 → 烧烤，否则火锅冒菜
  assert.strictEqual(migrateFood({ name: '自助烧烤', category: '火锅烧烤' }).category, '烧烤')
  assert.strictEqual(migrateFood({ name: '烤羊腿', category: '火锅烧烤', foodType: '烧烤' }).category, '烧烤')
  assert.strictEqual(migrateFood({ name: '四川火锅', category: '火锅烧烤' }).category, '火锅冒菜')
  // 新分类与缺失分类保持既有行为
  assert.strictEqual(migrateFood({ name: '红烧肉', category: '家常菜' }).category, '家常菜')
  assert.strictEqual(migrateFood({ name: '无分类' }).category, '家常菜')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test utils/util.test.js`
Expected: FAIL —— `migrateFood({category:'中式快餐'}).category` 仍为 `'中式快餐'`，断言 `'饭类套餐'` 不通过。

- [ ] **Step 3: 实现归一逻辑**

在 `utils/util.js` 顶部（`function uid()` 之前）新增映射与归一函数：

```javascript
// 旧分类 → 新 12 分类（权威映射源自 scripts/cleanFoods.js）
const LEGACY_CATEGORY_MAP = {
  '中式快餐': '饭类套餐',
  '街边小吃': '小吃点心',
  '日韩': '日韩料理',
  '西式': '西式简餐',
}

// 归一单条记录的 category；火锅烧烤按 foodType/菜名细分到烧烤 vs 火锅冒菜
function normalizeCategory(food) {
  const c = food.category
  if (c === '火锅烧烤') {
    if (food.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(food.name || '')) return '烧烤'
    return '火锅冒菜'
  }
  return LEGACY_CATEGORY_MAP[c] || c || '家常菜'
}
```

把 `migrateFood` 内的 `category` 一行由：

```javascript
    category: food.category || '家常菜',
```

改为：

```javascript
    category: normalizeCategory(food),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test utils/util.test.js`
Expected: PASS（全部用例通过）。

- [ ] **Step 5: 提交**

```bash
git add utils/util.js utils/util.test.js
git commit -m "fix: migrateFood 兜底归一旧分类到新12分类"
```

---

## Task 2: foodLogic.inferSeason 纯函数（季节弱信号）

**Files:**
- Modify: `utils/foodLogic.js`（新增函数 + 导出）
- Test: `utils/foodLogic.test.js`

- [ ] **Step 1: 写失败测试**

在 `utils/foodLogic.test.js` 第 8 行的解构 require 中加入 `inferSeason`：

```javascript
const {
  filterFoods, buildWheelPool, resolveWheelWinner, SECTOR_DEG, SECTOR_OFFSET,
  foodWeight, weightedPick, weightedPickIndex, buildTasteProfile,
  explainPick, computeStreak, buildMealCombo,
  buildRichReason, pickAlternatives, inferSeason
} = require('./foodLogic.js')
```

在文件末尾追加用例：

```javascript
test('inferSeason: 夏→炎热适合、冬→降温适合、春秋→空', () => {
  assert.deepStrictEqual(inferSeason(new Date(2026, 6, 15).getTime()), ['炎热适合'])  // 7 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 7, 1).getTime()), ['炎热适合'])   // 8 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 0, 15).getTime()), ['降温适合'])  // 1 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 11, 15).getTime()), ['降温适合']) // 12 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 3, 15).getTime()), [])            // 4 月（春）
  assert.deepStrictEqual(inferSeason(new Date(2026, 9, 15).getTime()), [])            // 10 月（秋）
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test utils/foodLogic.test.js`
Expected: FAIL —— `inferSeason is not a function`。

- [ ] **Step 3: 实现 inferSeason**

在 `utils/foodLogic.js` 中 `buildMealCombo` 函数之后、`module.exports` 之前新增：

```javascript
// ========== 季节弱信号：纯本地、零依赖（替代需联网的实时天气） ==========
// 由当前月份推断适配的 weatherTags，喂给 foodWeight 的天气匹配。now 可注入便于测试。
function inferSeason(now) {
  const month = (now ? new Date(now) : new Date()).getMonth() + 1 // 1..12
  if (month >= 6 && month <= 8) return ['炎热适合']
  if (month === 12 || month === 1 || month === 2) return ['降温适合']
  return [] // 春秋中性，不加权（「雨天适合」需实时天气，季节方案不触发）
}
```

在 `module.exports = { ... }` 中加入 `inferSeason,`（与其它导出并列即可）：

```javascript
  computeStreak,
  buildMealCombo,
  inferSeason,
  WHEEL_SECTORS,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test utils/foodLogic.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add utils/foodLogic.js utils/foodLogic.test.js
git commit -m "feat: 新增 inferSeason 季节弱信号纯函数"
```

---

## Task 3: buildCtx 注入季节 weatherTags（接通）

**Files:**
- Modify: `pages/index/index.js`（`buildCtx`，第 456-461 行）

页面层无单测，验证靠现有测试不回归 + 逻辑审查。

- [ ] **Step 1: 修改 buildCtx**

把 `pages/index/index.js` 的 `buildCtx`：

```javascript
  // NEW: 构建推荐上下文（渠道/地区/天气）
  buildCtx() {
    const { filters } = this.data
    const scene = filters.sceneIdx > 0 ? SCENE_OPTIONS[filters.sceneIdx] : null
    // userRegion / weatherTags 后续从 storage 获取，目前预留
    return { scene }
  },
```

改为：

```javascript
  // NEW: 构建推荐上下文（渠道 + 季节弱信号）
  buildCtx() {
    const { filters } = this.data
    const scene = filters.sceneIdx > 0 ? SCENE_OPTIONS[filters.sceneIdx] : null
    // 季节弱信号：按当前月份注入 weatherTags（纯本地，零依赖）
    const weatherTags = foodLogic.inferSeason()
    return { scene, weatherTags }
  },
```

（`index.js` 第 5 行已 `const foodLogic = require('../../utils/foodLogic.js')`，无需新增 import。`foodWeight` 的天气匹配分支已存在，会自动生效，无需改 `foodLogic`。）

- [ ] **Step 2: 跑全部测试确认不回归**

Run: `npm test`
Expected: PASS（页面改动不影响 utils 测试；确认无语法错误连带破坏）。

- [ ] **Step 3: 提交**

```bash
git add pages/index/index.js
git commit -m "feat: buildCtx 注入季节 weatherTags，接通季节加权"
```

---

## Task 4: 删除 foodWeight 地区加权空壳

**Files:**
- Modify: `utils/foodLogic.js`（`foodWeight` 内地区分支，第 130-137 行）
- Test: `utils/foodLogic.test.js`（删除「foodWeight: 地区匹配权重」用例，第 343-349 行）

地区加权由 `ctx.userRegion` 触发，但 `buildCtx` 永不传 `userRegion`（用户已确认不做地区）。删除空壳代码与其专属测试。

- [ ] **Step 1: 删除地区匹配测试**

从 `utils/foodLogic.test.js` 删除整段：

```javascript
test('foodWeight: 地区匹配权重', () => {
  const foodLocal = { name: 'a', defaultPoolWeight: 1.0, regionTags: ['川渝', '全国常见'], tags: [] }
  const foodForeign = { name: 'b', defaultPoolWeight: 1.0, regionTags: ['华南'], tags: [] }
  const wLocal = foodWeight(foodLocal, {}, { userRegion: '川渝' })
  const wForeign = foodWeight(foodForeign, {}, { userRegion: '川渝' })
  assert.ok(wLocal > wForeign, '本地区权重大于外地')
})
```

- [ ] **Step 2: 删除 foodWeight 地区分支**

从 `utils/foodLogic.js` 的 `foodWeight` 中删除整段：

```javascript
  // NEW: 地区匹配
  if (ctx?.userRegion && food.regionTags?.length > 0) {
    if (food.regionTags.includes(ctx.userRegion) || food.regionTags.includes('全国常见')) {
      w *= 1.1
    } else if (!food.regionTags.includes('全国常见')) {
      w *= 0.7 // 非本地区且非全国常见 → 降权
    }
  }

```

（保留其后的「天气匹配」分支不动；`regionTags` 数据字段与 `migrateFood` 中的字段保留。）

- [ ] **Step 3: 跑测试确认全绿**

Run: `node --test utils/foodLogic.test.js`
Expected: PASS（地区用例已移除，其余包括天气匹配用例通过）。

- [ ] **Step 4: 提交**

```bash
git add utils/foodLogic.js utils/foodLogic.test.js
git commit -m "refactor: 删除 foodWeight 永不触发的地区加权空壳"
```

---

## Task 5: 一次性数据迁移（归一分类 + 填充 weatherTags）

**Files:**
- Create: `scripts/migrateFoodsCategoriesAndWeather.js`
- Modify: `data/foods.js`（由脚本改写）

**顺序关键：** 脚本内先归一 `category`，再 `inferWeatherTags`——后者依赖 `category`（如「火锅冒菜」「烧烤」），分类还是旧值会漏判。

- [ ] **Step 1: 创建迁移脚本**

创建 `scripts/migrateFoodsCategoriesAndWeather.js`：

```javascript
// 一次性迁移：① 旧分类归一到新 12 分类 ② 按规则填充 weatherTags（此前全空）
// 顺序：必须先归一 category，inferWeatherTags 才能命中「火锅冒菜/烧烤」等新分类。
// 备份写到 *.backup（被 .gitignore 忽略，且 git 历史已可回溯）。
const fs = require('fs')
const path = require('path')

const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const BACKUP_PATH = path.join(__dirname, '..', 'data', 'foods.js.pre_migrate.backup')
const foods = require(FOODS_PATH)

// ① 分类归一（权威映射源自 scripts/cleanFoods.js）
const CATEGORY_REMAP = {
  '中式快餐': '饭类套餐',
  '街边小吃': '小吃点心',
  '日韩': '日韩料理',
  '西式': '西式简餐',
}
function normalizeCategory(item) {
  const c = item.category
  if (c === '火锅烧烤') {
    if (item.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(item.name || '')) return '烧烤'
    return '火锅冒菜'
  }
  return CATEGORY_REMAP[c] || c
}

// ② weatherTags 推断（逻辑源自 scripts/enrichFoods.js inferWeatherTags）
function inferWeatherTags(item) {
  const { name = '', category, tags = [], foodType, mealRole } = item
  const weather = []
  if (tags.includes('凉') || tags.includes('清爽') || category === '轻食') weather.push('炎热适合')
  if (/凉皮|冷面|沙拉|凉面|凉粉|冰/.test(name) && !weather.includes('炎热适合')) weather.push('炎热适合')
  if ((foodType === '饮品' || mealRole === '饮品') && !weather.includes('炎热适合')) weather.push('炎热适合')
  if (tags.includes('热食') || tags.includes('辣') || category === '火锅冒菜' || category === '烧烤') weather.push('降温适合')
  if (/火锅|羊肉汤|麻辣烫|烧烤|烤肉|烤鱼|串串/.test(name) && !weather.includes('降温适合')) weather.push('降温适合')
  if (category === '汤粥炖品' && mealRole === '汤品' && !weather.includes('降温适合')) weather.push('降温适合')
  if (/馄饨|云吞|抄手|热汤|汤面|拉面|火锅/.test(name) && !weather.includes('雨天适合')) weather.push('雨天适合')
  if ((category === '火锅冒菜' || category === '汤粥炖品') && !weather.includes('雨天适合')) weather.push('雨天适合')
  return weather
}

fs.copyFileSync(FOODS_PATH, BACKUP_PATH)

let catChanged = 0, weatherFilled = 0
for (const item of foods) {
  const newCat = normalizeCategory(item)
  if (newCat !== item.category) { item.category = newCat; catChanged++ }
  item.weatherTags = inferWeatherTags(item)
  if (item.weatherTags.length > 0) weatherFilled++
}

fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(foods, null, 2) + '\n')
console.log(`完成：分类归一 ${catChanged} 条；weatherTags 非空 ${weatherFilled} / ${foods.length} 条；备份 → ${BACKUP_PATH}`)
```

- [ ] **Step 2: 运行迁移脚本**

Run: `node scripts/migrateFoodsCategoriesAndWeather.js`
Expected: 输出形如 `完成：分类归一 291 条；weatherTags 非空 200+ / 479 条；备份 → .../foods.js.pre_migrate.backup`

- [ ] **Step 3: 验证迁移结果**

Run:
```bash
node -e "const f=require('./data/foods.js'); const old=['中式快餐','街边小吃','火锅烧烤','日韩','西式']; console.log('旧分类残留:', f.filter(x=>old.includes(x.category)).length); console.log('weatherTags 非空:', f.filter(x=>(x.weatherTags||[]).length>0).length)"
```
Expected: `旧分类残留: 0`，且 `weatherTags 非空:` 为正数（数百条）。

- [ ] **Step 4: 跑测试确认数据未破坏结构**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交（只提交脚本与数据，不提交备份）**

```bash
git add scripts/migrateFoodsCategoriesAndWeather.js data/foods.js
git commit -m "data: 归一旧分类并填充 weatherTags（一次性迁移）"
```

---

## Task 6: 清理散落产物 + 补 .gitignore

**Files:**
- Delete: `data/foods.js.backup`、`data/foods.js.enrich_backup`、`data/foods.js.pre_migrate.backup`、`食谱导出_20260601_103350.js`、`食谱导出_20260601_103410.json`
- Modify: `.gitignore`

- [ ] **Step 1: 追加 .gitignore 规则**

在 `.gitignore` 末尾追加：

```
# 数据迁移/清洗脚本备份
*.backup

# 菜品库导出产物
食谱导出_*
```

- [ ] **Step 2: 删除散落产物文件**

Run（Windows PowerShell）：
```powershell
Remove-Item -Force 'data/foods.js.backup','data/foods.js.enrich_backup','data/foods.js.pre_migrate.backup','食谱导出_20260601_103350.js','食谱导出_20260601_103410.json'
```
（若某文件已不存在，忽略其错误即可。）

- [ ] **Step 3: 确认工作区不再显示这些产物**

Run: `git status --porcelain`
Expected: 输出中不再出现上述 5 个产物文件（`data/foods.js.backup` 等）；`.gitignore` 显示为已修改。

- [ ] **Step 4: 提交**

```bash
git add .gitignore
git commit -m "chore: 清理数据备份/导出产物并补 .gitignore"
```

---

## Self-Review

**Spec coverage：**
- 问题 1（分类归一）→ Task 1（migrateFood 运行时兜底）+ Task 5（一次性迁移 data/foods.js）；manage.js 无需改已说明。✓
- 问题 2（季节弱信号）→ Task 2（inferSeason）+ Task 3（buildCtx 接通）+ Task 5（填充 weatherTags 数据）+ Task 4（删地区空壳）。✓
- 问题 3（产物清理）→ Task 6。✓
- 执行顺序约束（先归一后填 weatherTags）→ 由 Task 5 脚本内部顺序保证，已在任务中标注。✓

**Placeholder scan：** 无 TBD/TODO；每个改码步骤均给出完整代码或精确删除块。✓

**Type/命名一致性：** `normalizeCategory` / `LEGACY_CATEGORY_MAP`（util.js）、`inferSeason`（foodLogic.js，测试 require 与导出一致）、`inferWeatherTags` / `CATEGORY_REMAP`（迁移脚本，自包含）、产出值域 `炎热适合/降温适合/雨天适合` 与 inferSeason 返回值一致。✓

**注意事项：** Task 4 删除地区分支前，Task 3 已让 `buildCtx` 不传 `userRegion`，删除安全；天气匹配测试（foodLogic.test.js:351-357）保留并继续通过。
