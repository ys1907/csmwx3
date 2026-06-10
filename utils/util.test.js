const test = require('node:test')
const assert = require('node:assert')
const { shuffleArray, formatDate, migrateFood, uid, mergeSeedWithLocal } = require('./util.js')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

test('shuffleArray: 不改原数组且元素集合不变', () => {
  const orig = [1, 2, 3, 4, 5]
  const copy = orig.slice()
  const out = shuffleArray(orig)
  assert.deepStrictEqual(orig, copy, '原数组不应被修改')
  assert.strictEqual(out.length, orig.length)
  assert.deepStrictEqual(out.slice().sort(), copy.slice().sort())
})

test('migrateFood: 缺字段补默认值', () => {
  const m = migrateFood({})
  assert.strictEqual(m.name, '未知食物')
  assert.strictEqual(m.emoji, '🍽️')
  assert.strictEqual(m.category, '家常菜')
  assert.deepStrictEqual(m.tags, [])
  assert.strictEqual(m.spicyLevel, 0)
  assert.strictEqual(m.calories, null)
  assert.ok(m._id, '_id 应被生成')
})

test('migrateFood: tags 非数组归一为空数组、保留已有 _id', () => {
  const m = migrateFood({ name: '红烧肉', tags: '辣', _id: 'fixed-id' })
  assert.deepStrictEqual(m.tags, [])
  assert.strictEqual(m._id, 'fixed-id')
})

test('mergeSeedWithLocal: 重播种保留用户自建菜', () => {
  const seed = [{ _id: 's1', name: '红烧肉' }, { _id: 's2', name: '麻辣烫' }]
  const local = [
    { _id: 's1', name: '红烧肉', emoji: '改过的' }, // 内置菜的编辑：不保留，以新种子为准
    { _id: 'u1', name: '我家秘制菜' },              // 自建菜：保留
  ]
  const merged = mergeSeedWithLocal(seed, local)
  assert.strictEqual(merged.length, 3)
  assert.ok(merged.some(f => f._id === 'u1'))
  assert.strictEqual(merged.find(f => f._id === 's1').emoji, undefined, '内置菜编辑不保留')
})

test('mergeSeedWithLocal: 同名冲突时自建菜优先、种子条让位（防重名）', () => {
  const seed = [{ _id: 's1', name: '红烧肉' }, { _id: 's2', name: '生煎包' }]
  const local = [{ _id: 'u1', name: '生煎包', emoji: '🥟' }]
  const merged = mergeSeedWithLocal(seed, local)
  assert.strictEqual(merged.length, 2)
  assert.strictEqual(merged.find(f => f.name === '生煎包')._id, 'u1')
  assert.strictEqual(new Set(merged.map(f => f.name)).size, merged.length, '合并结果无重名')
})

test('mergeSeedWithLocal: 本地为空/脏数据时原样返回种子', () => {
  const seed = [{ _id: 's1', name: '红烧肉' }]
  assert.deepStrictEqual(mergeSeedWithLocal(seed, null), seed)
  assert.deepStrictEqual(mergeSeedWithLocal(seed, []), seed)
  assert.deepStrictEqual(mergeSeedWithLocal(seed, [null, { name: '没有id' }, { _id: 'x' }]), seed)
})

test('migrateFood: scenes 旧词归一 + 去重 + 空回填主场景（matchesScene 依赖非空）', () => {
  // 旧版备份导入：到店吃→堂食、食堂→公司食堂
  const m = migrateFood({ name: '木须肉', scenes: ['到店吃', '食堂'] })
  assert.deepStrictEqual(m.scenes, ['堂食', '公司食堂'])
  // 新旧词混标 → 映射后去重
  assert.deepStrictEqual(migrateFood({ name: 'x', scenes: ['堂食', '到店吃', '外卖'] }).scenes, ['堂食', '外卖'])
  // scenes 缺失/脏类型 → 回填主场景，保证非空
  assert.deepStrictEqual(migrateFood({ name: 'x' }).scenes, ['堂食'])
  assert.deepStrictEqual(migrateFood({ name: 'x', scene: '自己做', scenes: '到店吃' }).scenes, ['自己做'])
})

test('migrateFood: tags 旧词归一（肉食→肉等）+ 去重；顶层 scene 同样归一', () => {
  const m = migrateFood({ name: '酱大骨', tags: ['肉食', '肉', '酥脆', '热食'] })
  assert.deepStrictEqual(m.tags, ['肉', '脆', '热'])
  assert.deepStrictEqual(migrateFood({ name: 'x', tags: ['素食'] }).tags, ['素'])
  assert.strictEqual(migrateFood({ name: 'x', scene: '到店吃' }).scene, '堂食')
})

test('migrateFood: availability 的 key 归一（食堂→公司食堂），缺失给统一默认', () => {
  const m = migrateFood({ name: 'x', availability: { 外卖: '高', 食堂: '低' } })
  assert.deepStrictEqual(m.availability, { 外卖: '高', 公司食堂: '低' })
  assert.deepStrictEqual(migrateFood({ name: 'x' }).availability, { 外卖: '中', 堂食: '中', 自己做: '中', 公司食堂: '中' })
})

test('formatDate: 带/不带星期', () => {
  const d = new Date(2024, 4, 31) // 2024-05-31 本地时间
  assert.strictEqual(formatDate(d, false), '5月31日')
  assert.strictEqual(formatDate(d, true), `${WEEKDAYS[d.getDay()]} 5月31日`)
})

test('formatDate: 跨月边界', () => {
  assert.strictEqual(formatDate(new Date(2024, 0, 1), false), '1月1日')
  assert.strictEqual(formatDate(new Date(2024, 11, 31), false), '12月31日')
})

test('uid: 生成非空且基本唯一', () => {
  const a = uid(), b = uid()
  assert.ok(a && b)
  assert.notStrictEqual(a, b)
})

test('migrateFood: 旧分类归一到新分类', () => {
  assert.strictEqual(migrateFood({ name: '黄焖鸡', category: '中式快餐' }).category, '饭类套餐')
  assert.strictEqual(migrateFood({ name: '煎饼', category: '街边小吃' }).category, '小吃点心')
  assert.strictEqual(migrateFood({ name: '寿司', category: '日韩' }).category, '日韩料理')
  assert.strictEqual(migrateFood({ name: '意面', category: '西式' }).category, '西式简餐')
  // 火锅烧烤需细分：foodType 或菜名命中烧烤 → 烧烤，否则火锅冒菜
  assert.strictEqual(migrateFood({ name: '自助烧烤', category: '火锅烧烤' }).category, '烧烤')
  assert.strictEqual(migrateFood({ name: '烤羊腿', category: '火锅烧烤', foodType: '烧烤' }).category, '烧烤')
  assert.strictEqual(migrateFood({ name: '四川火锅', category: '火锅烧烤' }).category, '火锅冒菜')
  // 新分类与缺失分类保持既有行为
  assert.strictEqual(migrateFood({ name: '红烧肉', category: '家常菜' }).category, '家常菜')
  assert.strictEqual(migrateFood({ name: '无分类' }).category, '家常菜')
})

test('migrateFood: weatherTags 为空时按 category/tags 推断填充', () => {
  // 辣/火锅冒菜 → 降温适合
  assert.ok(migrateFood({ name: '麻辣香锅', category: '火锅冒菜', tags: ['辣'] }).weatherTags.includes('降温适合'))
  // 凉 → 炎热适合
  assert.ok(migrateFood({ name: '凉面', category: '面食粉类', tags: ['凉'] }).weatherTags.includes('炎热适合'))
  // 旧分类先归一(火锅烧烤→火锅冒菜)再推断，含辣 → 降温适合
  assert.ok(migrateFood({ name: '麻辣烫', category: '火锅烧烤', tags: ['辣'] }).weatherTags.includes('降温适合'))
  // 已有 weatherTags 则保留，不覆盖
  assert.deepStrictEqual(migrateFood({ name: 'x', category: '家常菜', weatherTags: ['雨天适合'] }).weatherTags, ['雨天适合'])
  // 纯 category 路径：火锅烧烤归一为火锅冒菜后，即使无辣 tag 也应触发降温适合
  assert.ok(migrateFood({ name: '清汤火锅', category: '火锅烧烤', tags: [] }).weatherTags.includes('降温适合'), '归一后 category=火锅冒菜 应触发降温适合')
  // 饮品 → 炎热适合（mealRole 路径）
  assert.ok(migrateFood({ name: '柠檬水', category: '甜品饮品', mealRole: '饮品' }).weatherTags.includes('炎热适合'), '饮品应触发炎热适合')
  // 汤粥炖品 + 汤品 → 降温适合（汤品路径）
  assert.ok(migrateFood({ name: '例汤', category: '汤粥炖品', mealRole: '汤品' }).weatherTags.includes('降温适合'), '汤品应触发降温适合')
})
