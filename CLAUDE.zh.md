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

- **`utils/foodLogic.js`** —— 纯决策引擎，全app的核心。筛选（`filterFoods`）、8 扇区转盘
  数学（`buildWheelPool` / `resolveWheelWinner` / `angleForWinner`）、加权推荐
  （`foodWeight` / `weightedPick` —— 偏好只对随机结果做*温和加权*，绝不把任何选项清零）、
  口味画像（`buildTasteProfile`）、可解释推荐（`explainPick`）、决策连胜（`computeStreak`）、
  一桌好菜组合（`buildMealCombo`）。所有随机都经由可注入的 `rng` 参数。
- **`utils/util.js`** —— `uid`、`shuffleArray`（Fisher–Yates，可注入 rng）、`formatDate`
  （手写实现 —— `toLocaleDateString` 在部分小程序运行时不稳定）、`migrateFood`
  （把食物记录归一化为当前结构并补默认值）。
- **`utils/storage.js`** —— `safeGet` / `safeSet` 用 try/catch 包装 `wx.*StorageSync`，
  让配额超限时弹 toast 而非中断业务流程。读写存储一律走这两个函数，不要直接用
  `wx.*StorageSync`。
- **`data/options.js`** —— 共享常量的唯一来源：`STORAGE_KEYS`、`APP_VERSION` 以及所有
  选项列表（`SCENE_OPTIONS`、`BUDGET_OPTIONS`、`TASTE_OPTIONS`、`WEEK_THEMES`、
  `WEEK_THEME_TAGS` 等）。两个页面都从这里 import —— 不要在页面里重复定义这些常量。
- **`data/foods.js`** —— 内置约 500 条的菜品数据库（记录数组：
  `name/emoji/category/scene/budget/time/tags/_id`）。`data/sounds.js` 存放 base64 内嵌的
  转盘 tick / 揭晓音效。
- **`pages/index/`** —— 全部核心玩法（转盘、塔罗、默契 PK、盲盒、每周推荐）。这是把
  `foodLogic` 接到 UI 上的大型编排层。
- **`pages/manage/`** —— 增删改菜品的 CRUD 页面。

### 数据 / 存储约定

- 存储键带 `APP_VERSION`（当前为 `v3`）版本前缀，如 `wtec_foods_v3`。仅当
  `localVersion === APP_VERSION` 时才从本地存储加载菜品，否则从 `data/foods.js` 重新播种。
  每条加载的菜品都会过一遍 `migrateFood`，因此修改菜品结构时需要同步更新 `migrateFood`，
  并（通常）提升 `APP_VERSION`。
- 完整菜品集与筛选缓存保存在**页面实例属性**（`this._foods` 等）上，而非 `data` 里，以避免
  每次 `setData` 都把大数组跨渲染层序列化。
- 加权推荐用的用户偏好在 `index.js#buildPrefs()` 里实时由收藏 + 历史推导
  （`favoriteSet`、`tasteCounts`、会话内的 `rejectedSet`），再喂给 `foodLogic`。

### 转盘不变量

转盘固定 8 个 45° 扇区。核心不变量（见 `angleForWinner`）：
`(winnerIdx * SECTOR_DEG + SECTOR_OFFSET + angleForWinner(winnerIdx)) % 360 === 0`。
先选出中奖扇区，再算出让它停到指针正下方的目标角度。改动转盘时，请保持该不变量及其测试通过。
