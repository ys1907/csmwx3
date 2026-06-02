// scripts/curatePool.js —— 菜品合理性一次性治理（幂等）。
// 用法（本地，无沙箱）：node scripts/curatePool.js   |   node scripts/curatePool.js --dry
// 设计见 docs/superpowers/specs/2026-06-02-dish-reasonableness-design.md
const fs = require('fs')
const path = require('path')
const FOODS_PATH = path.join(__dirname, '..', 'data', 'foods.js')
const foods = require('../data/foods.js')
const DRY = process.argv.includes('--dry')

// 旧分类落盘归一（对齐 utils/util.js normalizeCategory）
const LEGACY = { 中式快餐: '饭类套餐', 街边小吃: '小吃点心', 日韩: '日韩料理', 西式: '西式简餐' }
const normCat = f =>
  f.category === '火锅烧烤'
    ? ((f.foodType === '烧烤' || /烧烤|烤串|烤羊/.test(f.name || '')) ? '烧烤' : '火锅冒菜')
    : (LEGACY[f.category] || f.category)

// ===== 逐道定位表 O =====
// name -> { w?:权重 , off?:true出池停用 , meal?:canBeMeal , mp?:[mealPeriods追加] , bud?:budget , spicy?:spicyLevel , tags?:[tag追加] }
const O = {}
const set = (name, o) => { O[name] = { ...(O[name] || {}), ...o } }
const setAll = (names, o) => names.forEach(n => set(n, o))

// — 出池/停用（硬规则，优先级最高，不被 Task 4 的 O 覆盖）：内脏猎奇 / 地方小众 / 异国小众 —
const FORCE_OFF = new Set([
  '印尼炒饭', '椰浆饭', '炒粿条', '咖喱牛腩饭', '天妇罗盖饭', '鳗鱼饭', '炸虾盖饭', '三文鱼饭',
  '羊肉泡馍', '豆花饭', '裤带面', '宜宾燃面', '米皮', '擀面皮',
  '猪脏粉', '肥肠粉', '生鱼片', '醉蟹', '美蛙鱼头',
])
const OFF_FUZZY = ['油泼扯面'] // 名字带全角括号，用 includes 兜底

// — 激活进池：火锅 / 烧烤（偶尔共享大餐，中低权重）/ 早餐（限早餐时段）—
Object.entries({
  四川火锅: .45, 重庆火锅: .45, 牛肉火锅: .4, 潮汕牛肉火锅: .4, 猪肚鸡火锅: .4, 椰子鸡火锅: .35,
  菌菇火锅: .35, 番茄火锅: .35, 老北京涮羊肉: .4, 串串香: .4, 酸菜鱼火锅: .4, 鸡公煲: .4,
  东北烧烤: .4, 新疆烧烤: .4, 自助烧烤: .4, 烤肉: .4, 铁板烧: .35, 户外烧烤: .3,
  皮蛋瘦肉粥: .7, 小笼包: .7, 生煎包: .6, 煎饼果子: .7, 鸡蛋灌饼: .6, 肠粉: .6, 胡辣汤: .6, 豆浆油条套餐: .7, 手抓饼: .6, 馄饨: .7,
}).forEach(([n, w]) => set(n, { w }))
setAll(['皮蛋瘦肉粥', '小笼包', '生煎包', '煎饼果子', '鸡蛋灌饼', '肠粉', '胡辣汤', '豆浆油条套餐', '手抓饼', '馄饨'], { mp: ['早餐'] })

// ===== Task 4 逐分类决策（子代理产出 → 在此 Object.assign 合并，每批一块）=====
Object.assign(O, { // 家常菜
  客家咸鸡: { w: 0.65, meal: true }, 炸鸡: { w: 0.75, meal: true }, 蒜泥白肉: { w: 0.6, meal: true },
  烤培根: { w: 0.35, meal: false }, 珍珠丸子: { w: 0.65, meal: true }, 香菇滑鸡: { w: 0.7, meal: true },
  粉蒸肉: { w: 0.7, meal: true }, 松鼠鳜鱼: { w: 0.6, meal: true }, 红烧肉: { w: 0.95, meal: true },
  客家酿豆腐: { w: 0.6, meal: true }, 啤酒鸭: { w: 0.75, meal: true }, 番茄牛腩: { w: 0.8, meal: true },
  回锅肉: { w: 0.85, meal: true, tags: ['辣'], spicy: 2 }, 烤鸭: { w: 0.8, meal: true }, 蒜蓉蒸虾: { w: 0.75, meal: true },
  鱼香茄子: { w: 0.65, meal: true, tags: ['辣'], spicy: 1 }, 肉末茄子: { w: 0.65, meal: true }, 板栗烧鸡: { w: 0.75, meal: true },
  酸菜鱼: { w: 0.85, meal: true, tags: ['辣'], spicy: 2 }, 地三鲜: { w: 0.5, meal: true }, 干锅花菜: { w: 0.45, meal: true, tags: ['辣'], spicy: 2 },
  咖喱鸡: { w: 0.7, meal: true }, 糖拌西红柿: { w: 0.2, meal: false, tags: ['清淡'] }, 猪蹄: { w: 0.65, meal: true },
  清蒸鲈鱼: { w: 0.75, meal: true, tags: ['清淡'] }, 白切鸡: { w: 0.7, meal: true, tags: ['清淡'] }, 鱼香肉丝: { w: 0.75, meal: true, tags: ['辣'], spicy: 1 },
  香辣虾: { w: 0.7, meal: true, tags: ['辣'], spicy: 2 }, 万州烤鱼: { w: 0.7, meal: true, tags: ['辣'], spicy: 2 }, 沙嗲: { w: 0.45, meal: true },
  糖醋鱼: { w: 0.65, meal: true }, 锅包肉: { w: 0.7, meal: true }, 荷叶粉蒸肉: { w: 0.65, meal: true },
  麻婆豆腐: { w: 0.75, meal: true, tags: ['辣'], spicy: 2 }, 烤秋刀鱼: { w: 0.55, meal: true }, 番茄炒蛋: { w: 0.8, meal: true },
  可乐鸡翅: { w: 0.8, meal: true }, 宫保鸡丁: { w: 0.8, meal: true, tags: ['辣'], spicy: 2 }, 溜肉段: { w: 0.65, meal: true },
  葱姜炒蟹: { w: 0.5, meal: true, bud: '💰💰💰' }, 叫花鸡: { w: 0.6, meal: true }, 干炸丸子: { w: 0.6, meal: true },
  姜母鸭: { w: 0.65, meal: true }, 烧肉: { w: 0.75, meal: true }, 椒麻鸡: { w: 0.65, meal: true, tags: ['辣'], spicy: 2 },
  手撕鸡: { w: 0.65, meal: true }, 油焖大虾: { w: 0.75, meal: true }, 三杯鸡: { w: 0.7, meal: true },
  糖醋里脊: { w: 0.75, meal: true }, 梅菜扣肉: { w: 0.8, meal: true }, 软炸里脊: { w: 0.6, meal: true },
  清蒸鱼: { w: 0.7, meal: true, tags: ['清淡'] }, 盐水鸭: { w: 0.65, meal: true }, 避风塘炒蟹: { w: 0.5, meal: true, bud: '💰💰💰' },
  清蒸大闸蟹: { w: 0.5, meal: true, bud: '💰💰💰' }, 酿苦瓜: { w: 0.55, meal: true }, 酿豆腐: { w: 0.6, meal: true },
  红烧鱼: { w: 0.75, meal: true }, 口水鸡: { w: 0.7, meal: true, tags: ['辣'], spicy: 2 }, 盐焗鸡: { w: 0.7, meal: true },
  酿青椒: { w: 0.5, meal: true }, 糖醋排骨: { w: 0.85, meal: true }, 黄焖鸡: { w: 0.85, meal: true },
  水煮鱼: { w: 0.85, meal: true, tags: ['辣'], spicy: 3 }, 樟茶鸭: { w: 0.6, meal: true }, 四喜丸子: { w: 0.65, meal: true },
  酱肘子: { w: 0.7, meal: true }, 烤猪蹄: { w: 0.6, meal: true }, 香辣蟹: { w: 0.55, meal: true, tags: ['辣'], spicy: 2, bud: '💰💰' },
  烤鸡翅: { w: 0.75, meal: true }, 烤鸡腿: { w: 0.75, meal: true }, 葱油鸡: { w: 0.7, meal: true },
  红烧茄子: { w: 0.55, meal: true }, 烧鸭: { w: 0.7, meal: true }, 纸上烤鱼: { w: 0.65, meal: true, tags: ['辣'], spicy: 2 },
  蟹粉豆腐: { w: 0.5, meal: true, bud: '💰💰' }, 东坡肘子: { w: 0.75, meal: true }, 狮子头: { w: 0.7, meal: true },
  青椒炒肉: { w: 0.75, meal: true, tags: ['辣'], spicy: 2 }, 农家小炒肉: { w: 0.8, meal: true, tags: ['辣'], spicy: 2 }, 红烧排骨: { w: 0.85, meal: true },
  土豆烧牛肉: { w: 0.8, meal: true }, 红烧鸡块: { w: 0.8, meal: true }, 蒜薹炒肉: { w: 0.7, meal: true },
  青椒土豆丝: { w: 0.3, meal: false, tags: ['清淡'] }, 蒜蓉油麦菜: { w: 0.2, meal: false, tags: ['清淡'] },
  清炒上海青: { w: 0.18, meal: false, tags: ['清淡'] }, 清炒西兰花: { w: 0.18, meal: false, tags: ['清淡'] },
})

Object.assign(O, { // 饭类套餐
  "烤饭团": { off: true }, "粢饭团": { off: true }, "金枪鱼饭团": { off: true }, "饭团": { off: true },
  "温州糯米饭": { off: true }, "三文鱼饭团": { off: true }, "韩式生拌牛肉饭": { off: true },
  "西班牙海鲜饭": { off: true }, "海南鸡饭（新加坡式）": { off: true },
  "寿司": { w: 0.45, meal: true }, // 国民级，子代理误判出池→保留（分类偏而已）
  "烤肉拌饭": { w: 0.8, tags: ["香", "肉", "饱腹"] }, "鸡腿饭": { w: 1.0, tags: ["肉", "酥脆", "饱腹"] },
  "红烧排骨饭": { w: 1.0, tags: ["甜", "酱香", "肉", "饱腹"] }, "土豆烧牛肉饭": { w: 0.8, tags: ["家常", "肉", "饱腹"] },
  "青椒炒肉饭": { w: 0.9, tags: ["辣", "香", "肉", "饱腹"] }, "农家小炒肉饭": { w: 0.9, tags: ["辣", "香", "肉", "饱腹"] },
  "自选中式快餐": { w: 1.0, tags: ["家常", "饱腹"] }, "两荤一素盒饭": { w: 1.0, tags: ["家常", "饱腹"] },
  "广式烧腊双拼饭": { w: 0.8, tags: ["肉", "香", "饱腹"] }, "东北盒饭": { w: 0.8, tags: ["家常", "饱腹"] },
  "新疆抓饭": { w: 0.7, tags: ["香", "肉", "饱腹"] },
  "照烧鸡饭": { w: 0.45 }, "日式亲子丼": { w: 0.45 }, "猪排饭": { w: 0.55 }, "炸猪排饭": { w: 0.5 },
  "韩式拌饭": { w: 0.5, tags: ["辣"] }, "石锅拌饭": { w: 0.5, tags: ["辣"] }, "泡菜炒饭": { w: 0.45, tags: ["酸辣", "辣"] },
  "海鲜盖饭": { w: 0.45, tags: ["鲜", "海鲜"] }, "水煮鱼饭": { w: 0.65, tags: ["辣", "鲜"], spicy: 2 },
  "烧鹅饭": { w: 0.55 }, "咖喱饭": { w: 0.65 }, "咖喱炒饭": { w: 0.7 },
  "鱼香肉丝饭": { spicy: 1, tags: ["甜辣"] }, "回锅肉饭": { spicy: 2, tags: ["辣"] }, "干煸豆角饭": { spicy: 2, tags: ["辣"] },
  "黑椒牛柳饭": { spicy: 1, tags: ["辣"] }, "麻婆豆腐饭": { spicy: 2, tags: ["辣", "麻辣"] }, "宫保鸡丁饭": { spicy: 2, tags: ["辣"] },
  "海南鸡饭": { w: 1.0, tags: ["清淡"] }, "白切鸡饭": { w: 1.0, tags: ["清淡"] }, "豉油鸡饭": { w: 1.0, tags: ["酱香"] },
})

Object.assign(O, { // 面食粉类
  "重庆小面": { w: 1.0, meal: true, spicy: 2, tags: ["辣", "香"] }, "武汉热干面": { w: 1.0, meal: true, tags: ["家常"] },
  "螺蛳粉": { w: 1.0, meal: true, spicy: 2, tags: ["辣", "海鲜"] }, "酸辣粉": { w: 1.0, meal: true, spicy: 2, tags: ["酸", "辣"] },
  "牛肉面": { w: 1.0, meal: true, spicy: 2, tags: ["鲜", "香", "辣", "肉"] }, "西红柿鸡蛋面": { w: 1.0, meal: true, bud: "💰", tags: ["家常", "鲜"] },
  "水饺": { w: 1.0, meal: true, bud: "💰", tags: ["家常", "饱腹"] },
  "大盘鸡拌面": { w: 0.7, meal: true, spicy: 2, tags: ["辣", "肉"] }, "河南烩面": { w: 0.7, meal: true, tags: ["鲜"] },
  "凉皮": { w: 0.8, meal: true, spicy: 2, tags: ["辣", "凉"] }, "小锅米线": { w: 0.7, meal: true, spicy: 2, tags: ["辣", "鲜"] },
  "臊子面": { w: 0.7, meal: true, spicy: 2, tags: ["酸辣", "辣"] }, "油泼面": { w: 0.8, meal: true, spicy: 2, tags: ["辣", "香"] },
  "担担面": { w: 0.8, meal: true, spicy: 2, tags: ["辣", "香"] }, "家常炒面": { w: 0.6, meal: true, tags: ["香"] },
  "桂林米粉": { w: 0.7, meal: true, bud: "💰", spicy: 1, tags: ["酸辣", "香"] }, "常德米粉": { w: 0.6, meal: true, bud: "💰", spicy: 2, tags: ["辣", "香"] },
  "长沙米粉": { w: 0.6, meal: true, bud: "💰", spicy: 2, tags: ["辣", "香"] }, "沙县拌面": { w: 0.6, meal: true, bud: "💰", tags: ["酱香"] },
  "贵州羊肉粉": { w: 0.6, meal: true, bud: "💰", spicy: 2, tags: ["辣", "肉"] }, "云南饵丝": { w: 0.6, meal: true, bud: "💰", tags: ["鲜", "香"] },
  "新疆拌面": { w: 0.6, meal: true, tags: ["香", "肉"] }, "酸汤面": { w: 0.6, meal: true, tags: ["酸"] },
  "冷面": { w: 0.6, meal: true, tags: ["酸甜", "凉"] }, "阳春面": { w: 0.6, meal: true, tags: ["家常", "清淡"] },
  "清汤面": { w: 0.6, meal: true, tags: ["家常", "清淡"] }, "羊肉粉": { w: 0.5, meal: true, tags: ["鲜", "肉"] },
  "日式乌冬面": { w: 0.5, meal: true, tags: ["家常"] }, "豚骨拉面": { w: 0.5, meal: true, tags: ["家常"] },
  "意式肉酱面": { w: 0.45, meal: true, tags: ["酱香", "肉"] }, "酸菜炖粉条": { w: 0.4, meal: true, tags: ["酸", "家常"] },
  "福建炒面": { w: 0.35, meal: true, tags: ["鲜", "香"] }, "厦门炒面线": { w: 0.3, meal: true, tags: ["鲜", "香"] },
  "福州拌面": { w: 0.3, meal: true, tags: ["酱香"] }, "炒河粉": { w: 0.7, meal: true, tags: ["香", "鲜"] },
  "柬埔寨金边粉": { off: true }, "叻沙米粉": { off: true }, "冬阴功汤面": { off: true }, "越南河粉": { off: true },
  "香炒河粉": { off: true }, "和风炸酱面": { off: true }, "炒面": { off: true },
})

Object.assign(O, { // 配菜（多为不成餐小菜/凉菜，低权重供凑一桌）
  "炸茄盒": { w: 0.2, meal: false, tags: ["酥脆"] }, "炸藕盒": { w: 0.2, meal: false, tags: ["酥脆"] },
  "炸蘑菇": { w: 0.2, meal: false, tags: ["酥脆", "素"] }, "小酥肉": { w: 0.25, meal: false, tags: ["酥脆", "肉"] },
  "炸鱿鱼": { w: 0.2, meal: false, tags: ["鲜", "海鲜"] }, "烤虾": { w: 0.2, meal: false, tags: ["鲜", "海鲜"] },
  "烤扇贝": { w: 0.2, meal: false, bud: "💰💰", tags: ["鲜", "海鲜"] }, "烤鱿鱼": { w: 0.2, meal: false, tags: ["鲜", "海鲜"] },
  "烤生蚝": { w: 0.2, meal: false, bud: "💰💰", tags: ["鲜", "海鲜"] }, "烤玉米": { w: 0.2, meal: false, tags: ["甜", "素"] },
  "烤香菇": { w: 0.15, meal: false, tags: ["香", "素"] }, "烤豆腐": { w: 0.15, meal: false, tags: ["香", "素"] },
  "烤茄子": { w: 0.2, meal: false, tags: ["素"] }, "烤土豆": { w: 0.15, meal: false, tags: ["香", "素"] },
  "烤红薯": { w: 0.2, meal: false, tags: ["甜", "素"] }, "烤金针菇": { w: 0.2, meal: false, tags: ["香", "素"] },
  "蒸南瓜": { w: 0.15, meal: false, tags: ["甜", "清淡", "素"] }, "蒸红薯": { w: 0.15, meal: false, tags: ["甜", "清淡", "素"] },
  "蒸紫薯": { w: 0.15, meal: false, tags: ["甜", "清淡", "素"] }, "蒸山药": { w: 0.15, meal: false, tags: ["清淡", "素"] },
  "蒸玉米": { w: 0.15, meal: false, tags: ["甜", "清淡", "素"] }, "煮玉米": { w: 0.15, meal: false, tags: ["甜", "清淡", "素"] },
  "水蒸蛋": { w: 0.2, meal: false, tags: ["清淡", "蛋"] }, "蒸蛋羹": { w: 0.2, meal: false, tags: ["清淡", "蛋"] },
  "煎蛋": { w: 0.2, meal: false, tags: ["蛋"] }, "溏心蛋": { w: 0.2, meal: false, tags: ["蛋"] },
  "卤蛋": { w: 0.2, meal: false, tags: ["酱香", "蛋"] }, "茶叶蛋": { w: 0.15, meal: false, tags: ["香", "蛋"] },
  "小葱拌豆腐": { w: 0.2, meal: false, tags: ["凉", "清淡", "素"] }, "拍黄瓜": { w: 0.25, meal: false, spicy: 1, tags: ["凉", "清淡", "素"] },
  "凉拌黄瓜": { w: 0.2, meal: false, tags: ["凉", "清淡", "素"] }, "凉拌木耳": { w: 0.2, meal: false, tags: ["凉", "清淡", "素"] },
  "皮蛋豆腐": { w: 0.25, meal: false, tags: ["凉", "清淡", "素"] }, "酸辣白菜": { w: 0.2, meal: false, spicy: 2, tags: ["酸辣", "素"] },
  "白灼菜心": { w: 0.2, meal: false, tags: ["清淡", "素"] }, "虎皮青椒": { w: 0.2, meal: false, spicy: 2, tags: ["辣", "素"] },
  "醋溜土豆丝": { w: 0.25, meal: false, tags: ["酸", "素"] }, "清炒时蔬": { w: 0.2, meal: false, tags: ["清淡", "素"] },
  "干煸四季豆": { w: 0.25, meal: false, spicy: 1, tags: ["辣", "素"] }, "蚝油生菜": { w: 0.2, meal: false, tags: ["清淡", "素"] },
  "蒜蓉西兰花": { w: 0.2, meal: false, tags: ["清淡", "素"] }, "蒜蓉茄子": { w: 0.2, meal: false, tags: ["素"] },
  "蒜蓉开边虾": { w: 0.2, meal: false, tags: ["鲜", "海鲜"] }, "白灼虾": { w: 0.2, meal: false, tags: ["鲜", "清淡", "海鲜"] },
  "椒盐虾": { w: 0.2, meal: false, tags: ["香", "鲜", "海鲜"] }, "蒜蓉粉丝蒸虾": { w: 0.2, meal: false, tags: ["鲜", "海鲜"] },
  "蒜蓉粉丝扇贝": { w: 0.2, meal: false, bud: "💰💰", tags: ["鲜", "海鲜"] }, "土豆泥": { w: 0.15, meal: false, tags: ["清淡"] },
  "萝卜丸子": { w: 0.15, meal: false, tags: ["香", "素"] }, "卤味": { w: 0.2, meal: false, tags: ["香", "酱香"] },
})

Object.assign(O, { // 小吃点心（早餐激活/零食低权/能成餐者 meal:true）
  "毛豆": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["咸", "清淡"] }, "煮花生": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["咸", "清淡"] },
  "炸春卷": { w: 0.25, meal: false, mp: ["夜宵", "加餐"], tags: ["香", "酥脆"] }, "脆皮烤肠": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["酥脆", "肉"] },
  "烤香肠": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["肉"] }, "烤肠": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["肉"] },
  "淀粉肠": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["热食"] }, "玉米片": { w: 0.15, meal: false, mp: ["夜宵", "加餐"], tags: ["甜", "酥脆"] },
  "章鱼丸子": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["酱香", "海鲜"] }, "章鱼小丸子": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["鲜", "海鲜"] },
  "天妇罗": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], tags: ["鲜", "酥脆"] }, "土豆饼": { w: 0.2, meal: false, mp: ["早餐", "加餐"], tags: ["香", "素"] },
  "虾饺": { w: 0.25, meal: false, mp: ["早餐", "加餐"], tags: ["鲜", "海鲜", "清淡"] },
  "鸡爪": { w: 0.25, meal: false, mp: ["夜宵", "加餐"], spicy: 2, tags: ["辣", "肉"] }, "鸭锁骨": { w: 0.25, meal: false, mp: ["夜宵", "加餐"], spicy: 2, tags: ["辣", "香", "肉"] },
  "鸭脖": { w: 0.3, meal: false, mp: ["夜宵", "加餐"], spicy: 2, tags: ["辣", "香", "肉"] }, "泡椒凤爪": { w: 0.25, meal: false, mp: ["夜宵", "加餐"], spicy: 2, tags: ["辣", "酸", "肉"] },
  "柠檬凤爪": { w: 0.2, meal: false, mp: ["夜宵", "加餐"], spicy: 2, tags: ["酸", "辣", "肉"] },
  "臭豆腐": { w: 0.25, meal: false, mp: ["夜宵", "加餐"], tags: ["香", "素"] }, "长沙臭豆腐": { w: 0.3, meal: false, mp: ["夜宵", "加餐"], spicy: 2, tags: ["辣", "素"] },
  "油酥烧饼": { w: 0.5, meal: true, mp: ["早餐"], tags: ["香", "酥脆"] }, "烧饼": { w: 0.5, meal: true, mp: ["早餐"], tags: ["香", "酥脆"] },
  "芝麻烧饼": { w: 0.5, meal: true, mp: ["早餐"], tags: ["香", "酥脆"] }, "油条": { w: 0.55, meal: true, mp: ["早餐"], tags: ["家常", "酥脆"] },
  "豆浆油条套餐": { w: 0.6, meal: true, mp: ["早餐"], tags: ["家常", "酥脆"] }, "煎饼果子": { w: 0.65, meal: true, mp: ["早餐"], tags: ["家常", "酥脆"] },
  "杂粮煎饼": { w: 0.55, meal: true, mp: ["早餐"], tags: ["香", "酥脆"] }, "鸡蛋灌饼": { w: 0.6, meal: true, mp: ["早餐"], tags: ["家常", "酥脆", "蛋"] },
  "手抓饼": { w: 0.6, meal: true, mp: ["早餐"], tags: ["家常", "酥脆"] }, "葱油饼": { w: 0.55, meal: true, mp: ["早餐"], tags: ["香", "酥脆"] },
  "酱香饼": { w: 0.5, meal: true, mp: ["早餐", "加餐"], tags: ["酱香", "酥脆"] }, "韭菜盒子": { w: 0.5, meal: true, mp: ["早餐", "午餐"], tags: ["香", "素"] },
  "锅盔": { w: 0.45, meal: true, mp: ["早餐"], tags: ["香", "酥脆"] }, "梅干菜锅盔": { w: 0.45, meal: true, mp: ["早餐"], tags: ["咸", "酥脆"] },
  "火烧": { w: 0.45, meal: true, mp: ["早餐"], tags: ["香", "肉"] }, "馒头": { w: 0.45, meal: true, mp: ["早餐"], tags: ["家常", "清淡"] },
  "花卷": { w: 0.45, meal: true, mp: ["早餐"], tags: ["家常", "香", "清淡"] }, "鲜肉包": { w: 0.5, meal: true, mp: ["早餐", "加餐"], tags: ["肉", "家常"] },
  "菜包": { w: 0.45, meal: true, mp: ["早餐", "加餐"], tags: ["素", "家常", "清淡"] }, "豆腐脑": { w: 0.45, meal: true, mp: ["早餐"], tags: ["咸", "素", "清淡"] },
  "肠粉": { w: 0.55, meal: true, mp: ["早餐"], tags: ["鲜", "清淡"] }, "武汉豆皮": { w: 0.55, meal: true, mp: ["早餐", "午餐"], tags: ["香", "酥脆"] },
  "生煎包": { w: 0.6, meal: true, mp: ["早餐"], tags: ["鲜", "酥脆", "肉"] }, "锅贴": { w: 0.55, meal: true, mp: ["早餐"], tags: ["香", "酥脆", "肉"] },
  "鸡蛋饼": { w: 0.5, meal: true, mp: ["早餐"], tags: ["家常", "蛋"] }, "小笼包": { w: 0.6, meal: true, mp: ["早餐"], tags: ["鲜"] },
  "灌汤包": { w: 0.6, meal: true, mp: ["早餐"], tags: ["鲜"] }, "烧麦": { w: 0.6, meal: true, mp: ["早餐"], tags: ["香", "肉"] },
  "粽子": { w: 0.45, meal: true, mp: ["早餐"], tags: ["咸", "糯"] }, "扁肉": { w: 0.5, meal: true, mp: ["早餐", "午餐", "晚餐"], tags: ["鲜", "肉"] },
  "馄饨": { w: 0.6, meal: true, mp: ["早餐", "午餐", "晚餐", "夜宵"], tags: ["鲜", "清淡"] }, "云吞": { w: 0.6, meal: true, mp: ["早餐", "午餐", "晚餐", "夜宵"], tags: ["鲜", "清淡"] },
  "抄手": { w: 0.55, meal: true, mp: ["午餐", "晚餐", "夜宵"], spicy: 2, tags: ["辣", "鲜"] }, "红油抄手": { w: 0.55, meal: true, mp: ["午餐", "晚餐", "夜宵"], spicy: 2, tags: ["辣", "香"] },
  "龙抄手": { w: 0.55, meal: true, mp: ["午餐", "晚餐", "夜宵"], tags: ["鲜"] }, "钟水饺": { w: 0.55, meal: true, mp: ["午餐", "晚餐"], spicy: 1, tags: ["甜辣"] },
  "肉夹馍": { w: 0.65, meal: true, mp: ["早餐", "午餐"], tags: ["家常", "肉"] }, "驴肉火烧": { w: 0.6, meal: true, mp: ["早餐", "午餐"], tags: ["香", "肉"] },
  "肉火烧": { w: 0.6, meal: true, mp: ["早餐", "午餐"], tags: ["家常", "肉"] }, "煎饼": { w: 0.4, meal: true, mp: ["早餐"], tags: ["家常", "素", "酥脆"] },
  "烤冷面": { w: 0.35, meal: false, mp: ["夜宵", "加餐"], tags: ["香", "热食"] },
})

Object.assign(O, { // 汤粥炖品
  "皮蛋瘦肉粥": { w: 0.65, meal: true, mp: ['早餐', '夜宵'], tags: ['鲜', '咸'] },
  "小米粥": { w: 0.35, meal: true, mp: ['早餐'], tags: ['清淡', '素'] }, "绿豆粥": { w: 0.35, meal: true, mp: ['早餐'], tags: ['清淡', '素'] },
  "红豆薏米粥": { w: 0.4, meal: true, mp: ['早餐'], tags: ['甜', '清淡', '素'] }, "燕麦粥": { w: 0.45, meal: true, mp: ['早餐'], tags: ['清淡', '素'] },
  "紫薯粥": { w: 0.3, meal: true, mp: ['早餐'], tags: ['甜', '清淡', '素'] }, "胡辣汤": { w: 0.5, meal: true, mp: ['早餐'], spicy: 2, tags: ['辣'] },
  "蛋花汤": { w: 0.2, meal: false, tags: ['清淡', '蛋'] }, "黄瓜蛋汤": { w: 0.2, meal: false, tags: ['清淡', '素'] },
  "番茄蛋汤": { w: 0.2, meal: false, tags: ['酸', '蛋'] }, "西红柿鸡蛋汤": { w: 0.2, meal: false, tags: ['酸', '清淡'] },
  "紫菜蛋花汤": { w: 0.2, meal: false, tags: ['鲜', '清淡', '蛋'] }, "丝瓜蛋汤": { w: 0.2, meal: false, tags: ['鲜', '清淡', '素'] },
  "青菜蛋汤": { w: 0.2, meal: false, tags: ['清淡', '素'] }, "白菜豆腐汤": { w: 0.2, meal: false, tags: ['清淡', '素'] },
  "冬瓜丸子汤": { w: 0.2, meal: false, tags: ['清淡', '肉'] }, "南瓜汤": { w: 0.2, meal: false, tags: ['甜', '清淡', '素'] },
  "蘑菇汤": { w: 0.2, meal: false, tags: ['鲜', '清淡', '素'] }, "味噌蔬菜汤": { w: 0.2, meal: false, tags: ['酱香', '清淡', '素'] },
  "蔬菜汤": { w: 0.2, meal: false, tags: ['清淡', '素'] }, "奶油蘑菇汤": { w: 0.2, meal: false, tags: ['奶香', '清淡'] },
  "番茄蔬菜汤": { w: 0.2, meal: false, tags: ['酸', '清淡', '素'] }, "玉米浓汤": { w: 0.2, meal: false, tags: ['甜', '清淡'] },
  "罗宋汤": { w: 0.25, meal: false, tags: ['酸甜', '肉'] }, "酸辣汤": { w: 0.25, meal: false, spicy: 2, tags: ['酸辣', '辣'] },
  "肉丸汤": { w: 0.2, meal: false, tags: ['鲜', '肉'] },
  "玉米排骨汤": { w: 0.55, meal: true, tags: ['甜', '鲜', '肉'] }, "山药排骨汤": { w: 0.55, meal: true, tags: ['滋补', '清淡', '肉'] },
  "莲藕排骨汤": { w: 0.55, meal: true, tags: ['鲜', '肉'] }, "冬瓜排骨汤": { w: 0.5, meal: true, tags: ['清淡', '鲜', '肉'] },
  "椰子鸡汤": { w: 0.6, meal: true, bud: '💰💰', tags: ['鲜', '甜', '肉'] }, "虫草花鸡汤": { w: 0.55, meal: true, bud: '💰💰', tags: ['滋补', '清淡', '肉'] },
  "萝卜牛腩汤": { w: 0.65, meal: true, bud: '💰💰', tags: ['鲜', '肉'] }, "鱼头豆腐汤": { w: 0.65, meal: true, bud: '💰💰', tags: ['鲜', '海鲜'] },
  "豆腐鱼汤": { w: 0.55, meal: true, tags: ['鲜', '海鲜'] }, "鲫鱼豆腐汤": { w: 0.55, meal: true, tags: ['鲜', '清淡', '海鲜'] },
  "关东煮": { w: 0.5, meal: true, bud: '💰💰', tags: ['鲜'] },
})

Object.assign(O, { // 火锅冒菜 + 烧烤
  "四川火锅": { w: 0.4, meal: true, bud: '💰💰💰', spicy: 2, tags: ['辣', '麻辣', '适合聚餐'] }, "重庆火锅": { w: 0.4, meal: true, bud: '💰💰💰', spicy: 2, tags: ['辣', '麻辣', '适合聚餐'] },
  "猪肚鸡火锅": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['鲜', '滋补', '肉'] }, "潮汕牛肉火锅": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['鲜', '肉'] },
  "牛肉火锅": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['鲜', '肉'] }, "老北京涮羊肉": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['清淡', '肉'] },
  "菌菇火锅": { w: 0.35, meal: true, bud: '💰💰💰', tags: ['鲜', '素'] }, "椰子鸡火锅": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['鲜', '清淡', '肉'] },
  "番茄火锅": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['酸甜', '适合聚餐'] }, "酸菜鱼火锅": { w: 0.38, meal: true, bud: '💰💰💰', tags: ['酸', '鲜', '海鲜'] },
  "串串香": { w: 0.4, meal: true, bud: '💰💰', spicy: 2, tags: ['辣', '麻辣', '适合聚餐'] }, "韩式部队锅": { w: 0.38, meal: true, bud: '💰💰💰', spicy: 2, tags: ['辣', '适合聚餐'] },
  "花胶鸡火锅": { w: 0.2, meal: true, bud: '💰💰💰', tags: ['鲜', '滋补', '肉', '海鲜'] },
  "东北烧烤": { w: 0.4, meal: true, bud: '💰💰💰', tags: ['香', '肉', '适合聚餐'] }, "自助烧烤": { w: 0.35, meal: true, bud: '💰💰💰', tags: ['肉', '适合聚餐'] },
  "户外烧烤": { w: 0.35, meal: true, bud: '💰💰💰', tags: ['肉', '适合聚餐'] }, "新疆烧烤": { w: 0.4, meal: true, bud: '💰💰💰', tags: ['香', '肉', '适合聚餐'] },
  "铁板烧": { w: 0.38, meal: true, bud: '💰💰', tags: ['肉'] }, "烤肉": { w: 0.4, meal: true, bud: '💰💰', tags: ['香', '肉'] },
  "烤五花肉": { w: 0.35, meal: true, bud: '💰💰', tags: ['香', '肉'] }, "烤牛肉": { w: 0.35, meal: true, bud: '💰💰', tags: ['肉'] },
  "烤羊肉串": { w: 0.18, meal: false, bud: '💰💰', tags: ['香', '肉'] }, "烤鸡心": { w: 0.15, meal: false, tags: ['肉'] }, "烤牛肉串": { w: 0.15, meal: false, tags: ['肉'] },
  "烤全羊": { off: true }, "烤乳猪": { off: true }, "烤羊腿": { off: true }, "烤羊排": { off: true },
  "鸡公煲": { w: 0.38, meal: true, bud: '💰💰', spicy: 2, tags: ['辣', '香', '肉', '适合聚餐'] }, "重庆鸡公煲": { w: 0.38, meal: true, bud: '💰💰', spicy: 2, tags: ['辣', '适合聚餐'] },
})

Object.assign(O, { // 西式 / 日韩 / 东南亚 / 甜品饮品 / 轻食
  "卷饼": { w: 0.35, meal: true, spicy: 1, tags: ['辣', '肉'] }, "热狗": { w: 0.35, meal: true, tags: ['肉'] }, "披萨": { w: 0.55, meal: true },
  "烤猪排": { w: 0.4, meal: true, tags: ['肉'] }, "烤三文鱼": { w: 0.35, meal: true, bud: '💰💰💰', tags: ['鲜', '海鲜'] },
  "咸味法式可丽饼": { off: true }, "辣椒船": { off: true }, "香肠": { w: 0.2, meal: false, tags: ['肉'] },
  "鱼排汉堡": { w: 0.45, meal: true, tags: ['鲜', '海鲜'] }, "玉米卷饼": { off: true }, "双层牛肉汉堡": { w: 0.5, meal: true, tags: ['肉', '饱腹'] },
  "香煎鳕鱼": { off: true }, "烤春鸡": { off: true }, "香煎牛排": { w: 0.4, meal: true, bud: '💰💰💰', tags: ['肉'] }, "汉堡": { w: 0.5, meal: true, tags: ['肉'] },
  "盐烤青花鱼": { off: true }, "大阪烧（御好烧）": { w: 0.4, meal: true, tags: ['酱香'] }, "日式炒乌冬": { w: 0.5, meal: true, tags: ['酱香'] },
  "炸猪排": { w: 0.45, meal: true, tags: ['酥脆', '肉'] }, "炒年糕": { w: 0.45, meal: true, spicy: 1, tags: ['辣', '软糯'] }, "烤鳗鱼": { w: 0.4, meal: true, tags: ['甜', '鲜', '海鲜'] },
  "烤年糕": { w: 0.25, meal: false, tags: ['甜', '软糯'] },
  "海南鸡饭": { w: 0.45, meal: true, tags: ['清淡', '肉'] }, "越南春卷": { off: true }, "沙嗲": { off: true }, "咖喱炒饭": { w: 0.45, meal: true, tags: ['香'] },
  "肉骨茶套餐": { off: true }, "咖喱鸡": { w: 0.4, meal: true, tags: ['香', '肉'] },
  "绿豆饼": { w: 0.2, meal: false, tags: ['甜', '酥脆', '素'] }, "炸糕": { w: 0.2, meal: false, tags: ['甜', '软糯'] }, "麻团": { w: 0.2, meal: false, tags: ['甜', '软糯'] },
  "炸麻球": { w: 0.2, meal: false, tags: ['甜', '酥脆'] }, "糖葫芦": { w: 0.2, meal: false, tags: ['甜', '酸'] }, "咸豆浆": { w: 0.2, meal: false, mp: ['早餐'], tags: ['咸', '素'] },
  "驴打滚": { w: 0.2, meal: false, tags: ['甜', '软糯'] }, "糖火烧": { w: 0.2, meal: false, tags: ['甜'] }, "华夫饼": { w: 0.2, meal: false, tags: ['甜'] },
  "芸豆卷": { w: 0.15, meal: false, tags: ['甜', '素'] }, "糖糕": { w: 0.2, meal: false, tags: ['甜', '酥脆'] }, "豌豆黄": { w: 0.15, meal: false, tags: ['甜', '素'] },
  "桂花糕": { w: 0.15, meal: false, tags: ['甜', '香'] }, "可丽饼": { w: 0.2, meal: false, tags: ['甜'] }, "松饼": { w: 0.2, meal: false, tags: ['甜'] },
  "糯米糕": { w: 0.2, meal: false, tags: ['甜', '软糯'] }, "爆米花": { w: 0.15, meal: false, tags: ['甜', '酥脆'] }, "棉花糖": { w: 0.1, meal: false, tags: ['甜'] },
  "艾窝窝": { w: 0.15, meal: false, tags: ['甜', '软糯'] }, "水果碗": { w: 0.2, meal: false, tags: ['甜', '素'] }, "豆浆": { w: 0.2, meal: false, mp: ['早餐'], tags: ['素'] },
  "燕麦碗": { w: 0.3, meal: true, tags: ['素', '饱腹', '清淡'] }, "三明治": { w: 0.35, meal: true, tags: ['清淡'] }, "吐司": { w: 0.25, meal: true, tags: ['甜', '清淡'] },
  "蔬菜沙拉": { w: 0.25, meal: true, tags: ['素', '清淡'] }, "酸奶碗": { w: 0.2, meal: false, tags: ['甜', '酸', '清淡'] },
})

// ===== apply =====
const seenName = new Set(foods.map(f => f.name))
const seenId = new Set(foods.map(f => f._id))
let normed = 0, off = 0, changed = 0, added = 0
const out = foods.map(f => {
  const g = { ...f }
  const nc = normCat(g); if (nc !== g.category) { g.category = nc; normed++ }
  if (g.time !== '快' && g.time !== '慢') g.time = '慢' // 归一非法 time（如新增菜误填的"一般"）
  if (FORCE_OFF.has(g.name) || OFF_FUZZY.some(s => g.name.includes(s))) {
    g.defaultPoolWeight = 0; g.enabled = false; off++
  } else if (O[g.name]) {
    const ov = O[g.name]
    if (ov.off) {
      g.defaultPoolWeight = 0; g.enabled = false; off++
    } else {
      if (ov.w != null) { g.defaultPoolWeight = ov.w; g.enabled = true }
      if (ov.meal != null) g.canBeMeal = ov.meal
      if (ov.bud) g.budget = ov.bud
      if (ov.spicy != null) g.spicyLevel = ov.spicy
      if (ov.tags) g.tags = Array.from(new Set([...(g.tags || []), ...ov.tags]))
      if (ov.mp) { // 子代理 mp 偶有非数组/非时段噪声（如 "正餐"）→ 归一为合法时段
        const VALID = ['早餐', '午餐', '晚餐', '夜宵', '加餐']
        const arr = (Array.isArray(ov.mp) ? ov.mp : [ov.mp]).filter(p => VALID.includes(p))
        if (arr.length) g.mealPeriods = Array.from(new Set([...arr, ...(g.mealPeriods || [])]))
      }
      // 不变量兜底：非成餐项权重 ≤ 0.3（防子代理给素/凉/汤过高的单抽权重）
      if (g.canBeMeal === false && g.defaultPoolWeight > 0.3) g.defaultPoolWeight = 0.3
    }
  }
  if (JSON.stringify(g) !== JSON.stringify(f)) changed++
  return g
})

// ===== Task 5 新增菜：45 道家常菜真缺口（time 的"一般"由上面的 time 归一兜底）=====
const NEW_FOODS = [
{"_id":"4aa7669bf93f3d35","name":"韭菜炒鸡蛋","emoji":"🥚","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.65,"spicyLevel":0,"enabled":true},
{"_id":"937fcc968f2d9e59","name":"木耳炒鸡蛋","emoji":"🥚","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.65,"spicyLevel":0,"enabled":true},
{"_id":"4ada40e1df8c6a3f","name":"虾仁炒鸡蛋","emoji":"🥚","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.75,"spicyLevel":0,"enabled":true},
{"_id":"5597d452bc438b3b","name":"辣椒炒鸡蛋","emoji":"🥚","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","辣","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.65,"spicyLevel":1,"enabled":true},
{"_id":"a1c23b0d98d2f48d","name":"苦瓜炒鸡蛋","emoji":"🥚","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.6,"spicyLevel":0,"enabled":true},
{"_id":"bb9f397c6086ba5a","name":"黄瓜炒鸡蛋","emoji":"🥚","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.65,"spicyLevel":0,"enabled":true},
{"_id":"d7286c43ec411ec4","name":"芹菜炒肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"cff774aa86077fe2","name":"洋葱炒肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"7abd36e4cda4295f","name":"莴笋炒肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"8785791411300089","name":"荷兰豆炒肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"77a09a4c5cd9f26b","name":"苦瓜炒肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.65,"spicyLevel":0,"enabled":true},
{"_id":"a5339b0469530732","name":"香干炒肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"5a6eea009c3de544","name":"青椒炒牛肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.75,"spicyLevel":1,"enabled":true},
{"_id":"dcf0e7fbf0400975","name":"洋葱炒牛肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.75,"spicyLevel":0,"enabled":true},
{"_id":"300da34051f350b7","name":"芹菜炒牛肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.75,"spicyLevel":0,"enabled":true},
{"_id":"e8a84115aa5adf5f","name":"孜然牛肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","香辣","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.8,"spicyLevel":2,"enabled":true},
{"_id":"01fbec6d70e3b90a","name":"葱爆羊肉","emoji":"🥩","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.8,"spicyLevel":0,"enabled":true},
{"_id":"7b60ceb071e93027","name":"肉末豆腐","emoji":"🫘","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"1cc3eaea93a6c988","name":"红烧豆腐","emoji":"🫘","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"a4d275bc8d830b14","name":"香煎豆腐","emoji":"🫘","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.2,"spicyLevel":0,"enabled":true},
{"_id":"8e513cea45911ed3","name":"家常豆腐","emoji":"🫘","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
{"_id":"047e2baeb247bd3f","name":"剁椒鱼头","emoji":"🐟","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰💰","time":"慢","tags":["家常","辣","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":2,"enabled":true},
{"_id":"9f1eb9afea21a253","name":"香煎带鱼","emoji":"🐟","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.75,"spicyLevel":0,"enabled":true},
{"_id":"3f4cac193711cb82","name":"红烧带鱼","emoji":"🐟","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.8,"spicyLevel":0,"enabled":true},
{"_id":"3da6beddca3600f1","name":"土豆烧排骨","emoji":"🍖","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":0,"enabled":true},
{"_id":"b9767e322ee0a9f1","name":"豆角烧排骨","emoji":"🍖","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":0,"enabled":true},
{"_id":"b1697e8e15fcaf53","name":"萝卜炖牛肉","emoji":"🍖","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":0,"enabled":true},
{"_id":"4c54e7ad624e9cf1","name":"香菇炖鸡","emoji":"🍗","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":0,"enabled":true},
{"_id":"d627f7d7f15975ea","name":"红烧鸡翅","emoji":"🍗","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":0,"enabled":true},
{"_id":"a66ab2dc12fa5511","name":"土豆烧鸡块","emoji":"🍗","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.85,"spicyLevel":0,"enabled":true},
{"_id":"a388de79b3e7a2a9","name":"酸辣土豆丝","emoji":"🥔","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","辣","素","清淡"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.25,"spicyLevel":1,"enabled":true},
{"_id":"a3e3fd2679f7e2a1","name":"醋溜白菜","emoji":"🥬","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.2,"spicyLevel":0,"enabled":true},
{"_id":"639f816fa6eef456","name":"蒜蓉空心菜","emoji":"🥬","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.2,"spicyLevel":0,"enabled":true},
{"_id":"3ddcb57c3340443f","name":"清炒油麦菜","emoji":"🥬","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.2,"spicyLevel":0,"enabled":true},
{"_id":"590942a2d12491b5","name":"清炒豆芽","emoji":"🌱","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.15,"spicyLevel":0,"enabled":true},
{"_id":"33e9968517d70d24","name":"香菇青菜","emoji":"🥬","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.2,"spicyLevel":0,"enabled":true},
{"_id":"bb7e931cc621c244","name":"清炒小白菜","emoji":"🥬","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.15,"spicyLevel":0,"enabled":true},
{"_id":"4ba727006904b361","name":"蒜蓉生菜","emoji":"🥬","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.15,"spicyLevel":0,"enabled":true},
{"_id":"db3bdbe5ebb6a507","name":"凉拌海带丝","emoji":"🌿","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"凉菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.15,"spicyLevel":0,"enabled":true},
{"_id":"70e998bf2ce608ba","name":"凉拌腐竹","emoji":"🌿","category":"配菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"凉菜","mealRole":"配菜","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.15,"spicyLevel":0,"enabled":true},
{"_id":"afd49d5993ee663a","name":"西兰花炒虾仁","emoji":"🥦","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.75,"spicyLevel":0,"enabled":true},
{"_id":"3c6e91b605b99cfe","name":"青椒炒香干","emoji":"🥬","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","鲜香","素"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.65,"spicyLevel":0,"enabled":true},
{"_id":"e332c0e44a518199","name":"萝卜排骨汤","emoji":"🍲","category":"汤粥炖品","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"汤","mealRole":"汤品","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.5,"spicyLevel":0,"enabled":true},
{"_id":"b775bad75af989c4","name":"冬瓜虾皮汤","emoji":"🍲","category":"汤粥炖品","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"快","tags":["家常","清淡","素"],"cuisine":"中式料理","foodType":"汤","mealRole":"汤品","canBeMeal":false,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.2,"spicyLevel":0,"enabled":true},
{"_id":"d50d2164e1d74237","name":"农家一碗香","emoji":"🥘","category":"家常菜","scene":"自己做","scenes":["自己做","外卖","食堂"],"budget":"💰","time":"慢","tags":["家常","鲜香","肉"],"cuisine":"中式料理","foodType":"热菜","mealRole":"正餐","canBeMeal":true,"mealPeriods":["午餐","晚餐"],"defaultPoolWeight":0.7,"spicyLevel":0,"enabled":true},
]
for (const nf of NEW_FOODS) {
  if (seenName.has(nf.name) || seenId.has(nf._id)) continue // 幂等：已存在则跳过
  out.push(nf); seenName.add(nf.name); seenId.add(nf._id); added++
}

const inPool = out.filter(f => (f.defaultPoolWeight || 0) > 0 && f.enabled !== false).length
console.log(`归一 ${normed} | 出池 ${off} | 改动记录 ${changed} | 新增 ${added} | 总 ${out.length} | 池内 ${inPool}`)
if (DRY) {
  console.log('--dry：未写回')
} else {
  fs.writeFileSync(FOODS_PATH, 'module.exports = ' + JSON.stringify(out, null, 2) + '\n')
  console.log('已写回 data/foods.js')
}
