# 设计：存储 schema 迁移框架（用户数据 key 与版本解耦）

- 日期：2026-06-03
- 状态：设计已确认（待用户复审本文档）
- 范围：`data/options.js`（稳定 key）+ `utils/storage.js`（`safeRemove`）+ `utils/migrations.js`（新增迁移框架）+ `app.js`（`onLaunch` 调用）+ `utils/migrations.test.js`（测试）+ `pages/index/index.js`（删无用 `APP_VERSION` import）。纯 wx 本地存储，无后端。
- 前置：本分支已加 `FOODS_SEED_VERSION` 把"foods 重播种"与 `APP_VERSION` 解耦。

## 背景

`STORAGE_KEYS` 把 `foods/history/favorites/pkData/cooldownFamilyPicks/ssrPity/ssrCollection` 全挂 `APP_VERSION` 后缀（`options.js`）。后果：一旦为任何原因 bump `APP_VERSION`，这些 key 全变、用户的收藏/历史/SSR 图鉴/PK 战绩**整体丢失**。这是 footgun——`APP_VERSION` 名字上就是"该 bump 的版本"，却连着用户数据。小程序**尚未上线**，无存量生产用户（仅开发者自测数据）。

## 目标 / 非目标

**目标**
- 用户数据 key 与版本号**彻底解耦**（稳定 key）→ 任何版本变更都不误删用户数据。
- 建立**显式 schema 迁移框架**：未来数据结构变更靠迁移函数，而非"改 key = 清空"。
- 厘清三套版本机制各管一段，互不串味。

**非目标（YAGNI）**
- 不改 foods 内容重播种机制（`FOODS_SEED_VERSION` 保留）。
- 只建框架 + 处理当前过渡的 v1 迁移，**不预写**未来迁移。
- 不引入后端、不改 UI。

---

## 一、稳定 key（`data/options.js`）

`STORAGE_KEYS` 去掉 `+ APP_VERSION`：

| 字段 | 旧 | 新（稳定） |
|---|---|---|
| foods | `wtec_foods_v3` | `wtec_foods` |
| history | `wtec_history_v3` | `wtec_history` |
| favorites | `wtec_fav_v3` | `wtec_fav` |
| pkData | `wtec_pk_v3` | `wtec_pk` |
| cooldownFamilyPicks | `wtec_cooldown_fam_v3` | `wtec_cooldown_fam` |
| ssrPity | `wtec_ssr_pity_v3` | `wtec_ssr_pity` |
| ssrCollection | `wtec_ssr_dex_v3` | `wtec_ssr_dex` |

`localVersion/foodsRev/weekFood/weekFoodDate` 本就稳定，不动。新增 `schemaVersion: 'wtec_schema_version'`。

`APP_VERSION` 保留但加注释「**仅作导出格式标记（manage 导出 payload.version），绝不进任何 storage key**」。`pages/index/index.js` 解构里的 `APP_VERSION` 去版本号后已无用 → 删除该 import；`manage.js` 仍用于导出 payload → 保留。

## 二、`utils/storage.js` 加 `safeRemove`

```js
function safeRemove(key) {
  try { wx.removeStorageSync(key); return true }
  catch (e) { console.error('[storage] removeStorageSync failed:', key, e); return false }
}
```
并入 `module.exports`。供迁移清理旧 key。

## 三、迁移框架 `utils/migrations.js`（纯逻辑，store 可注入，可单测）

```js
const { safeGet, safeSet, safeRemove } = require('./storage.js')

const SCHEMA_VERSION = 1
const SCHEMA_KEY = 'wtec_schema_version'

const MIGRATIONS = [
  { v: 1, run: (s) => {  // v0→v1：旧 _v3 用户数据搬到稳定 key（见第四节）
    const pairs = [
      ['wtec_history_v3', 'wtec_history'], ['wtec_fav_v3', 'wtec_fav'], ['wtec_pk_v3', 'wtec_pk'],
      ['wtec_cooldown_fam_v3', 'wtec_cooldown_fam'], ['wtec_ssr_pity_v3', 'wtec_ssr_pity'], ['wtec_ssr_dex_v3', 'wtec_ssr_dex'],
    ]
    for (const [o, n] of pairs) {
      const ov = s.get(o, undefined)
      if (ov !== undefined && s.get(n, undefined) === undefined) s.set(n, ov)
      s.remove(o)
    }
    s.remove('wtec_foods_v3') // foods 不搬：由 FOODS_SEED_VERSION 重播种
  } },
]

const defaultStore = { get: safeGet, set: safeSet, remove: safeRemove }

function runMigrations(store) {
  const s = store || defaultStore
  const from = s.get(SCHEMA_KEY, 0)
  if (from >= SCHEMA_VERSION) return { migrated: false, from, to: from }
  for (const m of MIGRATIONS) if (m.v > from) m.run(s)
  s.set(SCHEMA_KEY, SCHEMA_VERSION)
  return { migrated: true, from, to: SCHEMA_VERSION }
}

module.exports = { SCHEMA_VERSION, runMigrations }
```
**幂等**：跑过一次后 `schema_version=1`，再启动直接 return。`store` 注入便于测试（默认走 storage.js）。

## 四、v1 迁移规则

- 搬 **6 个用户数据 key**（history/favorites/pkData/cooldownFamilyPicks/ssrPity/ssrCollection）：旧 `_v3` → 稳定 key，**仅当新 key 为空**（不覆盖），搬完删旧 key。
- **foods 不搬**：它经 `FOODS_SEED_VERSION` 闸门从 `data/foods.js` 重播种（用户已接受自定义菜重置）；仅删旧 `wtec_foods_v3`。
- 新装用户（无任何旧 key）：搬/删都是 no-op，只置 `schema_version=1`。

## 五、调用点 `app.js onLaunch`

```js
const { runMigrations } = require('./utils/migrations.js')
App({
  onLaunch() {
    runMigrations() // 必须先于任何页面 onLoad 读数据；onLaunch 同步、保证时序
    console.log('到底吃点啥 · 情侣版 启动')
  },
  // onShow / onHide 不变
})
```
WeChat 生命周期保证 `App.onLaunch` 在首个 `Page.onLoad` 之前同步完成 → 页面读到的已是迁移后数据。

## 六、三套版本机制正交（务必别混）

| 机制 | 粒度 | 触发 | 职责 |
|---|---|---|---|
| `migrateFood`（util.js） | **记录级** | 每次加载每条食物 | 补单条字段默认/归一分类 |
| `FOODS_SEED_VERSION`（options） | **内容级** | bump 后 localVersion 不匹配 | 从 data/foods.js 重播种菜品库 |
| `runMigrations`（migrations.js） | **schema/key 级** | bump SCHEMA_VERSION | 跨版本搬/改用户数据 |

`APP_VERSION` 不再属于上面任何一套——退化为导出格式标记。

## 七、测试 `utils/migrations.test.js`

用注入的内存 store（JS 对象支持 get/set/remove）覆盖：
1. **空数据**：无任何 key → `runMigrations` 返回 `{migrated:true,from:0,to:1}`，`schema_version=1`，不报错。
2. **有 _v3 旧数据**：预置 `wtec_fav_v3` 等 → 跑后新 key（`wtec_fav`…）拿到旧值、旧 key 被删、`schema_version=1`。
3. **已迁移**：预置 `schema_version=1` → no-op（`{migrated:false}`），不动数据。
4. **新 key 已有数据**：同时存在 `wtec_fav_v3` 和 `wtec_fav` → 不覆盖新 key（旧值丢弃），旧 key 仍删。

## 八、验证

- 本地 `npm test` 全绿（新增 migrations 测试 + 原 65 + 菜品体检）。
- 微信开发者工具：自测的旧 `_v3` 收藏/图鉴在新 key 下仍在；`wtec_schema_version=1`。
- 反复 bump `APP_VERSION`（模拟）不再影响任何用户数据。

## 九、风险 / 权衡

- 选 B（迁移框架）而非 A（仅稳定 key）：用户明确要长期稳健，框架为未来 schema 变更铺路。代价是多一个小模块——但纯逻辑、可单测，契合项目风格。
- `onLaunch` 同步执行迁移，数据量小（几个 key）开销可忽略。
- 旧 key 搬完即删；万一迁移逻辑有误，`safeRemove` 已 try/catch 不致崩溃，且 v1 仅搬不改结构、风险低。
