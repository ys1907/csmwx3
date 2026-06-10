// 本地存储 schema 迁移框架。
// 与 migrateFood（记录级）、FOODS_SEED_VERSION（菜品内容重播种）正交：本模块只管
// 「跨 schema 版本搬/改用户数据」。bump SCHEMA_VERSION + 加一条 MIGRATIONS 即可，框架自动只跑新增那条。
// store 可注入（默认走 storage.js），便于单测。
const { safeGet, safeSet, safeRemove } = require('./storage.js')

const SCHEMA_VERSION = 2
const SCHEMA_KEY = 'wtec_schema_version'

const MIGRATIONS = [
  {
    v: 1, // v0→v1：用户数据 key 去版本号。把旧 wtec_*_v3 用户数据搬到稳定 key。
    run: (s) => {
      const pairs = [
        ['wtec_history_v3', 'wtec_history'],
        ['wtec_fav_v3', 'wtec_fav'],
        ['wtec_pk_v3', 'wtec_pk'],
        ['wtec_cooldown_fam_v3', 'wtec_cooldown_fam'],
        ['wtec_ssr_pity_v3', 'wtec_ssr_pity'],
        ['wtec_ssr_dex_v3', 'wtec_ssr_dex'],
      ]
      for (const [o, n] of pairs) {
        const ov = s.get(o, undefined)
        if (ov !== undefined && s.get(n, undefined) === undefined) s.set(n, ov)
        s.remove(o)
      }
      s.remove('wtec_foods_v3') // foods 不搬：由 FOODS_SEED_VERSION 从 data/foods.js 重播种
    },
  },
  {
    v: 2, // v1→v2：清理「每周推荐」玩法（已下线）留下的孤儿 key
    run: (s) => {
      s.remove('wtec_week_food')
      s.remove('wtec_week_food_date')
    },
  },
]

const defaultStore = { get: safeGet, set: safeSet, remove: safeRemove }

// 幂等：schema_version 已是最新则直接 return。必须在任何页面 onLoad 读数据前调用（app.js onLaunch）。
function runMigrations(store) {
  const s = store || defaultStore
  const from = s.get(SCHEMA_KEY, 0)
  if (from >= SCHEMA_VERSION) return { migrated: false, from, to: from }
  for (const m of MIGRATIONS) if (m.v > from) m.run(s)
  s.set(SCHEMA_KEY, SCHEMA_VERSION)
  return { migrated: true, from, to: SCHEMA_VERSION }
}

module.exports = { SCHEMA_VERSION, runMigrations }
