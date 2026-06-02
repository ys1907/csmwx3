# 交接文档（给下一位 AI）

> 日期：2026-06-02 · 上一段工作：数据修复 + 盲盒首页重构 + 保底抽卡 + SSR 图鉴。
> 当前 `main` 已是最新、已推送远程、`npm test` 65 全绿。

## 一、项目是什么

「到底吃点啥 · 情侣版」——原生微信小程序（WXML/WXSS/JS），**无后端、无第三方依赖**，所有数据本地 `wx.setStorage`。帮情侣/朋友决定吃什么。

- 跑测试：`npm test`（= `node --test utils/*.test.js`，Node ≥ 18）。只覆盖 `utils/` 纯逻辑；页面依赖 `wx`/`Page` 运行时不可单测。
- 预览：微信开发者工具导入项目根目录。

## 二、架构（关键）

- `utils/foodLogic.js` —— **纯决策引擎**（不依赖 wx，rng 可注入，可测）。核心：`filterFoods` / `weightedPick`（加权选菜）/ `inferSeason`（季节弱信号）/ `rollRarityWithPity`（保底抽卡）/ `buildTasteProfile` / `computeStreak` / `buildMealCombo`。**新决策逻辑一律放这里，配单测。**
- `utils/util.js` —— `migrateFood`（记录归一，**运行时把旧分类映射到新 12 分类 + 空 weatherTags 时按规则推断填充**）、`uid`/`shuffleArray`/`formatDate`。
- `utils/storage.js` —— `safeGet`/`safeSet`（try/catch 包 wx storage）。**所有存储走这里。**
- `data/options.js` —— 共享常量：`APP_VERSION`(v3)、`STORAGE_KEYS`（含新增 `ssrPity`/`ssrCollection`）、各选项列表。
- `data/foods.js` —— **479 道菜的富数据库**（见第五节，是下一步重点）。
- `pages/index/` —— **盲盒首页**（推荐 tab + 我的 tab，状态机 `boxPhase: idle/revealing/revealed`）。
- `pages/manage/` —— 菜品 CRUD。

## 三、已完成的工作

1. **数据修复**：291 条旧分类已归一（脚本 + migrateFood 运行时兜底）；季节弱信号接通（inferSeason → buildCtx → foodWeight ×1.15，weatherTags 运行时填充）；删除 foodWeight 永不触发的地区加权空壳；清理备份/导出产物 + `.gitignore`。
2. **盲盒首页重构**：「奶油恋人」配色（token 在 `app.wxss`：暖橙=行动、柔粉=收藏/情侣、薄荷=标签、奶油底、暖棕字、金=SSR）；首页改为**点盒子揭晓**（删了「一进来就出结果」）；移除转盘/塔罗/默契PK；菜卡与操作分离；筛选收进 ⚙；新增「我的」tab（收藏/历史/口味画像/连胜/SSR图鉴/菜品管理入口）；凑一桌副入口。
3. **三档揭晓动画**：R 温柔升起 / SR 凝光 / SSR 殿堂（彩虹细边 + 发光 + 旋转金环 + 星粒 + 皇冠）。原地缩放变身、时序对齐。
4. **保底抽卡**（`rollRarityWithPity`）：基础 R88/SR11/SSR1；未中 SSR 概率 +1%/次、封顶 16%；累计 **25 抽硬保底必出**；中后重置。计数存 `ssrPity`，跨会话保留。
5. **SSR 图鉴**：抽到 SSR 自动入册（`ssrCollection`，同名去重），「我的」页彩虹卡片网格展示。

设计/计划文档：`docs/superpowers/specs/` 与 `docs/superpowers/plans/`（两轮 spec + plan，含完整决策依据）。

## 四、关键约定与坑（务必读）

- ⚠️ **沙箱隔离 node 工作区写入**：本 agent 环境里，`node` 脚本对工作区文件的写入会被隔离到 overlay，**改不动真实文件**（`git`/Grep/Read 看真实文件，于是看不到 node 的"写入"）。所以：**改源码/数据一律用 Edit/Write 工具**；需要程序化批量改数据时，要么改成 `migrateFood` 运行时兜底，要么写好脚本让**用户在本地（无沙箱）运行**。`git` 命令请加 `dangerouslyDisableSandbox: true` 才能落盘/联网。
- **纯逻辑可测、rng/now 可注入**：foodLogic 全程 TDD，先写 `node:test` 用例再实现。
- **大数组存实例属性**（`this._foods` 等）不进 `data`，避免 setData 跨渲染层序列化。
- **配色只用 CSS 变量**（`app.wxss` 的 token），三个彩色各司其职（这是「整洁」来源）。
- **自定义导航**：顶部要留 `calc(env(safe-area-inset-top) + 150rpx)` 避开微信胶囊。
- **tab 切换用 `hidden` 不用 `wx:if`**（否则切回重建 DOM、揭晓动画重播 → 卡片"跳/升高" bug）。
- `git` 提交常有 `LF→CRLF` warning，正常。提交只 `git add` 明确文件，别 `-A`（工作区可能有无关未跟踪文件）。

## 五、⭐ 待解决：菜品合理性（下一步重点）

**用户原话**：菜品「必须要有合理性，不能总是一些奇怪的或者不符合使用者（中国人）的东西」。

**现状**：`data/foods.js` 479 道，字段丰富（`name/emoji/category/scene/budget/time/tags/cuisine/foodType/defaultPoolWeight/regionTags/weatherTags/availability/...`）。首页盲盒**只从 `defaultPoolWeight > 0` 的菜抽**（见 `pages/index/index.js` 的 `getFilteredFoods`，约 110+ 条进默认池）。权重规则：全国常见 1.0 / 套餐变体 0.65 / 地区/异国 0.30 / 不能成餐 0。历史清洗脚本在 `scripts/`（`cleanFoods.js`/`enrichFoods.js`/`applyReview.js`）。

**问题**：默认池里可能仍有生僻异国菜、不合国情的组合、奇怪命名、过于小众的项，导致抽到的菜「不像中国人日常会吃的」。

### 给下一位 AI 的提示词（可直接用）

```
请优化 data/foods.js 的菜品合理性，让「到底吃点啥·情侣版」首页盲盒抽到的菜更符合中国人日常饮食，避免生僻/异国/奇怪/小众的项。

先读：data/foods.js（字段 shape）、pages/index/index.js 的 getFilteredFoods（首页只抽 defaultPoolWeight>0 的"默认池"）、scripts/cleanFoods.js 与 enrichFoods.js（清洗/权重历史）、docs/HANDOFF.md（项目约定，尤其"沙箱隔离 node 写入"这条）。

要做：
1. 审查"默认池"（defaultPoolWeight>0 的菜，约 110+ 条），逐条判断是否是中国人日常常吃/想吃的合理选项。
2. 识别并处理不合理项：奇怪命名、生僻异国菜、不合国情的组合、过小众的——把它们 defaultPoolWeight 设 0（移出首页池但保留在库），同时给常见家常/快餐/面食/小吃提高权重。
3. 必要时补充高频中式日常菜（家常菜、盖饭、面食、小吃、火锅烧烤、地方名吃等），并补全字段（category 用新 12 分类、canBeMeal、mealPeriods、defaultPoolWeight、availability、tags 等，参考既有条目）。
4. 关键约束：① 改 data/foods.js 必须用 Edit/Write 工具，node 脚本在此环境改不动真实文件；若要批量处理，写脚本让用户本地运行。② 改动后 migrateFood 仍要兼容、npm test 全绿。③ 数据量大，建议分批 Edit。
5. 验证：在微信开发者工具反复点盲盒，确认出菜合理、像"中国人今天会吃的"。

建议先用 brainstorming 跟用户对齐"合理性"标准（哪些算奇怪、目标地域口味、要不要按场景/地区细化），产出 spec → plan，再执行。这是个数据治理活，重在判断标准与覆盖面，适合用 subagent 分批审查 + 抽样验证。
```

## 六、收尾备注

- 远程旧分支 `origin/docs/add-readme` 仍在，可删：`git push origin --delete docs/add-readme`。
- `食谱AI修改提示词.md` 按用户意愿未入库（本地草稿）。
- pity 概率是正式的 **88/11/1**（无临时调试值残留）。
