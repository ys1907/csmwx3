# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目

「到底吃点啥 · 情侣版」—— 一款帮情侣 / 朋友决定吃什么的原生微信小程序。基于原生微信框架
（WXML / WXSS / JavaScript）开发，无第三方依赖，无后端。所有用户数据通过 `wx.setStorage`
保存在设备本地。

## 命令

- **运行单元测试：** `npm test`（执行 `node --test utils/*.test.js`，需要 Node >= 18）
- **运行单个测试文件：** `node --test utils/foodLogic.test.js`
- **开发 / 预览：** 用微信开发者工具打开仓库根目录 → 导入项目 → 填入 AppID（或用测试号）
  → 编译。没有命令行的 build / lint 步骤。

测试使用内置的 `node:test` 运行器，只覆盖 `utils/` 中与框架无关的逻辑 —— 页面代码
（`pages/`）依赖 `wx` / `Page` 运行时，无法做单元测试。

## 架构

核心设计原则：**纯业务逻辑与微信运行时隔离，以便单元测试。** 新增决策 / 推荐逻辑时，
请放进 `utils/foodLogic.js`（纯函数、不依赖 `wx`、接受可注入的 `rng` 以做确定性测试），
而不是写在页面里。

分层：

- **`utils/foodLogic.js`** —— 纯决策引擎，全app的核心。筛选（`filterFoods`）、加权推荐
  （`foodWeight` / `weightedPick` —— 偏好只对随机结果做*温和加权*，绝不把任何选项清零，
  另有 10% ε-greedy 探索）、带保底的抽卡稀有度（`rollRarityWithPity` —— 纯演出层，与选菜
  解耦）、场景/标签匹配（`matchesScene` / `availabilityLevel` / `foodHasTag`，词表已全库
  统一、按字面比较，见下文）、带回退的过滤（`filterFoodsWithFallback`，降级顺序是行为契约）、
  口味画像（`buildTasteProfile`）、可解释推荐（`buildRichReason`）、决策连胜
  （`computeStreak`）、一桌好菜组合（`buildMealCombo`）。所有随机都经由可注入的 `rng`
  参数；时间相关逻辑接受可注入的 `now`（经 `ctx.now`）。
- **`utils/util.js`** —— `uid`、`shuffleArray`（Fisher–Yates，可注入 rng）、`formatDate`
  （手写实现 —— `toLocaleDateString` 在部分小程序运行时不稳定）、`migrateFood`
  （把食物记录归一化为当前结构并补默认值 —— 新增菜品字段必须在这里加默认值）。
- **`utils/storage.js`** —— `safeGet` / `safeSet` 用 try/catch 包装 `wx.*StorageSync`，
  让配额超限时弹 toast 而非中断业务流程。读写存储一律走这两个函数，不要直接用
  `wx.*StorageSync`。
- **`utils/migrations.js`** —— 存储 schema 迁移框架（`SCHEMA_VERSION` + 增量 `MIGRATIONS`），
  在 `app.js#onLaunch` 同步执行、先于任何页面读存储。要改用户数据的结构 / key：bump
  `SCHEMA_VERSION` 并追加一条迁移。
- **`data/options.js`** —— 共享常量的唯一来源：`STORAGE_KEYS`、`FOODS_SEED_VERSION`、
  `APP_VERSION`（仅作导出 payload 的格式标记 —— 绝不进 storage key）以及各选项列表
  （`SCENE_OPTIONS`、`BUDGET_OPTIONS`、`TASTE_OPTIONS` 等）。两个页面都从这里 import ——
  不要在页面里重复定义这些常量。
- **`data/foods.js`** —— 内置 519 条的菜品数据库（治理后的富 schema：
  `scenes`/`availability`/`mealPeriods`/`defaultPoolWeight`/`enabled` 等）。`data/sounds.js`
  存放 base64 内嵌的揭晓音效。
- **`pages/index/`** —— 核心玩法：盲盒揭晓（R/SR/SSR 稀有度 + SSR 图鉴）、凑一桌、筛选
  Sheet、「我的」tab（画像/连胜/历史/收藏）、分享卡片。这是把 `foodLogic` 接到 UI 上的
  编排层。
- **`pages/manage/`** —— 增删改菜品的 CRUD 页面；通过 `foodsRev` 存储 key 与首页同步
  （无事件总线 —— 首页在 `onShow` 重读）。

### 数据 / 存储约定

- 存储键**稳定且不带版本号**（`wtec_foods`、`wtec_history` 等），`APP_VERSION` 绝不出现在
  key 里。存在两个正交的版本闸门：`FOODS_SEED_VERSION`（bump → 下次启动从 `data/foods.js`
  重播种菜品库，用户数据不受影响）与 `utils/migrations.js` 的 `SCHEMA_VERSION`（bump +
  加迁移 → 原地迁移用户数据）。每条加载的菜品都会过一遍 `migrateFood`。
- 完整菜品集与筛选缓存保存在**页面实例属性**（`this._foods` 等）上，而非 `data` 里，以避免
  每次 `setData` 都把大数组跨渲染层序列化。
- 加权推荐用的用户偏好在 `index.js#buildPrefs()` 里实时由收藏 + 历史推导
  （`favoriteSet`、`tasteCounts`、会话内的 `rejectedSet`），再喂给 `foodLogic`。

### 词表统一

全库单一词表：UI 选项、菜品 `scenes`/`tags`、`availability` 的 key 用同一套措辞
（外卖/堂食/自己做/公司食堂；肉/素/脆/热）。归一发生在两处：`scripts/normalizeVocab.js`
一次性落盘 + `utils/util.js#migrateFood` 在数据入口兜底（旧版导出备份再导入也会被归一，
且保证 `scenes` 非空——它是场景匹配的唯一权威）。引擎层（`matchesScene`/`foodHasTag`）
按字面比较，没有别名桥。新增词表取值时同步三处：选项数组、数据本身、（如出现新旧措辞）
`migrateFood` 的 `LEGACY_SCENE_MAP`/`LEGACY_TAG_MAP`。

### 揭晓动画时长

`pages/index/index.js` 里的 `REVEAL_DURATION` 必须与 `pages/index/index.wxss` 中对应
`@keyframes` 的总时长保持一致（R/SR/SSR 三档）。
