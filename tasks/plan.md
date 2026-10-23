# Implementation Plan: 任务看板「待规划」栏侧边收起（参考已完成栏）

## Overview
参考任务看板中「已完成（done）」栏的侧边收起（折叠）机制，为「待规划（backlog）」栏实现完全对齐的侧边收起与展开功能：
1. **状态持久化**：用户收起或展开「待规划」栏的状态持久化到浏览器的 `localStorage`（复用现有 `dsh-taskboard-view-v1` 机制），默认展开（`backlogCollapsed: false`），页面刷新后保持用户偏好。
2. **Controller 状态与控制方法**：在 `BoardController` 中管理 `backlogCollapsed: boolean`，提供 `setBacklogCollapsed(collapsed: boolean)` 方法。
3. **收起形态与拖拽兼容**：收起时，待规划栏收缩为 42px 宽的紧凑竖条，垂直居中展示状态圆点、竖排标题「待规划」、任务数量徽章与展开按钮；同时保留 Drop Target 功能，支持卡片拖拽放入流转为 `backlog`。
4. **展开形态的列头折叠按钮**：在「待规划」列头部右侧放置收起按钮，点击一键侧边收起。
5. **国际化支持**：在 `zh.ts` 和 `en.ts` 中补充 `board.column.collapseBacklog` 与 `board.column.expandBacklog`。

## Architecture Decisions & Contract Signatures

### 1. 状态定义与方法契约 (`src/client/controller.ts`)
```ts
export interface ControllerState {
  ...
  /** Backlog (待规划) column collapsed state; persisted in localStorage. */
  backlogCollapsed: boolean
  ...
}

function loadView(): {
  workspaceId?: string
  urgencies: Urgency[]
  sortBy: SortBy
  doneCollapsed: boolean
  backlogCollapsed: boolean
}

export class BoardController {
  ...
  /** Set the backlog (待规划) column collapsed state (persisted). */
  setBacklogCollapsed(collapsed: boolean): void
}
```

### 2. 国际化字典契约 (`src/client/i18n/zh.ts` & `en.ts`)
```ts
// zh.ts
'board.column.collapseBacklog': '收起「待规划」列',
'board.column.expandBacklog': '展开「待规划」列',

// en.ts
'board.column.collapseBacklog': 'Collapse "Backlog" column',
'board.column.expandBacklog': 'Expand "Backlog" column',
```

### 3. 组件渲染契约 (`src/client/board/TaskBoard.tsx`)
- 当 `status === 'backlog' && state.backlogCollapsed` 时：
  渲染 `.dsh-atb-column[data-collapsed="true"]`，包含展开按钮、圆点、竖排文本、计数 `columnTasks.length`，以及 `onDragOver` / `onDrop` 处理。
- 当 `status === 'backlog'` 处于展开态时：
  列头 `dsh-atb-colhead` 渲染收起按钮 `button.dsh-atb-colfoldbtn`，点击调用 `controller.setBacklogCollapsed(true)`。

### 4. 仓库原生验证命令
- 单元测试：`pnpm test` 或 `npx vitest run tests/client.spec.ts tests/i18n.spec.ts`
- 类型检查：`pnpm run typecheck`
- 构建命令：`pnpm run build`

## Task List

### Phase 1: Controller 状态管理与持久化 (Client Core)
- [ ] Task 1: 在 Controller 中支持 `backlogCollapsed` 状态读写与 localStorage 持久化 (`src/client/controller.ts` & `tests/client.spec.ts`)

### Checkpoint: Client Core
- [ ] `loadView()` 正常解析 `backlogCollapsed`，缺失时默认 `false`
- [ ] `setBacklogCollapsed(collapsed)` 正常触发状态更新与本地持久化
- [ ] 对应单元测试绿灯

### Phase 2: 国际化与看板 UI 渲染 (Client UI)
- [ ] Task 2: 补充国际化词条并在 `TaskBoard.tsx` 中实现待规划栏收起/展开交互与拖拽 (`src/client/i18n/zh.ts`, `en.ts`, `src/client/board/TaskBoard.tsx`)

### Checkpoint: Client UI
- [ ] 待规划列头部具备收起按钮，点击可收起
- [ ] 收起后展示竖直紧凑条，展示数量徽章与展开按钮，点击可展开
- [ ] 拖拽卡片到收起的待规划栏可正常触发 drop 流转为 `backlog`
- [ ] 中英文字典测试完整

### Phase 3: 全量测试与端到端验证 (Verification)
- [ ] Task 3: 运行全量单元测试与构建检查，确保无回归与破损

### Checkpoint: Complete
- [ ] `pnpm test` 全绿
- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm run build` 成功

## Risks and Mitigations
| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| `VIEW_KEY` 存有旧版本数据，缺少 `backlogCollapsed` 字段 | Low | `loadView` 严格执行 `parsed.backlogCollapsed === true`，缺失或无效值安全降级为 `false`。 |
| 待规划列与已完成列同时收起时，剩余三列布局异常 | Medium | 看板列使用已验证的 flex 布局（`.dsh-atb-column { flex: 1 1 0; }`，折叠列 `flex: 0 0 42px;`），中间列会自动平分剩余空间。 |
| 拖拽到收起栏时的交互反馈不明显 | Low | 复用已有的 dragover 数据属性与 hover 样式，提供一致的高亮反馈。 |

## Open Questions
- 待规划栏是否有任务数量上限折叠（类似已完成栏的 limit 截断折叠条）？已在需求澄清中明确：否，待规划栏只做整列侧边收起，不做内部任务分页截断。
