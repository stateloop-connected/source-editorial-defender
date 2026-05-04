# AGENTS.md

本文件是后续 Agent 的「快速地图」，不是百科全书。
目标：让 Agent 在最短上下文内，做出正确、可验证、可维护的改动。

## 1) 工作原则（高优先级）

### 1.1 先思考再动手
- 明确任务边界与假设；有歧义先提问，不要静默选择。
- 优先给出最小可行改动，不做未被请求的“顺手重构”。
- 每次改动前定义验收标准（如何确认完成）。

### 1.2 简单优先
- 只写解决当前问题所需代码，避免过度抽象与“未来配置”。
- 遵循现有代码风格与模块边界，避免横向扩散修改。
- 若 200 行可缩到 50 行且不损害可读性，应主动简化。

### 1.3 手术式改动
- 每一处变更都应能直接追溯到需求。
- 不清理无关历史代码；仅清理由本次改动引入的冗余。
- 发现仓库中无关问题可备注，但不要顺手改动。

### 1.4 闭环验证
- 能跑检查就跑：至少 `pnpm check`，必要时 `pnpm lint` / `pnpm build`。
- Bug 修复优先可复现、可验证；功能改动优先提供最小验证步骤。
- 提交说明包含：改了什么、为何这样改、如何验证。

## 2) 项目速览（Editorial Defender）

- 类型：生存射击游戏（Agent 阵营 vs 古法编程阵营）。
- 核心表现：Perlin 噪音生成文字地形 + 主通道/支路 + 中央安全区。
- 渲染结构：DOM/Canvas 混合分层，`ambientLayer` 是 canvas，其余主实体是 DOM。
- 技术栈：`TypeScript` + `Vite` + `@chenglou/pretext` + `noisejs` + `stats.js` + 原生 CSS。
- 入口：`src/main.ts` -> `bootstrapGame()`。

## 3) 关键架构与职责

- `src/game/index.ts`：编排层（生命周期、输入、主循环、碰撞、刷怪、UI 更新）。
- `src/game/state.ts`：全局运行态容器（唯一状态真源）。
- `src/game/layout.ts`：文字地形生成、通道雕刻、关键词排版、`textBuckets` 重建。
- `src/game/entities.ts`：实体模型与局部更新（`TextBlock/Bullet/Enemy/...`）。
- `src/game/rendering.ts`：渲染同步（canvas 绘制 + DOM 对象池）。
- `src/game/dom.ts`：舞台节点收集与 UI 显隐工具。
- `src/game/constants.ts`：语料、阈值、视觉与玩法常量。
- `src/game/utils.ts`：数学工具与碰撞判断（`circlesOverlap`）。

## 4) 不可破坏的不变量

### 4.1 时间基准
- 统一使用 `frameCount` 作为持续时间/冷却/刷新节奏依据。
- 不要用 `Date.now()` 或游戏内 `setTimeout()` 替代帧时序逻辑。

### 4.2 双循环模型
- 逻辑：`setInterval(update, 1000/60)`。
- 渲染：`requestAnimationFrame(renderLoop)`。
- 暂停态冻结逻辑推进但保留渲染画面。

### 4.3 布局与排版
- 关键词按整词优先布局，核心依赖 `prepareWithSegments()` + `layoutNextLine()`。
- 地形流程：噪音文字场 -> 主通道/支路雕刻 -> 中央安全区 -> 行槽填充。
- `ambientGlyphs` 仅视觉表现，不参与碰撞，不进入 `textBuckets`。

### 4.4 状态重置完整性
- 新增全局状态字段后，必须在 `startGame()` 中重置。
- 新增布局缓存后，必须考虑 `resizeStage()` 的重建行为。

## 5) 性能约束（默认遵守）

- 高频路径避免无意义分配和全量扫描（特别是 `update()` 与 `render()`）。
- 保留并复用现有对象池策略（子弹/敌人/粒子/道具 DOM 节点）。
- 渲染写样式尽量走脏更新（参照 `TextBlock` 的 `lastRender*` 缓存策略）。
- 碰撞优先平方距离比较；涉及文字碰撞优先复用 `textBuckets`。

## 6) 常见任务落点

- 调整地形/语料/通道：优先看 `src/game/layout.ts` + `src/game/constants.ts`。
- 调整实体行为：优先看 `src/game/entities.ts` 与 `src/game/index.ts`。
- 调整分层渲染/对象池：优先看 `src/game/rendering.ts`。
- 调整 UI 结构和样式：看 `index.html` + `src/game/dom.ts`。
- 调整全局状态：看 `src/game/state.ts` 并同步重置逻辑。

## 7) 变更流程（Agent 执行模板）

1. 明确需求与假设，给出最小实现方案。
2. 只改必要文件，保持模块边界清晰。
3. 本地验证（至少一条）：
   - `pnpm check`
   - `pnpm lint`
   - `pnpm build`
4. 输出结果时说明：
   - 修改文件与关键点
   - 验证命令与结果
   - 风险与后续建议（如有）

## 8) 文档策略（仓库即记录系统）

- 本文件保持短小稳定，充当导航地图。
- 深入说明写入更具体文档（如 `README.md` 或后续 `docs/`）。
- 架构、主循环、渲染模型、性能策略变更后，必须同步更新文档。
- 避免把临时讨论放在外部聊天工具而不落库；Agent 仅能可靠读取仓库内信息。
