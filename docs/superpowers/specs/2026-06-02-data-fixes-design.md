# 设计：分类归一 / 季节弱信号 / 产物清理

- 日期：2026-06-02
- 状态：已批准（用户确认整体设计；地区加权分支确认删除）
- 范围：三处独立修复，可分别实现、分别测试、分别提交

## 背景

代码遍历发现三处问题：

1. `data/foods.js` 的 `category` 字段新旧分类混用，导致管理页筛选漏菜、编辑误改分类。
2. `foodWeight` 的季节/天气加权是双重空壳：数据侧 `weatherTags` 全空，上下文侧 `buildCtx` 不传 `weatherTags`；地区加权同为空壳。
3. 仓库根目录散落构建产物（备份、导出文件），未纳入 `.gitignore`。

项目核心约束：原生微信小程序，**无后端、无第三方依赖**，纯逻辑与 `wx` 运行时隔离、可单测。

---

## 问题 1：分类字段新旧混用

### 现状
`data/foods.js` 共 479 条，其中 291 条仍用旧分类：中式快餐 118、街边小吃 62、火锅烧烤 47、日韩 41、西式 23。

后果：
- 管理页 `computeDisplayFoods` 用 `f.category !== cat` 精确匹配，按新分类筛选时漏掉旧分类菜（例：选「日韩料理」只命中 7 条，漏 41 条「日韩」）。
- `manage.js` `openEditSheet` 中 `CATEGORY_OPTIONS.indexOf(food.category)` 对旧分类返回 -1 → 回退索引 0「家常菜」→ 用户一保存即把旧分类菜误改成「家常菜」。

### 设计
1. **一次性迁移**：脚本归一 `data/foods.js` 的 291 条旧分类（备份后写回）。
2. **运行时兜底**：`utils/util.js` 的 `migrateFood` 内置同一张映射表，`category` 命中旧分类即归一 —— 从剪贴板导入的外部旧数据也永远正确。
3. **管理页防御**：`manage.js` `openEditSheet` 在 `indexOf === -1` 时不再静默落到索引 0（经 migrate 后基本不会 -1，仍保留防御）。

### 映射规则（权威，复用 `scripts/cleanFoods.js:153-159,445-459`）
- 中式快餐 → 饭类套餐
- 街边小吃 → 小吃点心
- 日韩 → 日韩料理
- 西式 → 西式简餐
- 火锅烧烤 → 若 `foodType==='烧烤'` 或 `name` 含「烧烤/烤串/烤羊」→ 烧烤，否则 → 火锅冒菜

### 测试
`utils/util.test.js` 新增 `migrateFood` 分类归一用例：5 种旧分类各一条 + 火锅烧烤的两个分支。

### 验收
- `data/foods.js` 中旧分类计数为 0。
- 管理页按各新分类能筛到全部对应菜品。
- 编辑一条原旧分类菜并保存，分类不再被改成「家常菜」。

---

## 问题 2：季节弱信号（纯本地，零依赖）

### 现状
- `weatherTags` 在 `data/foods.js` 中全空（0 条非空），`enrichFoods.js` 的 `inferWeatherTags` 逻辑从未落地。
- `index.js` `buildCtx()` 只返回 `scene`，不传 `weatherTags`。
- `foodWeight` 中 `ctx.userRegion` 地区加权也是空壳（`buildCtx` 不传 `userRegion`）。

### 设计
1. **填充数据**：复用 `enrichFoods.js:312` `inferWeatherTags`（值域：炎热适合 / 降温适合 / 雨天适合），写入 `data/foods.js` 的 `weatherTags`（备份后写回）。
2. **纯函数** `foodLogic.inferSeason(now)`：
   - 夏（6/7/8 月）→ `['炎热适合']`
   - 冬（12/1/2 月）→ `['降温适合']`
   - 春秋（3/4/5、9/10/11 月）→ `[]`（中性，不加权）
   - `now` 可注入，便于确定性测试。
   - 「雨天适合」无法从季节纯本地推断，季节方案不触发它（保留在数据里供未来接入实时天气时使用）。
3. **接通**：`index.js` `buildCtx()` 调 `inferSeason()`，把 `weatherTags` 放进返回的 ctx。`foodWeight` 现有天气匹配分支（`food.weatherTags.some(t => ctx.weatherTags.includes(t))` → `×1.15`）随即自动生效，**该分支无需改动**。
4. **删除地区空壳**：移除 `foodWeight` 中 `ctx.userRegion` 的整段地区加权逻辑；保留 `regionTags` 数据字段不动（仅去掉永不触发的加权代码）。

### 执行顺序约束（重要）
**必须先完成问题 1 的分类归一，再填充 `weatherTags`。** `inferWeatherTags` 依赖 `category`（如「火锅冒菜」「烧烤」「轻食」「汤粥炖品」）；若分类仍是旧值（「火锅烧烤」等），推断会漏判。建议两步合并为单个迁移脚本，顺序：① 归一分类 → ② 填充 weatherTags，一次备份、一次写回。

### 测试
- `utils/foodLogic.test.js` 新增 `inferSeason` 边界用例：夏（7 月）、冬（1 月、12 月）、春（4 月）、秋（10 月）。
- `foodWeight` 天气匹配已有用例覆盖；删除地区分支后，移除/更新相关地区加权断言。

### 验收
- `data/foods.js` 中 `weatherTags` 不再全空。
- 注入冬季 `now`，火锅类（`降温适合`）`foodWeight` 得到 `×1.15`；注入夏季，凉面/沙拉类（`炎热适合`）得到 `×1.15`。
- `foodLogic.js` 中不再有 `userRegion` 引用。

---

## 问题 3：清理产物 + 补 `.gitignore`

### 设计
- 删除 4 个产物文件：
  - `data/foods.js.backup`
  - `data/foods.js.enrich_backup`
  - `食谱导出_20260601_103350.js`
  - `食谱导出_20260601_103410.json`
- `.gitignore` 追加规则：
  - `*.backup`
  - `食谱导出_*`
- 保留：`CLAUDE.zh.md`、`食谱AI修改提示词.md`。

### 验收
- 4 个产物文件已从磁盘删除。
- `git status` 不再显示这些文件。
- `.gitignore` 含上述两条新规则；新生成的同类产物会被自动忽略。

---

## 超出范围（YAGNI）
- 不接入真实定位 / 第三方天气 API（与「无后端、无第三方依赖」原则冲突）。
- 不决定 `package.json` / `scripts/` / `CLAUDE.md` / `utils/pageLifecycle.test.js` 等正常未提交文件是否入库（属分支收尾，另行处理）。
- 不做与上述三处无关的重构。
