# 到底该吃啥 🍽️

帮情侣 / 朋友解决「今天到底吃什么」这个世纪难题的微信小程序。一键开**吃饭盲盒**，抽今天这一餐，带抽卡般的三档揭晓仪式感。

> **原生微信小程序，无后端、无第三方依赖，所有数据存在本机。**

## ✨ 功能特性

- **🎁 吃饭盲盒** —— 轻触盒子揭晓今天吃什么。加权推荐：偏好只「加权」不「排除」，越爱吃的越容易抽到；还接入了季节弱信号（天热偏清爽、降温偏热乎）。
- **✨ 三档揭晓 + 保底** —— R / SR / SSR 三档稀有度揭晓动画（温柔升起 / 凝光 / 殿堂级彩虹光效）。内置保底抽卡：连续没出 SSR 概率递增、累计若干抽必出。
- **📖 SSR 图鉴** —— 抽到的 SSR 自动入册，在「我的」页彩虹卡片墙收藏展示。
- **🍱 凑一桌** —— 两个人？自动搭配不同品类，帮你们凑齐不重样的一桌。
- **📊 口味画像 & 决策连胜** —— 把历史决策沉淀成「你最近最爱 X 类」的洞察，并记录连续决策天数。
- **🍳 菜品管理** —— 自由增删改菜品，按分类 / 场景 / 预算 / 时间 / 口味维度管理，支持数据导入导出。

## 🧱 技术栈 & 架构

- 原生微信小程序框架（WXML / WXSS / JavaScript），**无第三方依赖、无后端**。
- 核心设计原则：**纯决策逻辑与 `wx` 运行时隔离，可单测**。所有随机都走可注入的 `rng`，便于写确定性测试。

| 模块 | 职责 |
|---|---|
| `utils/foodLogic.js` | 纯决策引擎：`filterFoods` / 加权推荐 `weightedPick` / 口味画像 / 连胜 / 凑一桌 / 保底抽卡 `rollRarityWithPity` … |
| `utils/util.js` | `migrateFood`（记录归一到当前 shape）/ `uid` / 洗牌 / 日期格式化 |
| `utils/storage.js` | `safeGet` / `safeSet`：包裹 wx storage，配额超限只提示不崩 |
| `utils/migrations.js` | **存储 schema 迁移框架**：用户数据 key 与版本号解耦，小程序更新永不误删收藏 / 历史 / 图鉴 |
| `data/options.js` | 共享常量：`STORAGE_KEYS`、版本号、各选项列表 |
| `data/foods.js` | 517 道精选中式日常菜的富数据库（经多轮人设评审治理：剔除生僻/异国/猎奇/重复项、逐道校正价格/辣度/渠道、补齐国民家常菜，盲盒出菜贴近中国人日常） |

## 📂 项目结构

```
csmwx3/
├── app.js / app.json / app.wxss     # 小程序入口 / 全局配置 / 全局样式
├── pages/
│   ├── index/                       # 盲盒首页（推荐 tab + 我的 tab）
│   └── manage/                      # 菜品管理 CRUD
├── data/
│   ├── foods.js                     # 内置菜品数据库
│   ├── options.js                   # 共享常量
│   └── sounds.js                    # 音效（base64 内嵌）
├── utils/                           # 纯逻辑（foodLogic / util / storage / migrations）+ 单测
├── scripts/                         # 数据治理脚本（curatePool / samplePool 等）
├── docs/                            # 设计文档与实施计划
└── project.config.json
```

## 🚀 本地运行 & 测试

**预览**
1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 导入项目 → 目录指向本仓库根目录 → 填入自己的小程序 AppID（或选「测试号」）。
3. 点「编译」即可在模拟器预览。

**单元测试**
```bash
npm test          # = node --test utils/*.test.js（Node ≥ 18）
```
> 测试只覆盖 `utils/` 的框架无关纯逻辑；页面代码依赖 `wx`/`Page` 运行时，不做单测。

## 💾 数据存储

所有用户数据（菜品 / 历史 / 收藏 / SSR 图鉴 / PK 记录）通过 `wx.setStorage` 保存在**设备本地，不上传任何服务器**。用户数据的存储 key 已与版本号解耦，配合显式 schema 迁移框架——**更新菜品内容或 App 版本都不会清空用户数据**，需要改数据结构时走迁移函数而非清库。

## 📜 License

个人项目，仅供学习与自用。
