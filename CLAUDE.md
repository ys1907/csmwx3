# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"到底吃点啥 · 情侣版" — a native WeChat Mini Program that helps couples/friends decide what to
eat. Built with the raw WeChat framework (WXML / WXSS / JavaScript), no third-party dependencies,
no backend. All user data lives in on-device storage via `wx.setStorage`.

## Commands

- **Run unit tests:** `npm test` (runs `node --test utils/*.test.js`, requires Node >= 18)
- **Run a single test file:** `node --test utils/foodLogic.test.js`
- **Develop / preview:** Open the repo root in WeChat DevTools (微信开发者工具) → import project →
  supply an AppID (or use the test account) → 编译. There is no CLI build/lint step.

Tests use the built-in `node:test` runner and only cover the framework-independent logic in
`utils/` — page code (`pages/`) cannot be unit-tested because it depends on the `wx` / `Page`
runtime.

## Architecture

The key design principle: **pure business logic is isolated from the WeChat runtime so it can be
unit-tested.** When adding decision/recommendation logic, put it in `utils/foodLogic.js` (pure,
`wx`-free, accepts an injectable `rng` for deterministic tests) rather than in the page.

Layers:

- **`utils/foodLogic.js`** — pure decision engine, the heart of the app. Filtering
  (`filterFoods`), the 8-sector wheel math (`buildWheelPool` / `resolveWheelWinner` /
  `angleForWinner`), weighted recommendation (`foodWeight` / `weightedPick` — preferences only
  *bias* the random pick, never zero out an option), taste profiling (`buildTasteProfile`),
  explainable picks (`explainPick`), decision streaks (`computeStreak`), and meal combos
  (`buildMealCombo`). All randomness flows through an injectable `rng` param.
- **`utils/util.js`** — `uid`, `shuffleArray` (Fisher–Yates, injectable rng), `formatDate`
  (hand-rolled — `toLocaleDateString` is unreliable on some Mini Program runtimes), and
  `migrateFood` (normalizes a food record to the current shape with defaults).
- **`utils/storage.js`** — `safeGet` / `safeSet` wrap `wx.*StorageSync` in try/catch so a
  quota-exceeded error toasts instead of crashing the flow. Always read/write storage through
  these, not `wx.*StorageSync` directly.
- **`data/options.js`** — single source of truth for shared constants: `STORAGE_KEYS`,
  `APP_VERSION`, and all the option lists (`SCENE_OPTIONS`, `BUDGET_OPTIONS`, `TASTE_OPTIONS`,
  `WEEK_THEMES`, `WEEK_THEME_TAGS`, etc.). Both pages import from here — do not redefine these
  constants in a page.
- **`data/foods.js`** — the built-in ~500-item food database (array of records:
  `name/emoji/category/scene/budget/time/tags/_id`). `data/sounds.js` holds base64-embedded
  wheel tick / reveal sounds.
- **`pages/index/`** — all the core gameplay (wheel, tarot 塔罗, 默契 PK, blind box, weekly
  recommendation). This is the large orchestration layer that wires `foodLogic` to the UI.
- **`pages/manage/`** — CRUD screen for editing the food list.

### Data / storage conventions

- Storage keys are versioned with `APP_VERSION` (currently `v3`), e.g. `wtec_foods_v3`. Foods are
  only loaded from local storage when `localVersion === APP_VERSION`; otherwise the app reseeds
  from `data/foods.js`. Every loaded food is passed through `migrateFood`, so changing the food
  shape means updating `migrateFood` and (usually) bumping `APP_VERSION`.
- The full food set and filtered caches are kept as **page instance properties** (`this._foods`,
  etc.), not in `data`, to avoid serializing large arrays across the render-layer boundary on
  every `setData`.
- User preferences for weighted recommendation are derived on the fly in `index.js#buildPrefs()`
  from favorites + history (`favoriteSet`, `tasteCounts`, in-session `rejectedSet`) and fed into
  `foodLogic`.

### Wheel invariant

The wheel has 8 fixed 45° sectors. The core invariant (see `angleForWinner`):
`(winnerIdx * SECTOR_DEG + SECTOR_OFFSET + angleForWinner(winnerIdx)) % 360 === 0`. The winner is
chosen first, then the stop angle is computed so that sector lands under the pointer. If you touch
the wheel, keep this invariant and its tests green.
