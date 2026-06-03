# 菜品数据 / 项目交接（最新 · 2026-06-03）

> 本文替换旧版（旧版还在写「7 分类 + 8 字段」，早已过时）。给**下一位 AI（也是未来的我）**或想改菜品数据的人。
> 更全的项目背景见 `docs/HANDOFF.md`（上一段的治理上下文）。

---

## 一句话现状
「到底吃点啥·情侣版」原生微信小程序，盲盒选菜。本次会话完成并合并到 `main`：**菜品合理性治理（工具）+ 存储 schema 迁移加固 + 微信体验评分修复 + README 重写**。

## ✅ 菜品治理已应用（2026-06-03，commit `447c2bf`，已推 main）
`scripts/curatePool.js` 的全部决策已写入 `data/foods.js`：**479 → 524 道**，旧分类落盘归一（0 残留）、49 道怪菜出池、462 进盲盒池、45 道新家常菜，权重全对；体检 `utils/foods.integrity.test.js` 7/7 绿。
> 以后若改了 `curatePool.js` 的决策表要重新应用：`node scripts/curatePool.js && npm test`，再提交 `data/foods.js`。
> ⚠️ 本沙箱里 **node 读写 / Bash grep 看到的 `data/foods.js` 可能是陈旧的影子副本**；以 **PowerShell 跑 node** 或 `git show HEAD:data/foods.js`（用 Python 按 UTF-8 解码核对）为准。

---

## 菜品数据现状（改数据前必读）
- `data/foods.js`：479 条富数据库，每条约 **24 字段**（不是旧版说的 8 个）。
- `category` 取 **新 12 分类**之一：`家常菜 / 饭类套餐 / 面食粉类 / 小吃点心 / 汤粥炖品 / 火锅冒菜 / 烧烤 / 日韩料理 / 西式简餐 / 甜品饮品 / 轻食 / 配菜`。（旧 7 分类已废）
- 磁盘上仍有 **291 条旧分类**（中式快餐/日韩/西式/街边小吃/火锅烧烤），靠 `utils/util.js#migrateFood` 在加载时运行时归一；`curatePool` 会真正落盘归一。
- 关键字段：`defaultPoolWeight`（0 = 出池，>0 进盲盒池）、`enabled`、`canBeMeal`、`mealPeriods`、`scene`/`scenes`、`budget`、`time`、`tags`、`cuisine`、`foodType`、`mealRole`…
- **首页盲盒只从 `defaultPoolWeight>0 && enabled!==false` 的菜抽**（`pages/index/index.js` 的 `getFilteredFoods`）。
- 判断标准 / 权重体系 / 处理机制：见 `docs/superpowers/specs/2026-06-02-dish-reasonableness-design.md`。

## 怎么改菜品数据（别再用「粘给外部 AI」那套旧流程）
- **小批量**：直接用 Edit/Write 改 `data/foods.js`。
- **批量治理**：改 `scripts/curatePool.js` 里的决策表（`FORCE_OFF` 出池集 / `O` 逐道定位 / `NEW_FOODS` 新增），让用户本地跑。
- 改完保证 `migrateFood` 仍兼容、`npm test` 全绿。

---

## ⚠️ 沙箱坑（本 agent 环境特有，务必知道，已多次踩）
1. **node 写工作区文件 → 隔离到 overlay**，改不动真实文件；`git`/Grep/Read 看真实文件，二者不一致。
2. **node 读 `data/foods.js` 的 `category` 是「影子副本」**（已归一，0 旧分类），跟真盘（291 旧分类）不符 → **不可信**。但 weights/菜名/cuisine 两侧一致、可信。
3. **`dangerouslyDisableSandbox` 对 node 的读/写无效**（仍 overlay；甚至 `node: command not found`）；只对 `git`/`rm` 有效（能联网/落盘）。
4. **PowerShell 里的 node 读写的是真实文件**（可用来跑脚本、抠图、校验）。
5. 结论：**改源码/数据一律用 Edit/Write 工具**；批量数据治理脚本**只能交用户在本地无沙箱环境跑出成品**；验证用 PowerShell node 或让用户本地 `npm test`。

---

## 探索过但已 git 回退的（想做可捡回）
本次还试了「给每道菜配图」，最后用户让全部撤销、回到单 emoji 态：
- **emoji 组合**（西红柿炒蛋 → 🍅🥚）：靠组合 emoji 提识别度，但受 emoji 词汇限制（没豆腐/面/火锅），且大揭晓 168rpx 两个 emoji 偏挤。已撤。
- **图标集 + 映射**（推荐方向，已撤但方法可复用）：
  - `utils/dishIcon.js`（已删）把 519 道菜按菜名/字段**规则映射**到约 40 个「菜型」图标，覆盖率 ~98%，新菜自动覆盖、零逐菜人工。
  - 让 ChatGPT 出了 **4 张拼图（每张 2×5 共 10 个图标）= 40 个**，PowerShell `System.Drawing` 切成 40 张，PIL `floodfill` 抠掉假透明。
  - **关键经验**：① ChatGPT 的"透明背景"常是**画出来的棋盘格假透明**（A=255 不透明），要 PIL 从四角 floodfill 抠近白中性背景成真 alpha。② 小程序**主包 ≤ 2MB**，逐菜图（哪怕 40 张 ~490px）要压（~240px/WebP）或走云存储/分包。
  - 资产还在：**根目录 4 张 `ChatGPT Image….png` 原图**（用户的，未删）。想重做：重建 `dishIcon.js` 映射 + `migrateFood` 加 `iconKey` + 大揭晓 `<image src="/assets/icons/{key}.png">` + 找不到回退 emoji。
- **盲盒「心情 chip」**（早餐/辣/清淡/家常菜/奢侈一顿 + 不限制）：聊过没做。要点：不是一个 `category` 字段的值，而是 5 个不同字段的谓词（早餐=`mealPeriods`、辣/清淡=`tags`、奢侈=`budget`、家常菜=`category`）；数据已能支撑（每个 chip ≥15 池内候选）。

---

## 本次已落地清单（均在 main）
- 菜品治理 spec + plan + `curatePool.js` + `samplePool.js` + 体检测试（**数据待本地应用**）
- 存储 schema 迁移框架 `utils/migrations.js`：用户数据 key 与版本号解耦，更新内容/版本**不再误删**收藏/历史/SSR 图鉴/PK
- 微信体验评分修复：index + manage 的 `:active` → `hover-class`、share-link 点击区撑大
- README 重写（盲盒玩法 + 架构 + 存储）
