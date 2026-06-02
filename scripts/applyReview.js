const fs = require('fs');
const path = require('path');
const foods = require('../data/foods.js');
const { review, new_items, pauses, merges } = require('./review_data.json');

// ===== 合并目标映射（被合并项 -> 主项）=====
const mergeTargets = {
  '炸麻球': '麻团',
  '水蒸蛋': '蒸蛋羹',
  '章鱼丸子': '章鱼小丸子',
  '新加坡鸡饭': '海南鸡饭（新加坡式）',
  '香炒河粉': '炒河粉',
  '炒面': '家常炒面', // 同名冲突，走合并而非改名
};

// ===== 改名映射（仅当目标不存在时执行改名）=====
const renameMap = {
  '盖浇饭': '自选盖浇饭',
  '咖喱叻沙': '叻沙米粉（咖喱风味）',
};

// 检查目标是否已存在
const existingNames = new Set(foods.map(f => f.name));

let changed = 0;
let unchanged = 0;

foods.forEach(f => {
  const r = review[f.name];
  if (!r) {
    // 不在审查中的菜（V3 新增47条等）：保守处理，默认移出默认池
    f.defaultPoolWeight = 0;
    unchanged++;
    return;
  }

  changed++;

  // 1. 设置权重
  f.defaultPoolWeight = (r.weight !== undefined && r.weight !== null) ? r.weight : 0;

  // 2. 暂停展示
  if (r.conclusion === '暂停默认展示') {
    f.enabled = false;
  }

  // 3. 合并处理：设置 equivalentGroupId，不独立展示
  if (r.conclusion === '合并后不独立展示' || mergeTargets[f.name]) {
    const target = mergeTargets[f.name];
    if (target) {
      f.defaultPoolWeight = 0;
      f.equivalentGroupId = target + '_合并组';
      if (!f.aliases) f.aliases = [];
      if (!f.aliases.includes(target)) f.aliases.push(target);
    }
  }

  // 4. 改名处理（避免同名冲突）
  if (renameMap[f.name] && !existingNames.has(renameMap[f.name])) {
    const oldName = f.name;
    f.name = renameMap[f.name];
    if (!f.aliases) f.aliases = [];
    if (!f.aliases.includes(oldName)) f.aliases.push(oldName);
  }

  // 5. 处理炒面的特殊情况：目标已存在，合并而非改名
  if (f.name === '炒面' && existingNames.has('家常炒面')) {
    f.defaultPoolWeight = 0;
    f.equivalentGroupId = '家常炒面_合并组';
    if (!f.aliases) f.aliases = [];
    if (!f.aliases.includes('家常炒面')) f.aliases.push('家常炒面');
  }

  // 6. 处理章鱼丸子的特殊情况：目标已存在，合并而非改名
  if (f.name === '章鱼丸子' && existingNames.has('章鱼小丸子')) {
    f.defaultPoolWeight = 0;
    f.equivalentGroupId = '章鱼小丸子_合并组';
    if (!f.aliases) f.aliases = [];
    if (!f.aliases.includes('章鱼小丸子')) f.aliases.push('章鱼小丸子');
  }

  // 7. itemLevel 校正：确保单道菜不会被误判为完整餐食
  if (r.pool && r.pool.includes('配菜')) {
    f.itemLevel = '配菜';
    f.canBeMeal = false;
  } else if (r.pool && r.pool.includes('小吃')) {
    f.itemLevel = '小吃';
    f.canBeMeal = false;
  } else if (r.pool && r.pool.includes('早餐')) {
    f.itemLevel = '早餐单品';
    f.mealPeriods = ['早餐'];
    f.canBeMeal = true;
  } else if (r.pool && r.pool.includes('聚餐')) {
    f.itemLevel = '聚餐方式';
  } else if (r.pool && r.pool.includes('汤羹')) {
    f.itemLevel = '汤羹';
    f.canBeMeal = false;
  } else if (r.pool && r.pool.includes('自己做')) {
    f.itemLevel = '单道菜';
    f.canBeMeal = false;
  }
});

console.log(`Processed: ${changed} reviewed, ${unchanged} unreviewed`);

// ===== 新增20条缺失菜品 =====
const newFoodDefs = [
  { name: '水饺', emoji: '🥟', category: '面食粉类', tags: ['面食', '家常'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['早餐', '午餐', '晚餐'] },
  { name: '牛肉面', emoji: '🍜', category: '面食粉类', tags: ['面食', '牛肉', '汤面'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '西红柿鸡蛋面', emoji: '🍜', category: '面食粉类', tags: ['面食', '清淡', '家常'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '鸡公煲', emoji: '🍲', category: '家常热菜', tags: ['肉食', '辣', '火锅'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '烤肉拌饭', emoji: '🍚', category: '米饭套餐', tags: ['米饭', '烤肉', '快餐'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '鸡腿饭', emoji: '🍗', category: '米饭套餐', tags: ['米饭', '鸡肉', '快餐'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '红烧排骨饭', emoji: '🍚', category: '米饭套餐', tags: ['米饭', '排骨', '红烧'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '土豆烧牛肉饭', emoji: '🍚', category: '米饭套餐', tags: ['米饭', '牛肉', '土豆'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '青椒炒肉饭', emoji: '🍚', category: '米饭套餐', tags: ['米饭', '猪肉', '家常'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '农家小炒肉饭', emoji: '🍚', category: '米饭套餐', tags: ['米饭', '猪肉', '辣', '家常'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '自选中式快餐', emoji: '🍱', category: '米饭套餐', tags: ['快餐', '中式', '自选'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '两荤一素盒饭', emoji: '🍱', category: '米饭套餐', tags: ['快餐', '盒饭', '中式'], itemLevel: '完整餐食', defaultPoolWeight: 1.0, mealPeriods: ['午餐', '晚餐'] },
  { name: '鲜肉包', emoji: '🥟', category: '小吃点心', tags: ['面食', '早餐', '肉'], itemLevel: '早餐单品', defaultPoolWeight: 0, mealPeriods: ['早餐'] },
  { name: '肠粉', emoji: '🥡', category: '小吃点心', tags: ['米制品', '早餐', '华南'], itemLevel: '早餐单品', defaultPoolWeight: 0.3, mealPeriods: ['早餐', '夜宵'] },
  { name: '皮蛋瘦肉粥', emoji: '🥣', category: '汤粥炖品', tags: ['粥', '早餐', '清淡'], itemLevel: '早餐单品', defaultPoolWeight: 0, mealPeriods: ['早餐'] },
  { name: '沙县拌面', emoji: '🍜', category: '面食粉类', tags: ['面食', '福建', '早餐'], itemLevel: '完整餐食', defaultPoolWeight: 0.3, mealPeriods: ['早餐', '午餐', '晚餐'] },
  { name: '桂林米粉', emoji: '🍜', category: '面食粉类', tags: ['米粉', '广西', '酸辣'], itemLevel: '完整餐食', defaultPoolWeight: 0.3, mealPeriods: ['午餐', '晚餐'] },
  { name: '常德米粉', emoji: '🍜', category: '面食粉类', tags: ['米粉', '湖南', '辣'], itemLevel: '完整餐食', defaultPoolWeight: 0.3, mealPeriods: ['午餐', '晚餐'] },
  { name: '广式烧腊双拼饭', emoji: '🍚', category: '米饭套餐', tags: ['米饭', '烧腊', '华南'], itemLevel: '完整餐食', defaultPoolWeight: 0.3, mealPeriods: ['午餐', '晚餐'] },
  { name: '重庆鸡公煲', emoji: '🍲', category: '火锅冒菜', tags: ['辣', '鸡肉', '火锅'], itemLevel: '完整餐食', defaultPoolWeight: 0.3, mealPeriods: ['午餐', '晚餐'] },
];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

newFoodDefs.forEach(def => {
  if (existingNames.has(def.name)) {
    console.log(`Skip existing: ${def.name}`);
    return;
  }
  const food = {
    _id: uid(),
    name: def.name,
    emoji: def.emoji,
    category: def.category,
    scene: '堂食',
    budget: '💰💰',
    time: '快',
    tags: def.tags,
    calories: null,
    spicyLevel: 0,
    canBeMeal: def.itemLevel !== '配菜' && def.itemLevel !== '小吃' && def.itemLevel !== '汤羹',
    mealPeriods: def.mealPeriods,
    mealRole: '正餐',
    defaultPoolWeight: def.defaultPoolWeight,
    equivalentGroupId: null,
    cooldownFamilyId: null,
    rawFood: false,
    safetyNotice: '',
    seasonTags: [],
    festivalTags: [],
    enabled: true,
    itemLevel: def.itemLevel,
    availability: { 外卖: '中', 堂食: '中', 自己做: '低', 食堂: '低' },
    aliases: [],
    regionTags: [],
    weatherTags: [],
    dietWarnings: [],
    allergenTags: [],
  };
  foods.push(food);
  existingNames.add(def.name);
  console.log(`Added: ${def.name}`);
});

// ===== 输出统计 =====
const stats = {
  total: foods.length,
  defaultPool: foods.filter(f => f.defaultPoolWeight > 0 && f.enabled !== false).length,
  regular: foods.filter(f => f.defaultPoolWeight === 1.0 && f.enabled !== false).length,
  low: foods.filter(f => f.defaultPoolWeight > 0 && f.defaultPoolWeight < 1.0 && f.enabled !== false).length,
  removed: foods.filter(f => f.defaultPoolWeight === 0 && f.enabled !== false).length,
  paused: foods.filter(f => f.enabled === false).length,
};
console.log('Stats:', stats);

// ===== 写入文件 =====
const output = 'module.exports = ' + JSON.stringify(foods, null, 2);
const outPath = path.join(__dirname, '../data/foods.js');
fs.writeFileSync(outPath, output);
console.log('Written to', outPath);
