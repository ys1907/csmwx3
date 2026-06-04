# 项目交接 · 给下一位 AI（最新 · 2026-06-03 会话结束）

> 「到底吃点啥·情侣版」微信小程序的**当前权威交接**。给下一位 AI（或想改数据的人）。
> 本会话（菜品治理 + 存储加固 + 体验修复 + README）成果**已全部提交并在 GitHub `main`**（默认分支已设为 main）。
> 上一段（数据修复 + 盲盒重构）的更全背景见 `docs/HANDOFF.md`；项目铁律见 `CLAUDE.md`。

---

## 一句话现状
原生微信小程序（WXML/WXSS/JS，**无后端、无依赖、纯本地存储**），盲盒抽卡选菜。本会话全部成果已在 GitHub `main`，无未合并分叉。

## ✅ 本会话已落地（均在 main，已生效）
1. **菜品治理已应用**：`data/foods.js` 已 **479 → 524 道**——旧分类落盘归一（0 残留）、49 道生僻/异国/猎奇出池、462 进盲盒池、45 道新家常菜，权重按"频率 × 能否当主角"分档。体检 `utils/foods.integrity.test.js` **7/7 绿**。决策全在 `scripts/curatePool.js`（`FORCE_OFF` 出池集 / `O` 逐道定位 / `NEW_FOODS` 新增），改了它重跑即重新应用（见沙箱坑）。
2. **存储 schema 迁移框架** `utils/migrations.js`：用户数据 key 与版本号解耦 + `FOODS_SEED_VERSION` 只管 foods 重播种 → **更新内容/版本不再误删**收藏/历史/SSR 图鉴/PK。
3. **微信体验评分修复**：index + manage 的 `:active` → `hover-class`、share-link 点击区撑大。
4. **README 重写**：当前盲盒玩法 + 架构 + 存储（删了过时的转盘/塔罗/PK）。
5. **仓库整理**：默认分支从旧的 `docs/add-readme` 切到 `main`。

## 菜品数据现状（改数据前必读）
- `data/foods.js`（main）：**524 条**，每条约 24 字段，**0 旧分类**（已归一到新 12 分类）。
- 新 12 分类：`家常菜 / 饭类套餐 / 面食粉类 / 小吃点心 / 汤粥炖品 / 火锅冒菜 / 烧烤 / 日韩料理 / 西式简餐 / 甜品饮品 / 轻食 / 配菜`。`utils/util.js#migrateFood` 加载时把任何旧分类运行时归一（防御层）。
- 关键字段：`defaultPoolWeight`（0=出池，>0 进盲盒池）、`enabled`、`canBeMeal`、`mealPeriods`、`scene`/`scenes`、`budget`、`time`、`tags`、`cuisine`、`foodType`、`mealRole`。
- **首页盲盒只抽 `defaultPoolWeight>0 && enabled!==false`**（`pages/index/index.js#getFilteredFoods`）。
- 治理标准/权重体系：`docs/superpowers/specs/2026-06-02-dish-reasonableness-design.md`；存储设计：`…/2026-06-03-storage-migration-design.md`。

## 怎么改菜品数据
- **小批量**：直接 Edit/Write 改 `data/foods.js`。
- **批量**：改 `scripts/curatePool.js` 决策表后重跑（**用 PowerShell 跑 node**，见下），再提交。改完保证 `migrateFood` 兼容、`npm test` 绿。

---

## ⚠️ 沙箱坑（本环境特有，本会话反复踩，务必照做）
- **Bash 工具的 node 读/写 = overlay 影子副本**，与真实 OS 文件不一致；文件被 PowerShell 改过后，连 Bash 的 `grep`/`git` 也可能看到**陈旧视图**（本会话 Bash grep 报 118 旧分类、真盘其实 0）。`dangerouslyDisableSandbox` 对 node 读写无效（甚至 `node: command not found`）。
- **PowerShell 工具的 node / python / git = 真实 OS**。✅ **要把数据脚本落到真盘：用 PowerShell 跑 `node scripts/curatePool.js`，并用 PowerShell 的 git 提交**（它 staged 的是真实文件）。本会话就是这样把治理落盘 + 提交成功的。
- **核实"真正提交了什么"**：`git show HEAD:<file>` 用 **Python 按 UTF-8 解码**读（PowerShell 控制台是 GBK，直接 print 中文/emoji 会报错，但 `in`/长度/数字判断可信）。
- 改源码（wxml/wxss/js）用 Edit/Write 工具即可（落真盘、Bash git 也能提交）；只有"node 跑脚本改数据文件"才必须走 PowerShell。
- `gh` CLI 可用、已登录 `ys1907`（repo 权限），改仓库设置用 `gh repo edit`。
- ⚠️ 删远程分支等**破坏性 git 操作会被安全策略拦**，需用户明确授权。

---

## 探索过、但用户让撤销了的（资产/方法还在，想做可捡回）
本会话试过"给每道菜配图"，最后**全部 git 回退到单 emoji 态**：
- ① **emoji 组合**（🍅🥚）：受 emoji 词汇限制（没豆腐/面/火锅）+ 大揭晓 168rpx 两个偏挤。
- ② **图标集 + 映射（推荐方向）**：`utils/dishIcon.js`（已删）按菜名/字段规则把 519 菜映射到 ~40 个"菜型"图标，~98% 覆盖、新菜自动。ChatGPT 出 4 张 2×5 拼图=40 图标，PowerShell `System.Drawing` 切图 + PIL `floodfill` 抠假透明。
- 经验：ChatGPT 的"透明"常是**画出来的棋盘格假透明**（A=255，要 PIL 抠）；小程序**主包 ≤ 2MB**，逐菜图要压/WebP/云存储或分包。
- 资产：**根目录 4 张 `ChatGPT Image….png`**（用户的，未跟踪未删）。重做路径：重建 `dishIcon.js` + `migrateFood` 加 `iconKey` + 大揭晓 `<image src="/assets/icons/{key}.png">` 找不到回退 emoji。
- **盲盒「心情 chip」**（早餐/辣/清淡/家常菜/奢侈一顿 + 不限制）：聊过没做。要点：不是一个 `category` 字段值，而是 5 个不同字段的谓词（早餐=`mealPeriods`、辣/清淡=`tags`、奢侈=`budget`、家常菜=`category`）；数据已支撑（每 chip ≥15 池内候选）。

---

## 📋 给下一位 AI：可选待办
- **清理 2 个旧分支**（需用户授权删）：`docs/add-readme`（旧默认分支）、`feat/dish-reasonableness`（已合并 main）。
- **根目录 4 张 ChatGPT 大图**：gitignore 或删（8MB，没进仓库）。
- 想做配图 → 见上"图标集 + 映射"路线。
- ⚠️ `CLAUDE.md` 里写的"8 扇区转盘"是早期玩法，现 UI 已是盲盒；`foodLogic.js` 的 wheel 函数仍在但未用——别被误导去维护转盘。
