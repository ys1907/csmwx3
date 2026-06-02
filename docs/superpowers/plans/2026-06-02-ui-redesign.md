# 盲盒首页重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页改造为「点盒子才揭晓」的盲盒，配「奶油恋人」视觉与 R/SR/SSR 三档揭晓动画，并精简掉转盘/塔罗/PK。

**Architecture:** 纯逻辑（`rollRarity`）放 `utils/foodLogic.js` 可单测；首页 `pages/index/` 重构为「盲盒态↔揭晓态」状态机 + 「我的」tab；揭晓动画用 WXSS keyframes + class 切换驱动（不逐帧 setData）；视觉集中在 `app.wxss` token。

**Tech Stack:** 原生微信小程序 WXML/WXSS/JS；测试 `node --test utils/*.test.js`（Node≥18）。

**全局约定：**
- 每条 `git commit` 末尾追加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **文件改动一律用 Edit/Write 工具**（本环境沙箱隔离 node 对工作区的写入，node 脚本改不动真实文件）；**git 命令用 `dangerouslyDisableSandbox: true`**。
- 提交只 `git add` 各任务列出的文件，禁止 `git add -A`。当前分支 `docs/add-readme`（非 main）。
- 基线：`npm test` 当前 **62 pass / 1 fail**，唯一失败是 `pageLifecycle.test.js` 的「index storage: 连续换推荐不重复读缓存」——**与本重构无关，勿动**。每个任务验收标准是「不新增失败」。
- 视觉/动画任务（T1、T3、T4、T6、T7、T8）实现前 **invoke `ui-ux-pro-max`** 获取落地指导，并对照 `.superpowers/brainstorm/ui-redesign/`（mockup 01~13）与 spec 调视觉；页面层无单测，验证 = `npm test` 不回归 + 预览面板/真机视觉对照。

---

## File Structure

| 文件 | 职责 | 改动 |
|---|---|---|
| `app.wxss` | design token | 改写 page{} 语义色为奶油恋人；新增 token |
| `utils/foodLogic.js` | 纯逻辑 | 新增 `rollRarity(rng)` + 导出 |
| `utils/foodLogic.test.js` | 单测 | 新增 rollRarity 用例 |
| `pages/index/index.js` | 首页编排 | 重构为盲盒态↔揭晓态 + 我的 tab；接 rollRarity；移除转盘/塔罗/PK handler |
| `pages/index/index.wxml` | 首页结构 | 盲盒卡 / 揭晓菜卡 / 卡外操作 / 凑一桌入口 / 我的 tab / 移除旧玩法 |
| `pages/index/index.wxss` | 首页样式 | 奶油恋人布局 + 三档揭晓 keyframes + 移除旧玩法样式 |
| `data/sounds.js` | 音效 | （可选）揭晓分档音效，未决项，本期可不动 |

`pages/manage/` 不在本计划改动（仅首页跳转入口指向它）。

---

## Task 1: app.wxss 视觉 token → 「奶油恋人」

**Files:** Modify `app.wxss`（page{} 语义色块，约 6-79 行）

实现前 invoke `ui-ux-pro-max`（主题：把奶油恋人配色落到 design token）。无单测，验证靠预览/真机。

- [ ] **Step 1: 替换 page{} 的颜色 token**

把 `app.wxss` 中 `page { ... }` 内的「背景/卡片/填充」「语义色」「文字」「历史玻璃别名」相关变量值替换为下面这套（**保留变量名不变**，仅改值；圆角/字号/动效/字体保持原样）：

```css
  /* ===== 背景 / 卡片 / 填充 ===== */
  --page-bg: #FCF7F1;
  --card-bg: #FFFFFF;
  --fill-subtle: rgba(74, 63, 58, 0.06);
  --fill-hover: rgba(74, 63, 58, 0.12);
  --separator: #EFE7DD;

  /* ===== 语义色（奶油恋人：暖橙=行动 / 柔粉=情侣收藏 / 薄荷=清新标签）===== */
  --primary: #FF9466;            /* 行动与食物 */
  --primary-soft: rgba(255, 148, 102, 0.12);
  --primary-glow: rgba(255, 148, 102, 0.25);
  --primary-deep: #FF7A45;
  --secondary: #9FD8C8;          /* 薄荷：清新标签 */
  --secondary-soft: #E6F4EF;
  --food-accent: #FF9466;
  --food-soft: rgba(255, 148, 102, 0.14);
  --pink: #EBA9C4;               /* 柔粉：收藏 / 情侣 */
  --pink-soft: #FBEAF1;
  --mint: #9FD8C8;
  --mint-soft: #E6F4EF;
  --gold: #FFC36B;               /* SSR 专用 */
  --gold-deep: #F5A623;
  --gold-light: #FFE7BE;
  --success: #34C759;
  --danger: #FF3B30;
  --blue-accent: #9FD8C8;
  --blue-soft: #E6F4EF;
  --orange-accent: #FF9466;
  --orange-soft: rgba(255, 148, 102, 0.14);

  /* ===== 文字 ===== */
  --text-primary: #4A3F3A;
  --text-secondary: #9B8D85;
  --text-tertiary: #B8ADA3;
  --text-inverse: #FFFFFF;

  /* ===== 历史「玻璃」别名 → 干净值 ===== */
  --glass-bg: #FFFFFF;
  --glass-bg-strong: #FFFFFF;
  --glass-bg-hover: #FCF7F1;
  --glass-border: #EFE7DD;
  --glass-stroke: #EFE7DD;
  --glass-stroke-strong: rgba(74, 63, 58, 0.16);
  --glass-highlight: 0 0 0 0 rgba(0, 0, 0, 0);
  --shadow-glass: 0 8rpx 28rpx rgba(255, 148, 102, 0.10);
  --sheet-bg: #FFFFFF;
```

阴影 token 顺带改暖调（可选，替换 `--shadow-card`/`--shadow-soft`/`--shadow-float`）：
```css
  --shadow-card: 0 4rpx 18rpx rgba(255, 148, 102, 0.10);
  --shadow-soft: 0 16rpx 44rpx rgba(255, 148, 102, 0.14);
  --shadow-float: 0 10rpx 22rpx rgba(255, 148, 102, 0.12);
```

`.dark{}` 暗黑块本期不强求改（spec 列为后续）；保持现状即可。

- [ ] **Step 2: 验证不回归**

Run: `npm test`
Expected: 仍 62 pass / 1 fail（既有 pageLifecycle 失败），WXSS 改动不影响测试。

- [ ] **Step 3: 视觉验证**

在微信开发者工具编译，确认两页整体变为奶油暖色调、按钮暖橙、无明显错色。

- [ ] **Step 4: 提交**

```bash
git add app.wxss
git commit -m "style: app.wxss 视觉 token 改为奶油恋人配色"
```

---

## Task 2: foodLogic.rollRarity 纯函数（TDD）

**Files:** Modify `utils/foodLogic.js`、`utils/foodLogic.test.js`

- [ ] **Step 1: 写失败测试**

在 `utils/foodLogic.test.js` 顶部解构 require 中加入 `rollRarity`，并在文件末尾追加：

```javascript
test('rollRarity: 概率边界映射 R<0.80<=SR<0.95<=SSR', () => {
  assert.strictEqual(rollRarity(() => 0), 'R')
  assert.strictEqual(rollRarity(() => 0.79), 'R')
  assert.strictEqual(rollRarity(() => 0.80), 'SR')
  assert.strictEqual(rollRarity(() => 0.94), 'SR')
  assert.strictEqual(rollRarity(() => 0.95), 'SSR')
  assert.strictEqual(rollRarity(() => 0.999), 'SSR')
})

test('rollRarity: 大样本分布近似 80/15/5', () => {
  let seed = 987654321
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  const c = { R: 0, SR: 0, SSR: 0 }
  for (let i = 0; i < 20000; i++) c[rollRarity(rng)]++
  assert.ok(Math.abs(c.R / 20000 - 0.80) < 0.03, 'R≈80%')
  assert.ok(Math.abs(c.SR / 20000 - 0.15) < 0.03, 'SR≈15%')
  assert.ok(Math.abs(c.SSR / 20000 - 0.05) < 0.02, 'SSR≈5%')
})

test('rollRarity 与选菜解耦：签名只吃 rng、不接触 food', () => {
  // 稀有度任意档时，weightedPick 仍独立按权重选菜（单元素池必返回它）
  const food = { name: '蛋炒饭', tags: [], defaultPoolWeight: 1.0 }
  assert.strictEqual(rollRarity(() => 0.99), 'SSR')
  assert.strictEqual(weightedPick([food], {}, () => 0.5).name, '蛋炒饭')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test utils/foodLogic.test.js`
Expected: FAIL — `rollRarity is not a function`。

- [ ] **Step 3: 实现 rollRarity**

在 `utils/foodLogic.js` 的 `inferSeason` 之后、`module.exports` 之前新增，并加入 `module.exports`：

```javascript
// ========== 盲盒稀有度：纯概率，与菜无关（R 80% / SR 15% / SSR 5%）==========
// 仅决定揭晓动画档位；rng 可注入便于测试。
function rollRarity(rng) {
  const r = (rng || Math.random)()
  if (r < 0.80) return 'R'
  if (r < 0.95) return 'SR'
  return 'SSR'
}
```

`module.exports` 中加入 `rollRarity,`（与 `inferSeason,` 并列）。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test utils/foodLogic.test.js`
Expected: PASS（新 3 个用例 + 既有全绿）。

- [ ] **Step 5: 提交**

```bash
git add utils/foodLogic.js utils/foodLogic.test.js
git commit -m "feat: foodLogic.rollRarity 盲盒稀有度纯概率函数"
```

---

## Task 3: 首页盲盒态↔揭晓态状态机 + 菜卡/操作分离（静态，无华丽动画）

**Files:** Modify `pages/index/index.js`、`index.wxml`、`index.wxss`

实现前 invoke `ui-ux-pro-max`。对照 mockup `10`(盲盒态)、`12`/`13`(揭晓态)。本任务只做静态结构与基础切换，三档华丽动画留 Task 4。

- [ ] **Step 1: data 状态字段**

在 `index.js` 的 `data` 中加入（替代旧 week/wheel 等态，旧字段 Task 5 清理）：
```javascript
    boxPhase: 'idle',     // idle=盲盒待揭晓 | revealing=动画中 | revealed=已出菜
    revealRarity: '',     // '' | 'R' | 'SR' | 'SSR'
    currentResult: null,  // 揭晓出的菜
    currentResultIsFav: false,
    resultReason: '',
    activeTab: 'home',    // home=推荐 | mine=我的
```

- [ ] **Step 2: 揭晓主流程（接 rollRarity + 选菜，解耦）**

在 `index.js` 新增方法（`pickRandom`/`candidatePool`/`buildPrefs`/`buildCtx`/`addToHistory` 沿用现有）：
```javascript
  onTapBox() {
    if (this.data.boxPhase !== 'idle') return
    const food = this.pickRandom()
    if (!food) { wx.showToast({ title: '没有符合条件的食物', icon: 'none' }); return }
    const rarity = foodLogic.rollRarity()          // 纯概率，与 food 无关
    const isFav = (this._favorites || []).some(f => f.name === food.name)
    const resultReason = foodLogic.buildRichReason(food, this.buildCtx())
    this.setData({ boxPhase: 'revealing', revealRarity: rarity })
    // 动画时长按档位（Task 4 用同一时长表）；此处仅状态切换
    const dur = rarity === 'SSR' ? 2600 : (rarity === 'SR' ? 1600 : 900)
    this.clearTimer('_revealTimer')
    this._revealTimer = setTimeout(() => {
      this._revealTimer = null
      this.setData({ boxPhase: 'revealed', currentResult: food, currentResultIsFav: isFav, resultReason })
      this.addToHistory(food)
    }, dur)
  },
  onRetry() {            // 换一个：回盒子再抽
    this.noteRejected(this.data.currentResult)
    this.clearTimer('_revealTimer')
    this.setData({ boxPhase: 'idle', currentResult: null, revealRarity: '' })
    wx.nextTick ? wx.nextTick(() => this.onTapBox()) : setTimeout(() => this.onTapBox(), 0)
  },
  onConfirmEat() {       // 就吃这个：确认（已在揭晓时记历史），给反馈
    wx.showToast({ title: `就吃 ${this.data.currentResult.name}`, icon: 'none' })
  },
  onToggleFav() { /* 沿用现有收藏切换逻辑，作用于 currentResult */ },
```

- [ ] **Step 3: WXML 盲盒态 + 揭晓态结构**

`index.wxml` 推荐 tab 主体替换为（保留容器/暗黑 class）：
```html
<view wx:if="{{activeTab === 'home'}}" class="home">
  <view class="topbar">
    <view class="topbar-text"><text class="app-title">今天吃什么</text><text class="app-date">{{headerDate}}</text></view>
    <view class="gear" bindtap="openFilterSheet">⚙</view>
  </view>

  <view class="stage">
    <!-- 盲盒态 -->
    <view wx:if="{{boxPhase !== 'revealed'}}" class="boxcard {{boxPhase === 'revealing' ? 'reveal-' + revealRarity : ''}}" bindtap="onTapBox">
      <view class="box-glow"></view>
      <text class="box-emoji">🎁</text>
      <text class="box-tip">轻触揭晓今天的命运</text>
      <view class="box-dots"><view></view><view></view><view></view></view>
    </view>

    <!-- 揭晓态：① 菜卡（内容）② 操作（卡外）-->
    <block wx:if="{{boxPhase === 'revealed'}}">
      <view class="dishcard rarity-{{revealRarity}}">
        <view class="fav-corner" catchtap="onToggleFav">{{currentResultIsFav ? '♥' : '♡'}}</view>
        <text class="dish-emoji">{{currentResult.emoji}}</text>
        <text class="dish-name">{{currentResult.name}}</text>
        <text class="dish-reason">{{resultReason}}</text>
        <view class="dish-tags">
          <text class="tag-pill warm">{{currentResult.time === '快' ? '约 15 分钟' : '约 30 分钟'}}</text>
          <text class="tag-pill mint">{{currentResult.scene}}</text>
        </view>
      </view>
      <view class="dish-actions">
        <view class="btn-eat" bindtap="onConfirmEat">就吃这个</view>
        <view class="btn-retry" bindtap="onRetry">↻ 换一个</view>
      </view>
    </block>

    <view wx:if="{{boxPhase === 'idle'}}" class="combo-entry" bindtap="buildCombo">🍱 两个人？帮你们凑一桌</view>
  </view>
</view>

<!-- 底部 tab -->
<view class="tabbar">
  <view class="tab {{activeTab === 'home' ? 'on' : ''}}" bindtap="switchTab" data-tab="home"><text class="tab-ic">🎁</text>推荐</view>
  <view class="tab {{activeTab === 'mine' ? 'on' : ''}}" bindtap="switchTab" data-tab="mine"><text class="tab-ic">♡</text>我的</view>
</view>
```

- [ ] **Step 4: WXSS 静态样式**

在 `index.wxss` 加盲盒/菜卡/操作/tab 的奶油恋人样式（对照 mockup 13）。关键骨架：
```css
.home{display:flex;flex-direction:column;min-height:100vh;}
.topbar{display:flex;justify-content:space-between;align-items:center;padding:48rpx 44rpx 8rpx;}
.app-title{font-size:44rpx;font-weight:700;color:var(--text-primary);}
.app-date{display:block;font-size:24rpx;color:var(--text-secondary);margin-top:6rpx;}
.gear{width:76rpx;height:76rpx;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:32rpx;color:var(--text-secondary);box-shadow:var(--shadow-card);}
.stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 52rpx;gap:48rpx;}
.boxcard{position:relative;width:100%;height:600rpx;border-radius:64rpx;background:var(--card-bg);box-shadow:var(--shadow-soft);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28rpx;animation:boxFloat 3.4s ease-in-out infinite;}
.box-glow{position:absolute;inset:-28rpx;border-radius:80rpx;background:radial-gradient(circle at 50% 42%,var(--primary-soft),rgba(235,169,196,0.15) 55%,transparent 72%);filter:blur(16rpx);animation:boxPulse 3.4s ease-in-out infinite;}
.box-emoji{font-size:180rpx;}
.box-tip{font-size:30rpx;font-weight:600;color:var(--primary);}
.box-dots{display:flex;gap:10rpx;}
.box-dots view{width:12rpx;height:12rpx;border-radius:50%;background:var(--primary);animation:blink 1.4s infinite;}
.box-dots view:nth-child(2){animation-delay:.2s;}.box-dots view:nth-child(3){animation-delay:.4s;}
@keyframes boxFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-16rpx);}}
@keyframes boxPulse{0%,100%{opacity:.5;transform:scale(.98);}50%{opacity:1;transform:scale(1.03);}}
@keyframes blink{0%,100%{opacity:.25;}50%{opacity:.9;}}
.dishcard{position:relative;width:100%;background:var(--card-bg);border-radius:64rpx;padding:64rpx 48rpx 56rpx;box-shadow:var(--shadow-soft);text-align:center;}
.fav-corner{position:absolute;top:32rpx;right:32rpx;width:76rpx;height:76rpx;border-radius:50%;background:var(--pink-soft);display:flex;align-items:center;justify-content:center;font-size:36rpx;color:#D17EA8;}
.dish-emoji{font-size:168rpx;}
.dish-name{display:block;font-size:52rpx;font-weight:700;margin-top:24rpx;color:var(--text-primary);}
.dish-reason{display:block;font-size:26rpx;color:var(--text-secondary);margin-top:18rpx;}
.dish-tags{display:flex;gap:16rpx;justify-content:center;margin-top:32rpx;}
.tag-pill{font-size:22rpx;padding:8rpx 22rpx;border-radius:999rpx;font-weight:600;}
.tag-pill.warm{background:#FFF0E6;color:var(--primary-deep);}
.tag-pill.mint{background:var(--mint-soft);color:#3FA98C;}
.dish-actions{display:flex;flex-direction:column;align-items:center;gap:18rpx;}
.btn-eat{height:96rpx;padding:0 108rpx;border-radius:48rpx;display:flex;align-items:center;justify-content:center;font-size:32rpx;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--primary),var(--primary-deep));box-shadow:0 20rpx 44rpx var(--primary-soft);}
.btn-retry{font-size:28rpx;font-weight:600;color:var(--text-secondary);padding:12rpx;}
.combo-entry{font-size:28rpx;font-weight:600;color:var(--text-secondary);padding:22rpx 44rpx;border-radius:999rpx;background:#fff;box-shadow:var(--shadow-card);}
.tabbar{height:124rpx;border-top:1rpx solid var(--separator);display:flex;align-items:center;justify-content:space-around;background:rgba(255,255,255,0.92);}
.tab{display:flex;flex-direction:column;align-items:center;gap:6rpx;font-size:24rpx;color:var(--text-secondary);}
.tab-ic{font-size:38rpx;}
.tab.on{color:var(--primary);font-weight:600;}
```

- [ ] **Step 5: 验证不回归 + 视觉**

Run: `npm test` → 仍 62 pass / 1 fail。
在开发者工具点盒子：应进入 revealing→revealed 显示菜卡，「换一个」回盒重抽，「就吃这个」toast。

- [ ] **Step 6: 提交**

```bash
git add pages/index/index.js pages/index/index.wxml pages/index/index.wxss
git commit -m "feat: 首页盲盒态↔揭晓态状态机与菜卡/操作分离布局"
```

---

## Task 4: 三档揭晓动画（WXSS keyframes，接 rollRarity）

**Files:** Modify `pages/index/index.wxss`（动画）、必要时 `index.js`（时长表已在 Task 3 `onTapBox` 的 `dur`）

实现前 invoke `ui-ux-pro-max`。逐档对照 mockup `07`（R/SR/SSR v2）。盒子在 `revealing` 时按 `reveal-R/SR/SSR` class 播放，结束切 `revealed` 显示 `dishcard.rarity-*`。**点击前盒子三档外观一致**（盲盒态无 rarity class）。

- [ ] **Step 1: R 温柔升起**

在 `index.wxss` 加（盒子化光上浮，揭晓后菜卡 spring 升起；菜卡入场动画绑在 `.rarity-R`）：
```css
.boxcard.reveal-R{animation:boxRiseOut .85s cubic-bezier(.34,1.4,.64,1) forwards;}
@keyframes boxRiseOut{0%{transform:translateY(0)scale(1);opacity:1;}100%{transform:translateY(-60rpx)scale(.82);opacity:0;}}
.dishcard.rarity-R{animation:dishRise .6s cubic-bezier(.34,1.5,.6,1);}
@keyframes dishRise{0%{transform:translateY(60rpx)scale(.7);opacity:0;}100%{transform:translateY(0)scale(1);opacity:1;}}
```

- [ ] **Step 2: SR 凝光降临**

```css
.boxcard.reveal-SR{animation:boxCharge .6s ease-in-out, boxVanish .25s ease-in .6s forwards;}
@keyframes boxCharge{0%,100%{transform:scale(1);}25%{transform:scale(.92)rotate(-2deg);}50%{transform:scale(1.06)rotate(2deg);}75%{transform:scale(.96);}}
@keyframes boxVanish{to{transform:scale(.2);opacity:0;}}
.dishcard.rarity-SR{box-shadow:0 18rpx 46rpx rgba(245,166,35,.28),0 0 0 4rpx var(--gold-light);animation:dishPop .6s cubic-bezier(.34,1.56,.64,1);}
@keyframes dishPop{0%{transform:scale(.3);opacity:0;}60%{transform:scale(1.12);opacity:1;}100%{transform:scale(1);opacity:1;}}
.rarity-SR .dish-emoji{animation:emojiBounce .6s cubic-bezier(.34,1.7,.5,1) .1s;}
@keyframes emojiBounce{0%{transform:scale(1);}40%{transform:scale(1.3)translateY(-10rpx);}100%{transform:scale(1);}}
```
（金光闪 / 星粒可用 `boxcard` 内附加元素 + 伪元素；本步先保证档位区分，星粒细节可二次打磨。）

- [ ] **Step 3: SSR 殿堂降临**

```css
.boxcard.reveal-SSR{animation:boxCharge2 .9s ease-in-out, boxVanish .25s ease-in .9s forwards;}
@keyframes boxCharge2{0%,100%{transform:scale(1);}20%{transform:scale(.9)rotate(-3deg);}45%{transform:scale(1.1)rotate(3deg);}70%{transform:scale(.94)rotate(-2deg);}85%{transform:scale(1.08);}}
/* 暖色光氛（非黑场）覆盖 stage，仅 SSR 揭晓时显示 */
.stage.aura-SSR::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,rgba(255,236,200,0) 26%,rgba(255,206,150,0.42) 60%,rgba(235,169,196,0.42) 86%,rgba(201,139,255,0.30) 100%);animation:auraIn .6s ease forwards;pointer-events:none;}
@keyframes auraIn{from{opacity:0;}to{opacity:1;}}
.dishcard.rarity-SSR{animation:dishPop .7s cubic-bezier(.34,1.56,.64,1) .25s backwards;}
.rarity-SSR::after{content:'';position:absolute;inset:-6rpx;border-radius:70rpx;z-index:-1;background:conic-gradient(from 0deg,#ff9a9a,#ffd86b,#7affc3,#6bb7ff,#c98bff,#ff9a9a);animation:holoSpin 3s linear infinite;}
@keyframes holoSpin{to{transform:rotate(360deg);}}
.rarity-SSR .dish-emoji{animation:emojiBig .8s cubic-bezier(.34,1.7,.5,1) .3s;}
@keyframes emojiBig{0%{transform:scale(1);}30%{transform:scale(1.4)translateY(-12rpx)rotate(-8deg);}100%{transform:scale(1)rotate(0);}}
```
`index.js` 在 `revealing && SSR` 时给 `stage` 加 `aura-SSR` class（揭晓结束移除）：在 `onTapBox` setData 加 `auraClass: rarity === 'SSR' ? 'aura-SSR' : ''`，WXML stage 绑 `class="stage {{auraClass}}"`，`revealed`/`idle` 时清空。皇冠👑、光柱、星粒等附加元素按 mockup 07 二次打磨（非阻塞）。

- [ ] **Step 4: 验证**

Run: `npm test` → 仍 62 pass / 1 fail。
开发者工具反复点盒子：三档动画明显有别；盒子点击前三档外观一致；SSR 为暖色光氛非黑框。（稀有度随机，可临时把 `rollRarity` 注入固定值或多点几次验证三档。）

- [ ] **Step 5: 提交**

```bash
git add pages/index/index.wxss pages/index/index.js pages/index/index.wxml
git commit -m "feat: R/SR/SSR 三档揭晓动画"
```

---

## Task 5: 移除转盘 / 塔罗 / 默契 PK

**Files:** Modify `pages/index/index.js`、`index.wxml`、`index.wxss`

- [ ] **Step 1: 删 JS**

从 `index.js` 删除这些方法与相关实例字段/常量：转盘（`spinWheel`/`stopWheel`/`finishWheelResult`/`clearWheelTimers`/`updateFilteredFoods` 中转盘部分/`onWheelBtnTap`/`wheelPool` 等）、塔罗（`TAROT_FORTUNES` 常量、`initTarot`/`onFlipTarot`/`onResetTarot`、tarot* data）、PK（`PK_CATEGORIES`/`PK_PUNISHMENTS`、`initPK`/`selectPK`/`confirmPKA`/`confirmPKB`/`revealPK`/`resetPK`、pk* data）。同时删除 `switchTab` 里对 wheel/tarot/pk 的分支、`onShow`/`onHide`/`onUnload` 中相关定时器清理（保留盲盒/分享/storage 的）。保留：`buildCombo`/`closeCombo`、收藏/历史/筛选/分享/音效/生命周期骨架。

- [ ] **Step 2: 删 WXML**

从 `index.wxml` 删除转盘（`wheel-section`/`wheel-*`）、塔罗（`tarot-*`）、PK（`pk-*`）、旧「更多玩法」面板（`play-more-*`）、旧 hero-card（已被盲盒取代）相关节点。

- [ ] **Step 3: 删 WXSS**

从 `index.wxss` 删除上述对应样式块（`.wheel*` `.tarot*` `.pk*` `.play-more*` `.hero*` 等）。

- [ ] **Step 4: 验证**

Run: `npm test` → 仍 62 pass / 1 fail（`pageLifecycle.test.js` 若引用已删的转盘/盲盒方法会报错——**注意**：该测试覆盖盲盒/转盘生命周期，删转盘后若用例引用 `spinWheel` 等会失败。处理：保留盲盒相关生命周期；对已移除的转盘用例，同步在 `pageLifecycle.test.js` 删除对应转盘用例（仅删转盘相关，不动其它）。删除后重跑确认无新增失败。）
开发者工具：首页只剩盲盒，无残留入口/报错。

- [ ] **Step 5: 提交**

```bash
git add pages/index/index.js pages/index/index.wxml pages/index/index.wxss utils/pageLifecycle.test.js
git commit -m "refactor: 移除转盘/塔罗/默契PK，首页聚焦盲盒"
```

---

## Task 6: 筛选收进 ⚙ Sheet

**Files:** Modify `pages/index/index.js`、`index.wxml`、`index.wxss`

实现前 invoke `ui-ux-pro-max`。沿用现有 filters 维度（场景/预算/时间/口味/避免/排除近期）与 `applyFilterChange`。

- [ ] **Step 1: ⚙ 打开筛选 sheet**

复用现有 `openFilterSheet`/`closeFilterSheet`/各 picker。`gear` 已绑 `openFilterSheet`（Task 3）。确认 sheet WXML/WXSS 套奶油恋人配色（场景在 sheet 内作为一组选项，不再首页常驻 chip）。

- [ ] **Step 2: 验证 + 提交**

Run: `npm test` → 仍 62 pass / 1 fail。开发者工具：点 ⚙ 弹出筛选，改条件后盲盒抽取范围随之变化（`applyFilterChange` → `invalidateCache`）。
```bash
git add pages/index/index.js pages/index/index.wxml pages/index/index.wxss
git commit -m "feat: 筛选收进 ⚙ Sheet，首页顶部留白"
```

---

## Task 7: 「我的」tab（收藏/历史/画像/连胜/管理/设置）

**Files:** Modify `pages/index/index.js`、`index.wxml`、`index.wxss`

实现前 invoke `ui-ux-pro-max`。采用 index 内 tab 切换（`activeTab === 'mine'`），复用 `_favorites`/`_history`/`buildTasteProfile`/`computeStreak`。

- [ ] **Step 1: switchTab + 我的数据**

```javascript
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === 'mine') {
      const profile = foodLogic.buildTasteProfile(this._history || [], this._favorites || [], this._foods || [])
      const streak = foodLogic.computeStreak(this._history || [], Date.now())
      const history = (this._history || []).slice(0, 20).map(h => ({ ...h, dateStr: util.formatDate(new Date(h.date)) }))
      this.setData({ activeTab: 'mine', mineProfile: profile, mineStreak: streak, mineHistory: history, mineFavorites: this._favorites || [] })
    } else {
      this.setData({ activeTab: 'home' })
    }
  },
  goToManage() { wx.navigateTo({ url: '/pages/manage/manage' }) },
```

- [ ] **Step 2: WXML 我的视图**

```html
<view wx:if="{{activeTab === 'mine'}}" class="mine">
  <view class="mine-header"><text class="app-title">我的</text></view>
  <view class="mine-card"><text class="mine-streak-num">{{mineStreak.current}}</text><text class="mine-streak-label">天连续决定 · 最长 {{mineStreak.longest}} 天</text></view>
  <view class="mine-card"><text class="mine-sec-title">口味画像</text><text class="mine-headline">{{mineProfile.headline}}</text></view>
  <view class="mine-card">
    <text class="mine-sec-title">爱吃榜（{{mineFavorites.length}}）</text>
    <view wx:for="{{mineFavorites}}" wx:key="name" class="mine-row"><text>{{item.emoji}} {{item.name}}</text></view>
  </view>
  <view class="mine-card">
    <text class="mine-sec-title">最近吃过</text>
    <view wx:for="{{mineHistory}}" wx:key="date" class="mine-row"><text>{{item.emoji}} {{item.name}}</text><text class="mine-date">{{item.dateStr}}</text></view>
  </view>
  <view class="mine-entry" bindtap="goToManage">管理菜品库 ›</view>
</view>
```

- [ ] **Step 3: WXSS（奶油恋人卡片列表）**

```css
.mine{padding:48rpx 44rpx 40rpx;display:flex;flex-direction:column;gap:24rpx;}
.mine-header .app-title{font-size:44rpx;font-weight:700;}
.mine-card{background:var(--card-bg);border-radius:36rpx;padding:32rpx;box-shadow:var(--shadow-card);}
.mine-streak-num{font-size:64rpx;font-weight:700;color:var(--primary);}
.mine-streak-label{font-size:24rpx;color:var(--text-secondary);margin-left:12rpx;}
.mine-sec-title{font-size:28rpx;font-weight:700;color:var(--text-primary);display:block;margin-bottom:16rpx;}
.mine-headline{font-size:26rpx;color:var(--text-secondary);}
.mine-row{display:flex;justify-content:space-between;font-size:28rpx;color:var(--text-primary);padding:14rpx 0;border-top:1rpx solid var(--separator);}
.mine-date{color:var(--text-tertiary);font-size:24rpx;}
.mine-entry{text-align:center;font-size:28rpx;font-weight:600;color:var(--primary);padding:28rpx;background:#fff;border-radius:36rpx;box-shadow:var(--shadow-card);}
```

- [ ] **Step 4: 验证 + 提交**

Run: `npm test` → 仍 62 pass / 1 fail。开发者工具：切「我的」显示连胜/画像/收藏/历史/管理入口；切回「推荐」正常。
```bash
git add pages/index/index.js pages/index/index.wxml pages/index/index.wxss
git commit -m "feat: 我的 tab（收藏/历史/画像/连胜/管理入口）"
```

---

## Task 8: 凑一桌套新视觉 + 首页副入口

**Files:** Modify `pages/index/index.js`、`index.wxml`、`index.wxss`

实现前 invoke `ui-ux-pro-max`。复用现有 `buildCombo`/`closeCombo`/`comboResult`（`foodLogic.buildMealCombo`）。

- [ ] **Step 1: 套新视觉**

`combo-entry`（Task 3 已加）绑 `buildCombo`。把凑一桌 sheet 的 WXML/WXSS 改为奶油恋人配色（卡片列出多道菜，「就这桌」「换一桌」按钮用 `.btn-eat`/`.btn-retry` 风格）。

- [ ] **Step 2: 验证 + 提交**

Run: `npm test` → 仍 62 pass / 1 fail。开发者工具：盲盒态点「凑一桌」弹出一桌菜，「换一桌」刷新。
```bash
git add pages/index/index.js pages/index/index.wxml pages/index/index.wxss
git commit -m "feat: 凑一桌套奶油恋人视觉，接首页副入口"
```

---

## Self-Review

**Spec 覆盖：**
- §1 视觉基调 → Task 1（token）+ 各页面任务套用。✓
- §3 盲盒态 / §4 揭晓流程与三档动画（纯概率、点击前一致、与菜无关）→ Task 2（rollRarity）+ Task 3（状态机/解耦选菜）+ Task 4（三档动画）。✓
- §5 揭晓态菜卡/操作分离 → Task 3 Step 3/4。✓
- §2 信息架构（2 tab + 凑一桌副入口）→ Task 3（tabbar/combo-entry）+ Task 7（我的）+ Task 8（凑一桌）。✓
- §7 功能精简 → Task 5（移除转盘/塔罗/PK）+ Task 6（场景降为筛选）。✓
- §8 我的页 → Task 7。✓
- §6 凑一桌 → Task 8。✓
- §10 测试策略 → Task 2 TDD；页面任务用 npm test 不回归 + 视觉验证。✓

**Placeholder 扫描：** 纯逻辑（Task 2）给完整代码；页面任务给关键 WXML/WXSS/JS 骨架 + 精确验证命令。无 TBD/TODO。皇冠/星粒等「二次打磨」项已明确标注为非阻塞细节（核心档位区分已覆盖），非占位。✓

**命名一致：** `rollRarity`（Task 2 定义 = Task 3 `onTapBox` 调用）、`boxPhase`/`revealRarity`/`activeTab`（Task 3 定义 = Task 4/7 引用）、`.boxcard.reveal-R/SR/SSR` 与 `.dishcard.rarity-R/SR/SSR`（Task 3 WXML class = Task 4 WXSS）、`aura-SSR`（Task 4 JS+WXML+WXSS 一致）。✓

**注意（跨任务依赖）：** Task 4 依赖 Task 3 的 class 命名与 `dur` 时长；Task 5 删转盘时需同步删 `pageLifecycle.test.js` 的转盘用例（仅转盘相关），避免引用已删方法导致测试报错。
