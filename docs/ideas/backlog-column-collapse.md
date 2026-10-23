# 待规划（Backlog）栏侧边收起（参考已完成栏）

## Problem Statement
如何让用户在看板视图中根据需要侧边收起/折叠「待规划 (Backlog)」栏，参考「已完成 (Done)」栏的侧边收起体验，以便为正在进行的任务释放更多横向工作区空间，同时保持栏目信息与拖拽交互的完整性？

## Recommended Direction
参考当前看板中「已完成（Done）」栏的折叠交互与样式，为「待规划（Backlog）」栏实现对齐的侧边折叠功能：
1. **状态持久化与管理**：
   - 在 `BoardController` 中增加 `backlogCollapsed: boolean` 状态字段及其变更方法 `setBacklogCollapsed(collapsed: boolean)`。
   - 在 `loadView()` 和 `persistView()` 中同步读写 `VIEW_KEY` (localStorage)，保持页面刷新后折叠状态不丢失，默认值为 `false`（展开）。
2. **展开状态的列头收起按钮**：
   - 在「待规划」列头（`dsh-atb-colhead`）右侧增加折叠按钮 `dsh-atb-colfoldbtn`，hover 提示 "收起「待规划」列" (`board.column.collapseBacklog`)。
   - 点击时触发 `controller.setBacklogCollapsed(true)`。
3. **收起状态的侧边栏呈现**：
   - 当 `backlogCollapsed === true` 时，该列渲染为折叠形态（`data-collapsed="true"`，宽度为 42px 的紧凑条 `dsh-atb-col-collapsed-bar`）。
   - 包含状态圆点、竖排文字「待规划」、当前任务计数徽标、以及展开按钮。
   - 点击折叠栏或展开按钮即可展开列（触发 `controller.setBacklogCollapsed(false)`）。
   - 保留拖拽放置（drag and drop）支持，卡片可拖入折叠栏移入 `backlog` 状态。
4. **国际化支持**：
   - 在 `zh.ts` 与 `en.ts` 中补充 `board.column.collapseBacklog` 与 `board.column.expandBacklog` 对应中英文文案。

## Key Assumptions to Validate
- [ ] **样式一致性**：直接复用已有的 `.dsh-atb-column[data-collapsed="true"]`、`.dsh-atb-col-collapsed-bar`、`.dsh-atb-col-collapsed-title` 等样式规则，确保左右两端收起栏视觉风格一致。
- [ ] **拖拽可用性**：卡片从其他列拖动到收起的待规划栏时，可正常高亮并成功 drop 变为 `backlog` 状态。
- [ ] **持久化隔离**：`backlogCollapsed` 与 `doneCollapsed` 互不干扰，独立存储在 localStorage 中。
- [ ] **双向折叠共存**：当待规划栏和已完成栏同时收起时，中间列（待办、进行中、待审阅）自适应填充剩余宽度，布局正常无破损。

## MVP Scope
- **In Scope:**
  - `ControllerState` 新增 `backlogCollapsed: boolean`，并在 `initialState`、`loadView`、`persistView`、`setBacklogCollapsed` 中完整接入。
  - `TaskBoard.tsx` 中当 `status === 'backlog'` 时支持渲染折叠形态（含展开按钮、圆点、竖排文本、计数、放置监听）。
  - `TaskBoard.tsx` 中待规划列头添加收起按钮及国际化 title。
  - `zh.ts` 和 `en.ts` 添加待规划列折叠/展开的国际化 key。
  - 补充针对待规划列折叠行为的测试用例。
- **Out of Scope:**
  - 待规划栏内部任务分页/数量截断（当前只有已完成栏支持 `completedDisplayLimit` 历史折叠条，待规划栏不需要数量截断，只做整列侧边收起）。
  - 中间三列（待办、进行中、待审阅）的折叠（暂不扩展，仅针对首尾两列对齐）。

## Not Doing (and Why)
- **不在后端接口/数据模型层增加 backlog 过滤**：与 `excludeDone`（已完成任务量可能极大需后端延迟拉取）不同，`backlog` 是未开始的需求列表，总量通常在正常工作集范围内，不需要后端 `excludeBacklog` 接口，仅需纯前端视图折叠。
- **不修改中间列的展示逻辑**：保持看板核心在进行中任务的注意力聚焦。

## Open Questions
- 折叠时向左/向右箭头的视觉方向：收起按钮在待规划列头使用指向左收起的箭头 `<` 还是与已完成一致？展开按钮在折叠栏使用指向右展开的箭头 `>` 还是保持统一？——对齐自然直觉，收起时指左或保持统一样式。
