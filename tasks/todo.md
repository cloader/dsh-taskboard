# Tasks: 任务看板「待规划」栏侧边收起（参考已完成栏）

## Task 1: 在 Controller 中支持 `backlogCollapsed` 状态读写与 localStorage 持久化 (Client Core)

**Description:**
在 `src/client/controller.ts` 中：
1. `ControllerState` 增加 `backlogCollapsed: boolean` 状态字段；
2. 扩展 `VIEW_KEY` (`dsh-taskboard-view-v1`) 本地持久化数据结构，`loadView()` 支持从 `localStorage` 解析 `backlogCollapsed`，严格全等 `=== true` 防御脏数据，异常或缺失默认 `false`；
3. `persistView()` 同步保存 `backlogCollapsed`，异常时静默降级；
4. 实现 `setBacklogCollapsed(collapsed: boolean)` 控制器方法，包含状态防重幂等判断，且纯前端控制不触发 `refresh()`；
5. 在 `tests/client.spec.ts` 中以 TDD 方式编写对应测试用例（覆盖 `TC-FUNC-001` ~ `TC-FUNC-005`, `TC-EDGE-001` ~ `TC-EDGE-004`, `TC-ERR-001`, `TC-ERR-002`, `TC-CONC-001`, `TC-CONC-004`），并在每个测试前标注 `// @tc TC-xxx` 锚点。

**Acceptance criteria:**
- [x] `ControllerState` 包含 `backlogCollapsed: boolean`
- [x] 初始默认状态 `backlogCollapsed` 为 `false` (`TC-FUNC-001`)
- [x] `setBacklogCollapsed(true)` 更新状态并持久化，不触发 `refresh()` (`TC-FUNC-002`)
- [x] `setBacklogCollapsed(false)` 恢复状态，不触发 `refresh()` (`TC-FUNC-003`, RT-001)
- [x] `persistView()` 正常保存 `backlogCollapsed` 且保留其他视图状态 (`TC-FUNC-004`)
- [x] `loadView()` 正常从 `localStorage` 读取 `backlogCollapsed: true` (`TC-FUNC-005`)
- [x] `loadView()` 在 `null`、损坏 JSON、脏类型 (`"true"`, `1`, `{}`) 或旧数据时安全降级为 `false` (`TC-EDGE-001`, `TC-EDGE-002`, `TC-EDGE-003`, `TC-EDGE-004`, RT-003)
- [x] `setBacklogCollapsed` 重复赋值幂等防重 (`TC-ERR-001`)
- [x] `persistView()` 在 `localStorage` 抛出 `QuotaExceededError` 时静默隔离 (`TC-ERR-002`)
- [x] 高频切换快速调用保持最终一致性 (`TC-CONC-001`)
- [x] `doneCollapsed` 与 `backlogCollapsed` 独立变更互不干扰 (`TC-CONC-004`)

**Verification:**
- [x] Tests pass: `npx vitest run tests/client.spec.ts`
- [x] Typecheck: `pnpm run typecheck`

**Dependencies:** None

**Files likely touched:**
- `src/client/controller.ts`
- `tests/client.spec.ts`

**Estimated scope:** Small (2 files)

---

## Checkpoint: Client Core
- [x] Task 1 完成
- [x] `npx vitest run tests/client.spec.ts` 绿灯通过且包含 Task 1 的全部 `@tc` 锚点

---

## Task 2: 国际化词条与看板 UI 待规划栏侧边收起与展开 (Client UI)

**Description:**
1. 在 `src/client/i18n/zh.ts` 和 `en.ts` 中添加 `board.column.collapseBacklog` 与 `board.column.expandBacklog`；
2. 在 `src/client/board/TaskBoard.tsx` 中：
   - 当 `status === 'backlog'` 且处于展开态时，列头部 `.dsh-atb-colhead` 渲染收起按钮 `.dsh-atb-colfoldbtn`，点击调用 `controller.setBacklogCollapsed(true)`；
   - 当 `status === 'backlog'` 且 `state.backlogCollapsed === true` 时，渲染 42px 宽度的折叠侧边栏紧凑条（`data-collapsed="true"`），包含 `.dsh-atb-col-collapsed-bar`、展开按钮（带 `e.stopPropagation()` 避免冒泡）、圆点、竖排标题、以及筛选后的任务数徽章 `columnTasks.length`；
   - 折叠条完整支持 `onDragOver`（高亮反馈）、`onDragLeave` 与 `onDrop` 事件，严格具备 `canTransition` 合法性检查与非法弹窗提示，支持将卡片拖入流转为 `backlog`；
3. 在 `tests/i18n.spec.ts` 与 `tests/client.spec.ts` 中以 TDD 方式编写 UI 渲染、交互与异常测试用例（覆盖 `TC-FUNC-006` ~ `TC-FUNC-015`, `TC-EDGE-005` ~ `TC-EDGE-008`, `TC-ERR-003` ~ `TC-ERR-006`, `TC-CONC-002`, `TC-CONC-003`），标注 `// @tc TC-xxx` 锚点。

**Acceptance criteria:**
- [x] 国际化字典包含中英文 `board.column.collapseBacklog` 与 `board.column.expandBacklog` (`TC-FUNC-014`, `TC-FUNC-015`)
- [x] 待规划栏展开态渲染列头收起按钮并能点击收起 (`TC-FUNC-006`, `TC-FUNC-007`)
- [x] 待规划栏收起态渲染紧凑竖条及内部结构完整 (`TC-FUNC-008`, `TC-FUNC-009`)
- [x] 点击收起态展开按钮与空白背景均能恢复展开 (`TC-FUNC-010`, `TC-FUNC-011`, RT-005)
- [x] 收起态支持 dragover 高亮及 drop 流转为 `backlog` (`TC-FUNC-012`, `TC-FUNC-013`)
- [x] 零任务与大数值徽标渲染正常 (`TC-EDGE-005`, `TC-EDGE-006`, RT-004)
- [x] 双端同时折叠布局正常 (`TC-EDGE-007`)
- [x] 过滤搜索联动实时更新收起徽标数量 (`TC-EDGE-008`)
- [x] 非法流转拖拽弹窗拦截不移动 (`TC-ERR-003`, RT-002)
- [x] 空白/脏拖拽数据、不存在任务、同状态任务安全忽略 (`TC-ERR-004`, `TC-ERR-005`, `TC-ERR-006`)
- [x] 收起态接收 SSE 推流实时更新徽标且保持收起 (`TC-CONC-002`)
- [x] 拖拽流转版本冲突时优雅提示且视图正常 (`TC-CONC-003`)

**Verification:**
- [x] Tests pass: `npx vitest run tests/client.spec.ts tests/i18n.spec.ts`
- [x] Typecheck: `pnpm run typecheck`

**Dependencies:** Task 1

**Files likely touched:**
- `src/client/i18n/zh.ts`
- `src/client/i18n/en.ts`
- `src/client/board/TaskBoard.tsx`
- `tests/i18n.spec.ts`
- `tests/client.spec.ts`

**Estimated scope:** Medium (5 files)

---

## Checkpoint: Client UI
- [x] Task 2 完成
- [x] `npx vitest run tests/client.spec.ts tests/i18n.spec.ts` 绿灯通过且包含 Task 2 的全部 `@tc` 锚点

---

## Task 3: 全量回归测试与端到端构建检查 (Verification)

**Description:**
执行项目全量单元测试套件、TypeScript 类型检查以及打包构建，验证所有 33 个 `@tc` 锚点完整覆盖，无任何回归。

**Acceptance criteria:**
- [x] `pnpm test` 全部测试绿灯通过
- [x] `pnpm run typecheck` 零类型报错
- [x] `pnpm run build` 打包构建成功
- [x] 33 个 `TC-*` 用例全部具备 `@tc` 注释锚点并在测试套件中成功运行

**Verification:**
- [x] Tests pass: `pnpm test`
- [x] Build succeeds: `pnpm run typecheck && pnpm run build`

**Dependencies:** Task 2

**Files likely touched:** None

**Estimated scope:** Small

---

## Checkpoint: Complete
- [x] 所有任务与测试通过
- [x] 构建产物完整无误
