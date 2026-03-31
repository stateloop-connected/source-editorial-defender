# 排版防线 (Editorial Defender) - Agent Guide

This document helps AI agents and developers quickly understand the current architecture, runtime model, and extension constraints of the "Editorial Defender" project.

## 1. 项目概述 (Project Overview)

概念: 一款受网页排版引擎启发的生存射击游戏。背景文字会围绕玩家产生“避让”效果，玩家驾驶坦克在文字构成的动态障碍场中生存并反击敌对节点。

当前技术栈:
- Vite
- TypeScript
- DOM 分层渲染
- `@chenglou/pretext` 用于高性能文本排版测量
- `stats.js` 用于开发期 FPS / 帧耗时监视
- 原生 CSS

当前文件结构:
- [src/main.ts](/Users/lehuaixiaochen/Downloads/Project/tank-game/src/main.ts): 游戏主逻辑、状态管理、实体定义、布局与渲染
- [index.html](/Users/lehuaixiaochen/Downloads/Project/tank-game/index.html): 舞台 DOM 结构和样式
- [package.json](/Users/lehuaixiaochen/Downloads/Project/tank-game/package.json): 构建脚本与依赖

注意: 项目已经不是旧版的“单文件 + Canvas 2D”架构，当前实现以绝对定位 DOM 节点作为主要渲染手段。

## 2. 核心架构与主循环 (Architecture & Game Loop)

游戏采用逻辑更新与渲染分离的双循环机制：

- `update()`: 由 `setInterval(update, 1000 / 60)` 驱动，固定 60 FPS，负责移动、碰撞、刷怪、buff、生命周期处理等逻辑。
- `renderLoop()`: 由 `requestAnimationFrame(renderLoop)` 驱动，负责把当前状态同步到 DOM。
- `stats.js` 包裹在 `renderLoop()` 外围，用于观测真实渲染帧率与每帧耗时。

核心时间轴:
- `frameCount` 是全局唯一时间基准。
- 所有持续时间、冷却、刷新节奏都依赖 `frameCount`，不要改成 `Date.now()` 或游戏内 `setTimeout()`。

坐标系:
- 原点 `(0, 0)` 在左上角
- 右为 X 正方向
- 下为 Y 正方向

## 3. 当前渲染模型 (Rendering Model)

当前舞台由多个 DOM Layer 组成：

- `textLayer`: 背景文字墙
- `powerUpLayer`: 道具
- `enemyLayer`: 敌人
- `bulletLayer`: 子弹
- `particleLayer`: 粒子
- `tankLayer`: 玩家坦克
- `uiContainer` / `hud` / `gameOverUI`: UI 层
- `stats.js` 调试面板: 固定在右下角，独立于 HUD

渲染特点:
- 背景文字和动态实体都使用绝对定位 DOM 元素。
- `TextBlock` 已加入“脏更新”渲染保护，只在位置、颜色、透明度变化时才写样式。
- 动态实体仍使用对象池复用 DOM 节点，避免频繁创建销毁。

## 4. 全局状态管理 (Global State Management)

关键全局变量如下：

- `gameState`: `'start' | 'playing' | 'gameover'`
- `frameCount`: 全局帧计数器
- `score`: 当前得分
- `buffs`: `{ freeze, rapid, invincible, barrage }`，存的是 buff 失效帧
- `mouse`: 鼠标/触摸输入状态
- `textGrid`, `bullets`, `enemies`, `particles`, `powerUps`: 各类实体数组

性能相关缓存：

- `preparedCorpusCache`: 缓存 `pretext.prepareWithSegments()` 结果，避免重复准备相同长度的文本语料
- `glyphWidthCache`: 缓存单个字形宽度，避免重复 `measureText`
- `textBuckets`: 文字空间分桶，用于加速“子弹撞文字”检测
- `lastBuffDisplayText`: buff UI 文案缓存，避免无意义 DOM 更新

## 5. 文本布局系统 (Text Layout with Pretext)

文字背景布局由 `pretext` 驱动：

- 使用 `prepareWithSegments()` 预处理语料
- 使用 `layoutNextLine()` 按行推进
- 通过 `cursor` 实现逐行布局
- 通过 `carveSlots()` 在中间安全区两侧分配可用文本槽位

这套机制的意义：

- 适合做“绕障碍逐行排版”
- 可以在窗口变化时重建文字墙
- 避免依赖 DOM reflow 做文本测量

Agent 注意:
- 如果修改字体、字距、语料密度或安全区尺寸，请同步检查 `buildTextLayout()`
- 如果新增排版模式，优先延续 `prepareWithSegments() + layoutNextLine()` 这条路径
- 尽量复用 prepared/cached 数据，不要在高频路径里重新准备文本

## 6. 核心实体 (Core Entities)

### 6.1 Tank

不是 Class，而是全局单例对象。

- 位置通过鼠标/触摸输入做平滑跟随
- 朝向由鼠标相对位置决定
- 射击依赖 `lastShot` 与 `fireRate`

### 6.2 TextBlock

背景文字墙的最小单位。

- 有原始位置 `originX/originY`
- 会受到坦克斥力影响
- 会通过弹性恢复力回到初始位置
- 被子弹击中后会进入 `dead` 状态并按帧数延迟重生
- 带有渲染缓存字段，避免每帧重复写 DOM

### 6.3 Bullet

- `isPlayer` 区分敌我
- 玩家子弹可破坏文字与敌人
- 敌人子弹只伤害玩家
- 当前使用文字空间分桶加速与 `TextBlock` 的碰撞判断

### 6.4 Enemy

- 从屏幕边缘外生成
- 通过 `Math.atan2` 朝坦克追踪
- 自带独立开火节奏
- 受 `freeze` buff 影响

### 6.5 PowerUp

当前内置四种：

- `freeze`: 冻结敌人
- `rapid`: 提升玩家射速
- `invincible`: 玩家无敌并可触碰秒杀敌人
- `barrage`: 玩家每次开火会向 360 度同时发射一圈子弹

## 7. 碰撞与性能策略 (Collision & Performance Notes)

当前碰撞主要基于圆形碰撞：

- 核心判断已优先改成平方距离比较，减少不必要的开方
- 公共方法为 `circlesOverlap()`

当前已落地的优化：

- 文字布局 prepared 缓存
- 字形宽度缓存
- 文字空间分桶
- `TextBlock` 脏更新渲染
- buff 文本更新去抖

仍值得继续优化的方向：

- 动态实体层的脏更新
- 敌人与玩家子弹碰撞的空间分桶
- 将逻辑更新整合为 `requestAnimationFrame + fixed timestep`

## 8. Agent 扩展与修改指南 (Extension Guidelines for AI)

修改代码时请遵循以下原则：

重置状态必须彻底:
- 如果新增全局变量、缓存、计时器或坦克字段，必须在 `startGame()` 中正确重置
- 如果新增与布局相关的缓存，要考虑 `resizeStage()` 时是否需要重建

时间控制必须基于帧:
- 不要用 `Date.now()`、游戏内 `setTimeout()` 或真实时间差控制冷却/持续时间
- 应统一使用 `frameCount`

性能优先级:
- 高开销逻辑优先放在 `update()`，但避免重复扫描大数组
- `render()` 中避免复杂计算、临时对象分配和无条件样式写入
- 如果要新增大量实体，优先考虑对象池或空间索引

UI 交互:
- 像分数、buff 文案、结算面板这种 DOM 文本更新，应放在状态变更点，避免每帧刷新
- 调试型 UI（如 `stats.js`）应尽量复用第三方面板自身更新逻辑，不要再额外套一层高频 DOM 文本刷新

文档同步:
- 任何涉及架构、渲染模型、技术栈、主循环或性能策略的修改，都应同步更新本文件和 `README.md`
