# 任务看板「待规划」栏侧边收起 测试规格说明书

## 0. 计划红队挑刺与架构假设质询 (Plan Red-Teaming & Assumption Challenge)

> 本节基于怀疑驱动思维（Doubt-Driven Development），对 `tasks/plan.md` 和 `docs/ideas/backlog-column-collapse.md` 进行独立审视与攻击性推演，识别潜在的设计漏洞、隐含假设与边界死锁。

| 质询编号 | 严重等级 (`Blocker`/`Major`/`Minor`) | 关联模块 / 契约签名 | 隐含假设或设计漏洞描述 | 建议契约修正方案 |
|---|---|---|---|---|
| **RT-001** | Major | `src/client/controller.ts`<br>`setBacklogCollapsed` | `plan.md` 提出“完全对齐已完成栏的折叠机制”，但已有 `setDoneCollapsed(false)` 会在展开时触发 `void this.refresh()`（以拉取因 `excludeDone: true` 而忽略的后端任务）。如果开发者盲目复制代码，在 `setBacklogCollapsed(false)` 中也触发 `this.refresh()`，将导致毫无必要的网络请求与性能损耗，甚至可能引发 SSE 竞态刷新冲突。 | 在 `tasks/plan.md` 与用例中明确：`setBacklogCollapsed` 为纯前端视图层控制，展开与收起时均**不得**触发后端 `this.refresh()`。 |
| **RT-002** | Major | `src/client/board/TaskBoard.tsx`<br>`onDrop` 守卫 | `plan.md` 提及收起栏“支持卡片拖拽放入流转为 backlog”，但未显式强调流转合法性校验。现有展开栏的 drop 逻辑包含 `canTransition(task.status, status)` 守卫与 `t('board.drag.forbidden')` 弹窗。若收起态直接调用 `controller.move` 而遗漏守卫，会导致跨列非法跃迁（如未允许状态直接移入 backlog）。 | 明确收起态的 `onDrop` 实现必须 100% 对齐现有列的流转校验契约：先校验 `canTransition(task.status, 'backlog')`，不合法时调用 `showAlert` 并中止流转。 |
| **RT-003** | Minor | `src/client/controller.ts`<br>`loadView()` | `plan.md` 假定 localStorage 中的数据总是规范格式。但在用户浏览器升级、跨版本迁移或第三方扩展篡改时，`backlogCollapsed` 可能为字符串 `"true"`、数字 `1` 或对象。若使用 `Boolean(parsed.backlogCollapsed)` 可能将非空无效值转为 `true`。 | 契约必须严格采用全等判断：`backlogCollapsed: parsed.backlogCollapsed === true`，任何非布尔真值统一降级为 `false`。 |
| **RT-004** | Minor | `src/client/board/TaskBoard.tsx`<br>数量徽标渲染 | 已完成栏收起时使用了 `state.doneCount ?? columnTasks.length`，因为后端有针对已完成任务的聚合计数支持。但待规划栏目前无后端独立 count 字段，其在收起形态下的任务计数必须严格等于当前列筛选后的任务数 `columnTasks.length`。若错误引用 `doneCount` 会导致计数错误。 | 明确待规划栏折叠状态下的徽标取值契约固定为 `columnTasks.length`。 |
| **RT-005** | Minor | `src/client/board/TaskBoard.tsx`<br>展开交互事件冒泡 | 收起状态条外层容器具备 `onClick` 展开事件，内部的展开按钮同样具备 `onClick` 事件。若展开按钮未调用 `e.stopPropagation()`，点击展开按钮将引发事件冒泡导致展开逻辑执行两次。 | 明确内部折叠按钮必须包含 `e.stopPropagation()`，确保事件处理干净独立。 |

---

## 1. 概述、契约映射与测试范围

- **需求目标**：为任务看板首列「待规划（Backlog）」栏提供与末列「已完成（Done）」栏完全对齐的侧边折叠/展开体验。通过在 Controller 中维护并持久化 `backlogCollapsed` 状态，在列头与收起条上提供直观的折叠/展开切换，并保持收起态下的卡片拖拽放入（Drag & Drop）能力与国际化文案支持。
- **关联文档**：
  - 需求规格文档：`docs/ideas/backlog-column-collapse.md`
  - 开发实现计划：`tasks/plan.md`
- **包含范围 (In Scope)**：
  1. `ControllerState` 中 `backlogCollapsed: boolean` 状态字段的生命周期（初始化、读写、持久化）。
  2. `loadView()` 对 `dsh-taskboard-view-v1` (localStorage) 的容错解析与默认值回退。
  3. `BoardController.setBacklogCollapsed(collapsed: boolean)` 的状态变更、持久化写回与无副作用验证。
  4. 国际化词条：`board.column.collapseBacklog` 与 `board.column.expandBacklog` 在 `zh.ts` 和 `en.ts` 中的完整性与对齐。
  5. `TaskBoard.tsx` 中「待规划」列处于展开态时的列头收起按钮渲染与点击交互。
  6. `TaskBoard.tsx` 中「待规划」列处于收起态时的 `data-collapsed="true"` 紧凑条渲染（状态圆点、竖排标题、计数徽标、展开按钮）。
  7. 收起态下的展开交互（点击展开按钮、点击收起条背景）。
  8. 收起态下的卡片拖拽（DragOver 高亮、Drop 状态机校验与 `controller.move` 调用）。
  9. 双端折叠（待规划栏与已完成栏同时收起）时的看板整体布局自适应。
- **排除范围 (Out of Scope)**：
  - 待规划栏内部任务分页或截断（无 `limit` 折叠条，仅作整列侧边收起）。
  - 后端接口对 backlog 的过滤排除（纯前端视图折叠，不涉及后端 `excludeBacklog` 参数）。
  - 中间三列（待办、进行中、待审阅）的折叠交互。

---

## 2. 功能正向用例设计 (Functional Test Cases — `TC-FUNC`)

> 覆盖各实现任务的核心等价类与主干业务路径（Happy Path）。

| 用例编号 | 关联切片 (Task) | 目标契约签名 (Function / API) | 前置状态 (Arrange) | 测试输入与动作 (Act) | 预期输出与状态变更 (Assert) |
|---|---|---|---|---|---|
| `TC-FUNC-001` | Task 1 | `BoardController.getSnapshot()` | 清空 `localStorage` | 实例化全新 `BoardController` | `controller.getSnapshot().backlogCollapsed` 恒为 `false`（默认展开） |
| `TC-FUNC-002` | Task 1 | `BoardController.setBacklogCollapsed(true)` | 控制器处于默认展开状态 (`backlogCollapsed: false`) | 调用 `controller.setBacklogCollapsed(true)` | 1. 快照中 `backlogCollapsed` 变为 `true`<br>2. 订阅者收到一次状态变更通知<br>3. 不触发网络请求或全量刷新 |
| `TC-FUNC-003` | Task 1 | `BoardController.setBacklogCollapsed(false)` | 控制器处于收起状态 (`backlogCollapsed: true`) | 调用 `controller.setBacklogCollapsed(false)` | 1. 快照中 `backlogCollapsed` 恢复为 `false`<br>2. 不会触发 `refresh()`（与 `doneCollapsed` 的差异） |
| `TC-FUNC-004` | Task 1 | `persistView()` | `localStorage` 初始无视图记录 | 调用 `controller.setBacklogCollapsed(true)` | 读取 `localStorage.getItem('dsh-taskboard-view-v1')`，解析为 JSON 对象，包含 `backlogCollapsed: true` 且保留已有 filters 和 sortBy 属性 |
| `TC-FUNC-005` | Task 1 | `loadView()` | `localStorage` 预设 `{"backlogCollapsed": true, "sortBy": "title"}` | 实例化新的 `BoardController` | 控制器初始状态即包含 `backlogCollapsed: true`，且 `sortBy: 'title'` |
| `TC-FUNC-006` | Task 2 | `TaskBoard` 列头收起按钮渲染 | `backlogCollapsed === false`，挂载 `TaskBoard` | 检查 `status === 'backlog'` 的列头 `.dsh-atb-colhead` | 1. 列头渲染收起按钮 `.dsh-atb-colfoldbtn`<br>2. 按钮 `title` 属性为 `board.column.collapseBacklog` 对应的翻译文案<br>3. 内嵌折叠 SVG 图标 |
| `TC-FUNC-007` | Task 2 | `TaskBoard` 列头收起按钮交互 | `backlogCollapsed === false`，挂载 `TaskBoard` | 找到待规划列头 `.dsh-atb-colhead .dsh-atb-colfoldbtn` 并触发 `click` 事件 | 1. `controller.setBacklogCollapsed` 被调用且入参为 `true`<br>2. 控制器状态更新为 `backlogCollapsed: true` |
| `TC-FUNC-008` | Task 2 | `TaskBoard` 收起态紧凑条渲染 | `backlogCollapsed === true`，挂载 `TaskBoard` | 查找 `status === 'backlog'` 的 DOM 节点 | 1. 渲染为 `.dsh-atb-column[data-collapsed="true"]`<br>2. 宽度表现为 42px 侧边竖条<br>3. 包含子容器 `.dsh-atb-col-collapsed-bar` |
| `TC-FUNC-009` | Task 2 | `TaskBoard` 收起态元素完整性 | `backlogCollapsed === true`，包含 3 个 backlog 任务 | 检查收起竖条 `.dsh-atb-col-collapsed-bar` 的内部结构 | 1. 包含展开按钮 `button.dsh-atb-colfoldbtn`<br>2. 包含圆点 `.dsh-atb-dot[data-status="backlog"]`<br>3. 包含竖排文字 `.dsh-atb-col-collapsed-text`，内容为「待规划」或「Backlog」<br>4. 包含徽章 `.dsh-atb-colcount`，内容为 `"3"` |
| `TC-FUNC-010` | Task 2 | `TaskBoard` 收起态展开按钮交互 | `backlogCollapsed === true`，挂载 `TaskBoard` | 点击收起条中的展开按钮 `.dsh-atb-colfoldbtn` | 1. 触发 `controller.setBacklogCollapsed(false)`<br>2. 看板重新渲染为展开列，`.dsh-atb-column[data-collapsed="true"]` 消失 |
| `TC-FUNC-011` | Task 2 | `TaskBoard` 点击收起条空白区域展开 | `backlogCollapsed === true`，挂载 `TaskBoard` | 点击收起条容器 `.dsh-atb-col-collapsed-bar` | 1. 触发 `controller.setBacklogCollapsed(false)`<br>2. 看板重新展开待规划列 |
| `TC-FUNC-012` | Task 2 | `TaskBoard` 收起态拖拽悬浮交互 | `backlogCollapsed === true`，挂载 `TaskBoard` | 模拟从其他列拖动任务，向待规划收起条派发 `dragover` 事件，携带 `application/x-dsh-atb-task` 类型数据 | 1. `dragover` 事件的 `defaultPrevented` 为 `true`<br>2. `dataTransfer.dropEffect` 被设置为 `'move'`<br>3. 目标列附带 `data-dragover="true"` 属性样式 |
| `TC-FUNC-013` | Task 2 | `TaskBoard` 收起态拖拽放置与流转 | `backlogCollapsed === true`，存在 `todo` 任务 `t-1` (version: 1) | 将 `t-1` 拖拽并 `drop` 到待规划收起条 | 1. `data-dragover` 属性被清理<br>2. 触发 `controller.move('t-1', 1, 'backlog')`<br>3. 任务状态成功流转为 `backlog` |
| `TC-FUNC-014` | Task 2 | 国际化词条完整性与中英对齐 | 引入 `src/client/i18n/zh.ts` 和 `en.ts` | 检查两个字典中的键值对 | 1. `zh` 与 `en` 均包含 `board.column.collapseBacklog` 与 `board.column.expandBacklog`<br>2. `zh` 文案分别为 `'收起「待规划」列'` 与 `'展开「待规划」列'`<br>3. `en` 文案分别为 `'Collapse "Backlog" column'` 与 `'Expand "Backlog" column'`<br>4. 所有文案非空且去除空格后长度大于 0 |
| `TC-FUNC-015` | Task 2 | 国际化动态切换文案渲染 | 分别设置 `document.documentElement.lang = 'zh-CN'` 与 `'en-US'` | 渲染包含折叠按钮与收起条的组件 | 1. 中文环境下 hover 提示和 title 显示对应中文<br>2. 英文环境下 hover 提示和 title 显示对应英文 |

---

## 3. 边界值与极端情况用例 (Boundary & Edge Cases — `TC-EDGE`)

> 针对数值极值、存储脏数据、容器空间自适应与边界容量进行防御设计。

| 用例编号 | 关联切片 (Task) | 边界维度 | 边界场景与输入构造 | 预期防御与返回值断言 | 风险等级 |
|---|---|---|---|---|---|
| `TC-EDGE-001` | Task 1 | 存储不存在 (null) | `localStorage.getItem(VIEW_KEY)` 返回 `null`（首次访问或无痕模式启动） | `loadView()` 安全返回默认结构，`backlogCollapsed` 为 `false`，不报错不中断 | 中 |
| `TC-EDGE-002` | Task 1 | 损坏的存储数据 (Malformed JSON) | `localStorage.setItem(VIEW_KEY, "{ invalid-json ...")` | `loadView()` 内部 `try...catch` 捕获解析异常，平滑降级返回默认结构，`backlogCollapsed: false` | 高 |
| `TC-EDGE-003` | Task 1 | 脏数据类型防御 | `localStorage` 存入非规范类型：`{"backlogCollapsed": "true"}`、`{"backlogCollapsed": 1}`、`{"backlogCollapsed": {}}` 或 `{"backlogCollapsed": null}` | `loadView()` 严格执行 `parsed.backlogCollapsed === true` 检查，所有非布尔真值均安全转换为 `false`，绝不污染快照 | 高 |
| `TC-EDGE-004` | Task 1 | 历史版本数据迁移兼容 | `localStorage` 存有旧版本视图配置（包含 `urgencies`、`sortBy`、`doneCollapsed`，但无 `backlogCollapsed` 键） | `loadView()` 正常解析已有字段，并将缺失的 `backlogCollapsed` 安全默认置为 `false` | 中 |
| `TC-EDGE-005` | Task 2 | 零容量集合边界 | 看板中没有处于 `backlog` 状态的任务（任务数量为 0） | 待规划栏处于收起状态时，`.dsh-atb-colcount` 准确显示 `"0"`，无空指针或布局坍塌 | 低 |
| `TC-EDGE-006` | Task 2 | 大数值徽标排版边界 | 看板中包含 999 个 `backlog` 任务 | 收起条的 `.dsh-atb-colcount` 正常展示 `"999"`，文字在 42px 宽度的竖条内正常居中，不产生水平溢出破损 | 低 |
| `TC-EDGE-007` | Task 2 | 双端折叠共存布局边界 | 同时设置 `backlogCollapsed = true` 且 `doneCollapsed = true` | 1. 首列（待规划）与尾列（已完成）均渲染为 42px 紧凑收起条<br>2. 中间三列（待办、进行中、待审阅）利用 flex 自适应平分全部剩余宽度<br>3. 整个看板容器不产生横向异常滚动条 | 高 |
| `TC-EDGE-008` | Task 2 | 视图过滤与搜索联动边界 | 处于收起态时，设置全局筛选（如选择特定项目或关键词搜索），导致可见 backlog 任务由 5 变为 0 | 收起条中的计数徽标 `.dsh-atb-colcount` 同步由 `"5"` 更新为 `"0"`，实时反映当前筛选条件下的可见任务数 | 中 |

---

## 4. 异常流与容错幂等用例 (Negative & Fault-Tolerance — `TC-ERR`)

> 针对状态机防御、非合法拖拽、权限与本地存储失效进行容错验证。

| 用例编号 | 关联切片 (Task) | 异常类型 | 故障/攻击输入模拟 | 预期防御与状态不变量断言 |
|---|---|---|---|---|
| `TC-ERR-001` | Task 1 | 幂等操作防重 | 当 `backlogCollapsed` 已为 `true` 时，再次调用 `controller.setBacklogCollapsed(true)`；或反向重复调用 `setBacklogCollapsed(false)` | 1. 状态保持幂等，不会触发无效的多余更新通知<br>2. 维持原布尔值不变 |
| `TC-ERR-002` | Task 1 | 存储受限与异常隔离 | 模拟 Safari 无痕模式或配额耗尽环境：`localStorage.setItem` 抛出 `DOMException (QuotaExceededError)` | `persistView()` 内部 `try...catch` 拦截异常并静默降级，控制器内存状态正常变更，不向外层抛出未捕获错误 |
| `TC-ERR-003` | Task 2 | 非法状态拖拽流转守卫 | 将一个规则禁止流转为 `backlog` 的任务（如通过 `canTransition(task.status, 'backlog') === false` 模拟）拖入收起的待规划栏 | 1. 触发 `showAlert` 提示 `board.drag.forbidden` 国际化文案<br>2. 中止流转，绝不调用 `controller.move`<br>3. 任务保持原有状态不变 |
| `TC-ERR-004` | Task 2 | 拖拽携带空白/脏数据 | 模拟外部无效拖拽事件，`dataTransfer.getData(DRAG_TYPE)` 返回空字符串 `""` 或不包含目标 mime-type | 目标收起栏 `onDrop` 守卫直接安全 `return`，不抛出异常，不调用 `controller.move` |
| `TC-ERR-005` | Task 2 | 拖拽目标卡片不存在 | 拖拽携带了任务 ID `t-ghost`，但该任务在当前 `ledger.tasks` 中已被并发删除或不存在 | `onDrop` 查找任务返回 `undefined`，安全拦截退出，不发起非法网络操作 |
| `TC-ERR-006` | Task 2 | 拖拽同状态卡片防重 | 拖拽已处于 `backlog` 状态的卡片重新放置到收起的待规划栏 | 检测到 `task.status === 'backlog'`，直接安全忽略，不发起重复移动请求 |

---

## 5. 时序与并发竞态用例 (Concurrency & State Machine — `TC-CONC`)

> 针对高频快速切换、推流并发与版本冲突下的状态一致性进行验证。

| 用例编号 | 关联切片 (Task) | 时序/并发场景描述 | 触发序列构造 | 预期一致性断言 |
|---|---|---|---|---|
| `TC-CONC-001` | Task 1 | 高频连续切换收起与展开 | 在 10ms 内连续调用 `setBacklogCollapsed(true)` -> `setBacklogCollapsed(false)` -> `setBacklogCollapsed(true)` | 1. 最终内存快照为 `backlogCollapsed: true`<br>2. `localStorage` 最终保存值为 `true`<br>3. 状态与存储维持最终一致性，无时序倒错 |
| `TC-CONC-002` | Task 2 | 收起态下并发接收 SSE 增量推流 | 待规划栏保持收起状态（`backlogCollapsed: true`，任务数为 1），此时服务端通过 SSE 推送新增一条 `status: 'backlog'` 的任务 | 1. 控制器接收并合并 ledger 快照<br>2. 收起栏上的 `.dsh-atb-colcount` 立即响应更新为 `"2"`<br>3. 列收起状态保持为 `true` 不被打断或意外展开 |
| `TC-CONC-003` | Task 2 | 拖拽移动与后端并发修改产生版本冲突 | 用户将卡片拖入待规划栏触发 `controller.move(id, v1, 'backlog')`，但在请求发送前该卡片在服务端已被修改并递增到 `v2` | 1. 服务端返回版本冲突响应（409 Conflict）<br>2. 控制器按照现有错误处理机制展示版本过期提示<br>3. 前端待规划栏依然稳定保持收起，视图不崩溃白屏 |
| `TC-CONC-004` | Task 1 & 2 | 独立性互不干扰：`doneCollapsed` 与 `backlogCollapsed` 并发修改 | 交叉调用 `setDoneCollapsed(true)` 与 `setBacklogCollapsed(true)`，随后单独调用 `setDoneCollapsed(false)` | 1. `setDoneCollapsed(false)` 触发了它的全量刷新，但 `backlogCollapsed` 依然稳定保持为 `true`<br>2. `localStorage` 中两个键值互不影响，各自保持最新状态 |

---

## 6. 机械化追溯与门禁核对要求 (Traceability Contract)

- [ ] `senior-dev` 在编写测试用例代码时（如在 `tests/client.spec.ts` 与 `tests/i18n.spec.ts` 中），**必须在每个测试用例前添加对应的注记注释**，格式为：
  ```ts
  // @tc TC-FUNC-001
  it('controller: default backlogCollapsed is false', ...)
  ```
- [ ] 严格对齐接口签名与契约：
  - `ControllerState.backlogCollapsed: boolean`
  - `BoardController.setBacklogCollapsed(collapsed: boolean): void`
  - `loadView(): { ...; backlogCollapsed: boolean }`
  - 字典词条：`board.column.collapseBacklog` 与 `board.column.expandBacklog`
- [ ] 测试执行门禁通过标准：
  - 执行 `pnpm test` 或 `npx vitest run tests/client.spec.ts tests/i18n.spec.ts` 全部通过。
  - 所有定义的 `TC-FUNC`、`TC-EDGE`、`TC-ERR`、`TC-CONC` 均具备对应的自动化或集成测试映射覆盖。
  - 门禁核验工具 `verify_gate.py` 将检查本规格书与提交代码中 `@tc` 标记的 100% 覆盖率。
