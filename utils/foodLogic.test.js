const test = require('node:test')
const assert = require('node:assert')
const {
  filterFoods, filterFoodsWithFallback, inferMealPeriod,
  matchesScene, availabilityLevel, foodHasTag,
  foodWeight, weightedPick, weightedPickIndex, buildTasteProfile,
  computeStreak, buildMealCombo,
  buildRichReason, inferSeason, rollRarityWithPity
} = require('./foodLogic.js')

const FOODS = [
  { name: '红烧肉', category: '家常菜', scene: '自己做', budget: '💰💰', time: '快', tags: ['肉', '甜'] },
  { name: '麻辣烫', category: '火锅冒菜', scene: '外卖', budget: '💰💰', time: '快', tags: ['辣', '热'] },
  { name: '白灼菜心', category: '家常菜', scene: '自己做', budget: '💰💰', time: '快', tags: ['素', '清淡'] },
]
const NO_FILTER = { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, avoid: '' }

test('filterFoods: 无筛选返回全集', () => {
  const r = filterFoods(FOODS, NO_FILTER, { excludeRecent: false })
  assert.strictEqual(r.length, 3)
})

test('filterFoods: 场景维度精确过滤', () => {
  const r = filterFoods(FOODS, { ...NO_FILTER, sceneIdx: 1 }, { excludeRecent: false }) // 外卖
  assert.deepStrictEqual(r.map(f => f.name), ['麻辣烫'])
})

test('filterFoods: 预算/时间维度', () => {
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, budgetIdx: 2 }, {}).length, 3) // 💰💰
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, timeIdx: 2 }, {}).length, 0)   // 慢
})

test('filterFoods: avoid 支持中英逗号与空格分隔', () => {
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, avoid: '辣' }, {}).length, 2)
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, avoid: '辣，素' }, {}).length, 1)
  assert.strictEqual(filterFoods(FOODS, { ...NO_FILTER, avoid: '辣 素' }, {}).length, 1)
})

test('filterFoods: excludeRecent 仅排除 3 天内、跳过非法日期', () => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const recent = [{ name: '红烧肉', date: new Date(now - day).toISOString() }]
  assert.strictEqual(filterFoods(FOODS, NO_FILTER, { excludeRecent: true, history: recent, now }).length, 2)

  const stale = [{ name: '红烧肉', date: new Date(now - 4 * day).toISOString() }]
  assert.strictEqual(filterFoods(FOODS, NO_FILTER, { excludeRecent: true, history: stale, now }).length, 3)

  const bad = [{ name: '红烧肉', date: 'not-a-date' }]
  assert.strictEqual(filterFoods(FOODS, NO_FILTER, { excludeRecent: true, history: bad, now }).length, 3)
})

test('filterFoods: 组合条件可得空集', () => {
  const r = filterFoods(FOODS, { sceneIdx: 1, budgetIdx: 0, timeIdx: 0, avoid: '辣' }, {})
  assert.strictEqual(r.length, 0)
})

test('filterFoods: 口味维度按 tags 过滤', () => {
  // TASTE_OPTIONS = ['全部口味', '辣', '甜', '酸', '鲜']
  const spicy = filterFoods(FOODS, { ...NO_FILTER, tasteIdx: 1 }, { excludeRecent: false })
  assert.deepStrictEqual(spicy.map(f => f.name), ['麻辣烫'])
  const sweet = filterFoods(FOODS, { ...NO_FILTER, tasteIdx: 2 }, { excludeRecent: false })
  assert.deepStrictEqual(sweet.map(f => f.name), ['红烧肉'])
})

// ===== 场景词表对齐（scene / scenes / availability 三套措辞的桥接） =====

test('matchesScene: scenes 数组优先，「到店吃」算「堂食」、「食堂」算「公司食堂」', () => {
  const food = { scene: '外卖', scenes: ['外卖', '到店吃', '食堂'] }
  assert.strictEqual(matchesScene(food, '堂食'), true)      // 到店吃 → 堂食
  assert.strictEqual(matchesScene(food, '公司食堂'), true)  // 食堂 → 公司食堂
  assert.strictEqual(matchesScene(food, '外卖'), true)
  assert.strictEqual(matchesScene(food, '自己做'), false)
})

test('matchesScene: 无 scenes 数组时回退顶层 scene', () => {
  assert.strictEqual(matchesScene({ scene: '堂食' }, '堂食'), true)
  assert.strictEqual(matchesScene({ scene: '堂食', scenes: [] }, '堂食'), true)
  assert.strictEqual(matchesScene({ scene: '自己做' }, '外卖'), false)
})

test('filterFoods: 场景过滤经词表桥接，公司食堂可命中 scenes 含「食堂」的菜', () => {
  const foods = [
    { name: '木须肉套餐', scene: '堂食', scenes: ['到店吃', '食堂'], budget: '💰', time: '快', tags: [] },
    { name: '红烧肉', scene: '自己做', budget: '💰💰', time: '快', tags: [] },
  ]
  // SCENE_OPTIONS = ['全部场景', '外卖', '堂食', '自己做', '公司食堂']
  const canteen = filterFoods(foods, { ...NO_FILTER, sceneIdx: 4 }, { excludeRecent: false })
  assert.deepStrictEqual(canteen.map(f => f.name), ['木须肉套餐'])
  const dineIn = filterFoods(foods, { ...NO_FILTER, sceneIdx: 2 }, { excludeRecent: false })
  assert.deepStrictEqual(dineIn.map(f => f.name), ['木须肉套餐'])
})

test('availabilityLevel: 「公司食堂」读 availability 的「食堂」key', () => {
  const food = { availability: { 外卖: '高', 堂食: '中', 自己做: '低', 食堂: '极低' } }
  assert.strictEqual(availabilityLevel(food, '公司食堂'), '极低')
  assert.strictEqual(availabilityLevel(food, '堂食'), '中')
  assert.strictEqual(availabilityLevel({}, '外卖'), undefined)
})

test('matchesScene: scenes 漏标但渠道适配度为「高」时兜底命中', () => {
  const food = { scene: '外卖', scenes: ['外卖'], availability: { 外卖: '高', 堂食: '中', 自己做: '高', 食堂: '低' } }
  assert.strictEqual(matchesScene(food, '自己做'), true, 'availability 高 → 兜底命中')
  assert.strictEqual(matchesScene(food, '堂食'), false, 'availability 中 → 不兜底')
  assert.strictEqual(matchesScene(food, '公司食堂'), false, 'availability 低 → 不兜底')
})

test('foodHasTag: 标签同义展开（肉/素/脆/热）与「辣」的 spicyLevel 兜底', () => {
  assert.strictEqual(foodHasTag({ tags: ['肉食'] }, '肉'), true)
  assert.strictEqual(foodHasTag({ tags: ['素食'] }, '素'), true)
  assert.strictEqual(foodHasTag({ tags: ['酥脆'] }, '脆'), true)
  assert.strictEqual(foodHasTag({ tags: ['热食'] }, '热'), true)
  assert.strictEqual(foodHasTag({ tags: ['清淡'] }, '肉'), false)
  // 只标了辣度没打「辣」tag 的菜，「辣」也要认
  assert.strictEqual(foodHasTag({ tags: [], spicyLevel: 2 }, '辣'), true)
  assert.strictEqual(foodHasTag({ tags: [], spicyLevel: 0 }, '辣'), false)
})

test('filterFoods: 避雷经同义展开（避「肉」拦得住只标「肉食」的菜）', () => {
  const foods = [
    { name: '酱大骨', scene: '堂食', budget: '💰💰', time: '慢', tags: ['肉食'] },
    { name: '白灼菜心', scene: '自己做', budget: '💰', time: '快', tags: ['素食', '清淡'] },
  ]
  const r = filterFoods(foods, { ...NO_FILTER, avoid: '肉' }, {})
  assert.deepStrictEqual(r.map(f => f.name), ['白灼菜心'])
  const r2 = filterFoods(foods, { ...NO_FILTER, avoid: '素' }, {})
  assert.deepStrictEqual(r2.map(f => f.name), ['酱大骨'])
})

// ===== 进化①②：加权推荐 + 负反馈降权 =====

test('foodWeight: 收藏加成、口味加成、拒绝降权', () => {
  const base = { name: 'x', tags: [] }
  assert.strictEqual(foodWeight(base, {}), 1) // 无偏好 = 基准 1
  assert.strictEqual(foodWeight({ name: 'x', tags: [] }, { favoriteSet: new Set(['x']) }), 2.5)
  assert.ok(foodWeight({ name: 'x', tags: ['辣'] }, { tasteCounts: { 辣: 2 } }) > 1)
  // 拒绝项被强力降权但不清零
  const w = foodWeight({ name: 'x', tags: [] }, { rejectedSet: new Set(['x']) })
  assert.ok(w > 0 && w < 0.2)
})

test('weightedPickIndex: 空池返回 -1，权重全 0 退化均匀', () => {
  assert.strictEqual(weightedPickIndex([], {}), -1)
  // 所有项被拒绝（权重极小但 >0），仍能取到下标
  const pool = [{ name: 'a', tags: [] }, { name: 'b', tags: [] }]
  const prefs = { rejectedSet: new Set(['a', 'b']) }
  assert.ok(weightedPickIndex(pool, prefs, () => 0.5) >= 0)
})

test('weightedPick: 高权重项在确定 rng 下被选中', () => {
  const pool = [{ name: '冷门', tags: [] }, { name: '最爱', tags: [] }]
  const prefs = { favoriteSet: new Set(['最爱']) } // 权重 1 vs 2.5，total 3.5
  // r = 0.9*3.5 = 3.15 → 跳过冷门(1) 落到最爱
  assert.strictEqual(weightedPick(pool, prefs, () => 0.9).name, '最爱')
})

test('weightedPick: ε-greedy 探索概率可突破权重偏见', () => {
  const pool = [{ name: '热门', tags: [] }, { name: '冷门', tags: [] }]
  const prefs = { favoriteSet: new Set(['热门']) } // 热门权重 2.5，冷门 1
  // 第一次 rng=0.05(<0.10) 触发探索，第二次 rng=0.99 选中第二个
  let calls = 0
  const rng = () => { calls++; return calls === 1 ? 0.05 : 0.99 }
  assert.strictEqual(weightedPick(pool, prefs, rng).name, '冷门')
})

// ===== 进化③：口味画像 =====

test('buildTasteProfile: 空历史给出引导文案', () => {
  const p = buildTasteProfile([], [], FOODS)
  assert.strictEqual(p.total, 0)
  assert.strictEqual(p.topCategories.length, 0)
  assert.ok(p.headline.includes('还没有记录'))
})

test('buildTasteProfile: 统计品类/标签/辣度占比', () => {
  const history = [
    { name: '红烧肉' }, { name: '红烧肉' }, { name: '麻辣烫' }, { name: '不存在的菜' }
  ]
  const p = buildTasteProfile(history, [{ name: '红烧肉' }], FOODS)
  assert.strictEqual(p.total, 4)                       // 含未知菜也计入决策次数
  assert.strictEqual(p.topCategories[0].name, '家常菜') // 红烧肉×2 → 家常菜 居首
  assert.strictEqual(p.topCategories[0].count, 2)
  assert.strictEqual(p.favoriteCount, 1)
  assert.strictEqual(p.spicyCount, 1)                  // 仅麻辣烫含「辣」
  assert.ok(Math.abs(p.spicyRatio - 0.25) < 1e-9)
  assert.ok(p.headline.includes('4 餐'))
})

// ===== 回退阶梯与餐段推断（filterFoodsWithFallback / inferMealPeriod） =====

const FB_BASE = { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', requireMeal: false }
const fbFood = (name, weight, periods) => ({
  name, scene: '自己做', budget: '💰', time: '快', tags: [],
  defaultPoolWeight: weight, mealPeriods: periods,
})

test('回退阶梯①：时段命中且池命中 → 只返回池菜', () => {
  const foods = [
    fbFood('池内早餐', 0.5, ['早餐']),
    fbFood('池外早餐', 0, ['早餐']),
    fbFood('池内午餐', 0.5, ['午餐']),
  ]
  const r = filterFoodsWithFallback(foods, FB_BASE, '早餐', {})
  assert.deepStrictEqual(r.map(f => f.name), ['池内早餐'])
})

test('回退阶梯②：时段命中但全在池外 → 时段匹配优先于池约束', () => {
  const foods = [
    fbFood('池外早餐', 0, ['早餐']),
    fbFood('池内午餐', 0.5, ['午餐']), // 不应为了进池而放宽时段
  ]
  const r = filterFoodsWithFallback(foods, FB_BASE, '早餐', {})
  assert.deepStrictEqual(r.map(f => f.name), ['池外早餐'])
})

test('回退阶梯③：时段无命中 → 放宽时段后池优先', () => {
  const foods = [
    fbFood('池内午餐', 0.5, ['午餐']),
    fbFood('池外午餐', 0, ['午餐']),
  ]
  const r = filterFoodsWithFallback(foods, FB_BASE, '早餐', {})
  assert.deepStrictEqual(r.map(f => f.name), ['池内午餐'])
})

test('回退阶梯③兜底：放宽时段后仍全在池外 → 返回非池菜', () => {
  const foods = [fbFood('池外午餐', 0, ['午餐'])]
  const r = filterFoodsWithFallback(foods, FB_BASE, '早餐', {})
  assert.deepStrictEqual(r.map(f => f.name), ['池外午餐'])
})

test('回退阶梯：硬条件不满足时如实返回空（回退只放宽时段与池，不放宽筛选）', () => {
  const foods = [fbFood('池内午餐', 0.5, ['午餐'])]
  const r = filterFoodsWithFallback(foods, { ...FB_BASE, avoid: '辣 甜 酸' , budgetIdx: 3 }, '早餐', {})
  assert.deepStrictEqual(r, [])
})

test('inferMealPeriod: 五个小时边界（5/10/14/17/22）', () => {
  const at = h => new Date(2026, 5, 10, h, 0, 0).getTime()
  assert.strictEqual(inferMealPeriod(at(4)), '夜宵')
  assert.strictEqual(inferMealPeriod(at(5)), '早餐')   // 下界含
  assert.strictEqual(inferMealPeriod(at(9)), '早餐')
  assert.strictEqual(inferMealPeriod(at(10)), '午餐')  // 10 整点已是午餐
  assert.strictEqual(inferMealPeriod(at(13)), '午餐')
  assert.strictEqual(inferMealPeriod(at(14)), '加餐')
  assert.strictEqual(inferMealPeriod(at(16)), '加餐')
  assert.strictEqual(inferMealPeriod(at(17)), '晚餐')
  assert.strictEqual(inferMealPeriod(at(21)), '晚餐')
  assert.strictEqual(inferMealPeriod(at(22)), '夜宵')
  assert.strictEqual(inferMealPeriod(at(0)), '夜宵')
})

// ===== 进化⑤：决策连胜 =====

test('computeStreak: 今天+昨天+前天 连续 3 天', () => {
  const now = new Date(2026, 4, 31, 12, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  const history = [
    { date: new Date(now).toISOString() },
    { date: new Date(now - day).toISOString() },
    { date: new Date(now - 2 * day).toISOString() },
  ]
  const s = computeStreak(history, now)
  assert.strictEqual(s.current, 3)
  assert.strictEqual(s.longest, 3)
  assert.strictEqual(s.decidedToday, true)
})

test('computeStreak: 今天没决定但昨天有 → 连胜仍存活', () => {
  const now = new Date(2026, 4, 31, 12, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  const s = computeStreak([{ date: new Date(now - day).toISOString() }], now)
  assert.strictEqual(s.current, 1)
  assert.strictEqual(s.decidedToday, false)
})

test('computeStreak: 断档后 current 归零、longest 保留', () => {
  const now = new Date(2026, 4, 31, 12, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  const history = [
    { date: new Date(now - 5 * day).toISOString() }, // 5 天前
    { date: new Date(now - 6 * day).toISOString() }, // 6 天前（与上面连成 2）
  ]
  const s = computeStreak(history, now)
  assert.strictEqual(s.current, 0)
  assert.strictEqual(s.longest, 2)
})

test('computeStreak: 空历史', () => {
  const s = computeStreak([], Date.now())
  assert.deepStrictEqual(s, { current: 0, longest: 0, decidedToday: false })
})

// ===== 进化⑥：一键凑一桌 =====

test('buildMealCombo: 优先不同品类、数量正确、无重复', () => {
  const foods = [
    { name: 'a', category: '家常菜' }, { name: 'b', category: '家常菜' },
    { name: 'c', category: '西式简餐' }, { name: 'd', category: '日韩料理' },
  ]
  const combo = buildMealCombo(foods, 3, () => 0) // 注入定长 rng，确定性
  assert.strictEqual(combo.length, 3)
  assert.strictEqual(new Set(combo.map(f => f.name)).size, 3) // 无重复菜
  assert.strictEqual(new Set(combo.map(f => f.category)).size, 3) // 三种不同品类
})

test('buildMealCombo: 品类不足时用剩余菜补足数量', () => {
  const foods = [
    { name: 'a', category: '家常菜' }, { name: 'b', category: '家常菜' }, { name: 'c', category: '家常菜' },
  ]
  const combo = buildMealCombo(foods, 3, () => 0)
  assert.strictEqual(combo.length, 3)
  assert.strictEqual(new Set(combo.map(f => f.name)).size, 3)
})

test('buildMealCombo: 池含配菜/汤品时保证至少一道正餐', () => {
  const foods = [
    { name: '紫菜蛋花汤', category: '汤粥炖品', canBeMeal: false },
    { name: '拍黄瓜', category: '配菜', canBeMeal: false },
    { name: '蒜蓉西兰花', category: '配菜', canBeMeal: false },
    { name: '红烧肉', category: '家常菜', canBeMeal: true },
  ]
  // 多个 rng 种子下都必须含正餐
  for (const seed of [0, 0.3, 0.6, 0.99]) {
    const combo = buildMealCombo(foods, 3, () => seed)
    assert.strictEqual(combo.length, 3)
    assert.ok(combo.some(f => f.canBeMeal !== false), `seed=${seed} 组合应含至少一道正餐`)
    assert.strictEqual(new Set(combo.map(f => f.name)).size, 3, '无重复')
  }
})

test('buildMealCombo: 全是配菜的极端池也能凑满（无正餐可锁定时回退）', () => {
  const foods = [
    { name: '拍黄瓜', category: '配菜', canBeMeal: false },
    { name: '蛋花汤', category: '汤粥炖品', canBeMeal: false },
    { name: '糖葫芦', category: '甜品饮品', canBeMeal: false },
  ]
  const combo = buildMealCombo(foods, 3, () => 0)
  assert.strictEqual(combo.length, 3)
})

// ===== 进化⑦：智能池过滤与权重分层 =====

test('filterFoods: 严格模式下排除 canBeMeal=false', () => {
  const foods = [
    { name: '红烧肉', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: ['肉'] },
    { name: '豆浆', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [] },
    { name: '玉米排骨汤', canBeMeal: false, scene: '自己做', budget: '💰', time: '慢', tags: [] },
  ]
  // 默认 requireMeal 不为 false → 只返回 canBeMeal=true
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '红烧肉')
})

test('filterFoods: 关闭严格模式后 canBeMeal=false 也进入池', () => {
  const foods = [
    { name: '红烧肉', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: [] },
    { name: '豆浆', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', requireMeal: false }, {})
  assert.strictEqual(r.length, 2)
})

test('filterFoods: 时段过滤 mealPeriod', () => {
  const foods = [
    { name: '油条', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [], mealPeriods: ['早餐', '加餐'] },
    { name: '红烧肉', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: [], mealPeriods: ['午餐', '晚餐'] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', requireMeal: false, mealPeriod: '早餐' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '油条')
})

test('filterFoods: 排除 enabled=false', () => {
  const foods = [
    { name: '红烧肉', canBeMeal: true, enabled: true, scene: '自己做', budget: '💰', time: '快', tags: [] },
    { name: '辣椒船', canBeMeal: true, enabled: false, scene: '堂食', budget: '💰', time: '快', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '红烧肉')
})

test('foodWeight: defaultPoolWeight 基础权重生效', () => {
  const low = { name: 'a', defaultPoolWeight: 0.3, tags: [] }
  const high = { name: 'b', defaultPoolWeight: 1.0, tags: [] }
  const wLow = foodWeight(low, {})
  const wHigh = foodWeight(high, {})
  assert.ok(wHigh > wLow, '高池权重应大于低池权重')
  assert.ok(wLow > 0, '低池权重保底非零')
})

test('foodWeight: canBeMeal=false 的 defaultPoolWeight 为 0 时仍保底', () => {
  const food = { name: 'a', defaultPoolWeight: 0, tags: [] }
  const w = foodWeight(food, {})
  assert.strictEqual(w, 0.01)
})

test('foodWeight: 冷却族 3 天内降权', () => {
  const now = Date.now()
  const food = { name: '四川火锅', cooldownFamilyId: '火锅族', tags: [] }
  const prefsCold = { cooldownFamilyPicks: { '火锅族': now - 24 * 60 * 60 * 1000 } } // 1 天前
  const prefsHot = { cooldownFamilyPicks: { '火锅族': now - 5 * 24 * 60 * 60 * 1000 } } // 5 天前
  const wCold = foodWeight(food, prefsCold)
  const wHot = foodWeight(food, prefsHot)
  assert.ok(wCold < wHot, '3 天内同类应降权')
})

test('foodWeight: 冷却时间源可经 ctx.now 注入（时间旅行确定性）', () => {
  const pickedAt = new Date(2026, 0, 1).getTime()
  const food = { name: '四川火锅', cooldownFamilyId: '火锅族', tags: [] }
  const prefs = { cooldownFamilyPicks: { '火锅族': pickedAt } }
  const day = 24 * 60 * 60 * 1000
  const wWithin = foodWeight(food, prefs, { now: pickedAt + 2 * day })  // 2 天后：冷却中
  const wAfter = foodWeight(food, prefs, { now: pickedAt + 4 * day })   // 4 天后：冷却结束
  assert.ok(wWithin < wAfter, 'ctx.now 应驱动冷却判定')
  assert.strictEqual(wAfter, 1)
})

// ===== 进化⑧：数据字段扩充 + 受约束随机 =====

test('filterFoods: itemLevel 过滤正餐模式', () => {
  const foods = [
    { name: '红烧肉', itemLevel: '单道菜', canBeMeal: true, scene: '自己做', budget: '💰', time: '快', tags: [] },
    { name: '豆浆', itemLevel: '早餐单品', canBeMeal: false, scene: '堂食', budget: '💰', time: '快', tags: [], mealPeriods: ['早餐'] },
    { name: '拍黄瓜', itemLevel: '配菜', canBeMeal: false, scene: '自己做', budget: '💰', time: '快', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', itemLevel: '正餐' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '红烧肉')
})

test('filterFoods: availability 渠道过滤', () => {
  const foods = [
    { name: '烤全羊', availability: { 外卖: '极低', 堂食: '高', 自己做: '极低', 食堂: '极低' }, canBeMeal: true, scene: '堂食', budget: '💰💰💰', time: '慢', tags: [] },
    { name: '黄焖鸡', availability: { 外卖: '高', 堂食: '中', 自己做: '低', 食堂: '高' }, canBeMeal: true, scene: '外卖', budget: '💰💰', time: '慢', tags: [] },
  ]
  const r = filterFoods(foods, { sceneIdx: 0, budgetIdx: 0, timeIdx: 0, tasteIdx: 0, avoid: '', scene: '外卖' }, {})
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].name, '黄焖鸡')
})

test('foodWeight: 渠道匹配权重', () => {
  const foodHigh = { name: 'a', defaultPoolWeight: 1.0, availability: { 外卖: '高', 堂食: '中', 自己做: '低', 食堂: '中' }, tags: [] }
  const foodLow = { name: 'b', defaultPoolWeight: 1.0, availability: { 外卖: '低', 堂食: '中', 自己做: '低', 食堂: '中' }, tags: [] }
  const wHigh = foodWeight(foodHigh, {}, { scene: '外卖' })
  const wLow = foodWeight(foodLow, {}, { scene: '外卖' })
  assert.ok(wHigh > wLow, '渠道高匹配权重大于低匹配')
})

test('foodWeight: 天气匹配权重', () => {
  const foodMatch = { name: 'a', defaultPoolWeight: 1.0, weatherTags: ['降温适合', '雨天适合'], tags: [] }
  const foodNoMatch = { name: 'b', defaultPoolWeight: 1.0, weatherTags: ['炎热适合'], tags: [] }
  const wMatch = foodWeight(foodMatch, {}, { weatherTags: ['降温适合'] })
  const wNoMatch = foodWeight(foodNoMatch, {}, { weatherTags: ['降温适合'] })
  assert.ok(wMatch > wNoMatch, '天气匹配权重大于不匹配')
})

test('buildRichReason: 生成结构化推荐理由', () => {
  const food = { name: '黄焖鸡米饭', budget: '💰💰', time: '慢', spicyLevel: 2, itemLevel: '完整餐食', availability: { 外卖: '高' } }
  const reason = buildRichReason(food, { scene: '外卖' })
  assert.ok(reason.includes('30元以内'), '应包含预算')
  assert.ok(reason.includes('适合外卖'), '应包含渠道')
  assert.ok(reason.includes('微辣'), '应包含辣度')
  assert.ok(reason.includes('适合慢慢吃'), '应包含时间')
  assert.ok(reason.includes('完整一餐'), '应包含粒度')
})

test('buildRichReason: 不辣/含辣警示/较快/家常小炒 分支', () => {
  const mild = buildRichReason({ name: '白灼菜心', budget: '💰', time: '快', spicyLevel: 0, itemLevel: '单道菜' }, {})
  assert.ok(mild.includes('不辣'), 'spicyLevel=0 应标不辣')
  assert.ok(mild.includes('预计较快'), 'time=快 应标预计较快')
  assert.ok(mild.includes('家常小炒'), 'itemLevel=单道菜 应标家常小炒')
  // 无 spicyLevel 但 dietWarnings 含辣 → 微辣
  const warned = buildRichReason({ name: '香锅', budget: '💰💰', time: '慢', spicyLevel: 0, dietWarnings: ['含辣'] }, {})
  assert.ok(warned.includes('微辣'), 'dietWarnings 含辣应标微辣')
  // 重辣分支
  const hot = buildRichReason({ name: '变态辣烤翅', budget: '💰', time: '快', spicyLevel: 3 }, {})
  assert.ok(hot.includes('重辣'), 'spicyLevel>=3 应标重辣')
  // 空食物兜底
  assert.strictEqual(buildRichReason(null, {}), '')
})

test('inferSeason: 夏→炎热适合、冬→降温适合、春秋→空', () => {
  assert.deepStrictEqual(inferSeason(new Date(2026, 6, 15).getTime()), ['炎热适合'])  // 7 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 7, 1).getTime()), ['炎热适合'])   // 8 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 0, 15).getTime()), ['降温适合'])  // 1 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 11, 15).getTime()), ['降温适合']) // 12 月
  assert.deepStrictEqual(inferSeason(new Date(2026, 3, 15).getTime()), [])            // 4 月（春）
  assert.deepStrictEqual(inferSeason(new Date(2026, 9, 15).getTime()), [])            // 10 月（秋）
  assert.deepStrictEqual(inferSeason(new Date(2026, 5, 1).getTime()), ['炎热适合'])   // 6 月（夏下界）
  assert.deepStrictEqual(inferSeason(new Date(2026, 1, 28).getTime()), ['降温适合'])  // 2 月（冬上界）
  assert.deepStrictEqual(inferSeason(new Date(2026, 4, 31).getTime()), [])            // 5 月（夏前）
  assert.deepStrictEqual(inferSeason(new Date(2026, 8, 1).getTime()), [])             // 9 月（夏后）
  assert.deepStrictEqual(inferSeason(new Date(2026, 2, 1).getTime()), [])             // 3 月（冬后）
  assert.deepStrictEqual(inferSeason(new Date(2026, 10, 30).getTime()), [])           // 11 月（冬前）
})

test('rollRarityWithPity: 基础概率（pity=0）R88 / SR11 / SSR1', () => {
  assert.strictEqual(rollRarityWithPity(0, () => 0.005).rarity, 'SSR')  // r<0.01
  assert.strictEqual(rollRarityWithPity(0, () => 0.05).rarity, 'SR')    // 0.01<=r<0.12
  assert.strictEqual(rollRarityWithPity(0, () => 0.5).rarity, 'R')      // r>=0.12
})

test('rollRarityWithPity: 未中SSR则计数+1，中SSR重置为0', () => {
  assert.strictEqual(rollRarityWithPity(0, () => 0.5).ssrPity, 1)
  assert.strictEqual(rollRarityWithPity(5, () => 0.5).ssrPity, 6)
  assert.strictEqual(rollRarityWithPity(10, () => 0.005).ssrPity, 0)   // 中SSR重置
})

test('rollRarityWithPity: SSR概率随计数递增并封顶16%', () => {
  assert.strictEqual(rollRarityWithPity(15, () => 0.155).rarity, 'SSR')   // pity15→rSSR=0.16，0.155命中
  assert.notStrictEqual(rollRarityWithPity(20, () => 0.17).rarity, 'SSR') // 封顶0.16，0.17不中
  assert.notStrictEqual(rollRarityWithPity(14, () => 0.155).rarity, 'SSR')// pity14→rSSR=0.15，0.155不中
})

test('rollRarityWithPity: 累计25抽硬保底必出SSR', () => {
  assert.strictEqual(rollRarityWithPity(24, () => 0.99).rarity, 'SSR')
  assert.strictEqual(rollRarityWithPity(24, () => 0.99).ssrPity, 0)
})

test('rollRarityWithPity: 与选菜解耦（只吃 pity + rng）', () => {
  const food = { name: '蛋炒饭', tags: [], defaultPoolWeight: 1.0 }
  assert.strictEqual(rollRarityWithPity(0, () => 0.005).rarity, 'SSR')
  assert.strictEqual(weightedPick([food], {}, () => 0.5).name, '蛋炒饭')
})
