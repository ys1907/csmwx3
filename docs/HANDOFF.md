# 交接文档（给下一位 AI）

> 日期：**2026-06-10** · 本文是当前权威交接。架构与编码约定以 **`CLAUDE.zh.md`** 为准（持续维护）；
> 历史决策看 `git log`（commit message 写得很全）。根目录 `食谱AI修改提示词.md` 是 2026-06-03 的
> 历史快照（未入 git），其中数据/版本描述已全部过时，仅剩"被撤销的菜品配图方案"背景价值。

## 一、项目是什么

「到底该吃啥」——原生微信小程序（WXML/WXSS/JS），**无后端、无第三方依赖**，数据全在本地
`wx.setStorage`。唯一主玩法是**盲盒抽菜**（R/SR/SSR 稀有度 + 25 抽硬保底 + SSR 图鉴），辅以凑一桌、
筛选、「我的」tab（画像/连胜/收藏/历史）、分享卡片。两个页面：`pages/index`（玩法）、`pages/manage`（菜品 CRUD）。

- 跑测试：`npm test`（`node --test utils/*.test.js`，Node ≥ 18）。当前 **99 用例全绿**。
- 预览：微信开发者工具导入仓库根目录。

## 二、现状速览（2026-06-10 收工时点）

- **菜品库 v7**：517 道（池内 425），经"推倒级"全库重审——3 人设（家庭主妇/小情侣/美食编辑）巡库
  → 终审裁决 → 26 批逐道校正 → 抽检防误杀。删 42 道猎奇/异国/重复、出池 56、校正 453 道的
  价格/辣度/场景、新增 40 道国民菜。**裁决全文留档 `scripts/rebuild_verdict.json`**（每条带理由，可翻案）。
- **词表已全库统一**：UI 选项、菜品 scenes/tags、availability key 同一套措辞，引擎按字面比较；
  归一防线在 `migrateFood`（含"高可得补标"），详见 CLAUDE.zh.md「词表统一」节。
- **抽样验证**：2000 次盲盒抽样，异国占比 0.0%，家常菜 32% + 饭类 21% + 面食 13.5%。
- **包体**：`data/foods.js` ~520KB（治理元数据已剥离到 `scripts/foods.meta.json`，不进包）。
- **存储**：key 稳定无版本号；菜品重播种闸门 `FOODS_SEED_VERSION='v7'`（重播种经 `mergeSeedWithLocal`
  **保留用户自建菜**）；用户数据结构变更走 `utils/migrations.js`（SCHEMA_VERSION=2）。

## 三、近期完成的大块工作（细节见 git log）

1. 全库审查修复 33 项实锤（暗黑模式激活、冷却/保底持久化、导入导出治理、safe-area 等）。
2. 重构三件套：`utils/foodRepo.js`（菜品库读写单点）、`filterFoodsWithFallback`+`inferMealPeriod`
   下沉纯逻辑层补测试、词表归一删桥接层。每轮都过多 agent 对抗审查（抓到并修复了 4 个回归）。
3. 菜品数据治理链：`scripts/dedupeFoods.js`（同名去重）→ `slimFoods.js`（元数据剥离）→
   `normalizeVocab.js`（词表归一）→ `applyRebuild.js`（全库重审应用）。全部幂等、支持 `--dry`。

## 四、关键约定与坑（务必读）

- **改菜品数据**：写幂等脚本放 `scripts/`（参考 applyRebuild.js 范式：--dry / 备份 / 不变量自检），
  **用 PowerShell 工具跑 node**（此路径落真实盘零失败；Bash 跑 node 可能落 overlay，先探针）。
  改完 bump `FOODS_SEED_VERSION` 才触达老用户。
- **英文 CLAUDE.md 已过时且被锁**：用户装的 ARS 插件 hook 拦截任何 agent 写 CLAUDE.md，
  以 CLAUDE.zh.md 为准；要同步英文版需用户禁用 hook 或手动改。
- **纯逻辑进 `utils/foodLogic.js`**，rng/now 可注入，先写 node:test 用例。
- **大数组放页面实例属性**（`this._foods`）不进 data；存储一律走 safeGet/safeSet；
  菜品库读写一律走 `utils/foodRepo.js`。
- 打包排除走 `project.config.json` 的 packOptions.ignore（与 .gitignore 互不相干，主包 2MB 硬上限）。
- 提交前看一眼 `git status`：子 agent 偶尔留下 `%TEMP%xxx` 字面路径垃圾文件，别被 `git add -A` 带进去。

## 五、待办 / 可选下一步

- 英文 CLAUDE.md 手动同步（内容照 CLAUDE.zh.md 翻即可）。
- 重构建议清单第二三梯队未做（经评审团筛过的 18 条中剩余部分）：`utils/backup.js` 抽导入导出纯函数
  → manage 页集成测试（最大测试盲区）、bottom-sheet 自定义组件统一 4 处弹层、`utils/theme.js`、
  分享卡片纯绘制抽离、foodWeight 三段式、WXSS 颜色收编、pkData 死键回收等——详见会话记录或重新评估。
- 远程旧分支 `origin/docs/add-readme`、`origin/feat/dish-reasonableness` 可删（破坏性，需用户确认）。
- 避雷选项「健康/糯」在数据里命中极少、`MEAL_ROLE_OPTIONS` 词表无人引用——留着无害，可顺手清。
