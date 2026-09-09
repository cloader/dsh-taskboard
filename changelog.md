# 更新日志 / Changelog

### 0.6.6

- **修复：`taskboard_get`（以及 `taskDetail`）渲染的验收清单缺失每个 DoD 条目 id，导致 agent 无法把 checklist 项地址化给 `taskboard_checklist check/uncheck`**：数据层 `ChecklistItem` 本就带 `id`（`k-<base36>-<base36>`，见 `newChecklistItemId`），但 `taskboard_get` 的文本渲染只打印「☐ 文本 + 勾选人 + 证据」，丢弃了 `item.id`（也无序号）；`taskboard_list` 的 `TaskSummary` 更是只折叠出 `checklist:{done,total}` 进度计数。因此 agent 从两个只读接口的输出都拿不到每个 DOD 项的标识，而 `taskboard_checklist` 的 `check/uncheck` 又强制要求 `itemId`——无只读来源可推导，agent 只能猜测并撞 `not_found`。修复：`taskDetail()` 的验收清单行现在随文本一并输出序号与 `id=${item.id}`，与 `taskboard_checklist` 工具自身的回显格式对齐；agent 读 `taskboard_get` 即可直接拿到每个 DoD 项的 `itemId` 去勾选。新增回归守护测试：断言 `taskboard_get` 渲染逐项携带 checklist 条目 id 与序号。纯渲染修复，不改数据模型/账本/前端，无 token 面扩大影响

**English:**

- **Fix: `taskboard_get` (via `taskDetail`) rendered the DoD checklist without each item's id, so an agent could never address a checklist item to `taskboard_checklist check/uncheck`**: the data layer `ChecklistItem` already carries an `id` (e.g. `k-<base36>-<base36>` from `newChecklistItemId`), but `taskboard_get`'s text render only printed "☐ text + checker + note", dropping `item.id` (and any position index); `taskboard_list`'s `TaskSummary` collapses to just `checklist:{done,total}`. Reading either read-only interface yielded no identifier for a DOD item, while `taskboard_checklist` `check/uncheck` hard-require an `itemId` — nothing to derive it from, the agent could only guess and hit `not_found`. Fix: each `taskDetail` checklist line now carries its position and `id=${item.id}` (mirroring the `taskboard_checklist` tool's own echo format), so reading `taskboard_get` is enough to reconstruct every DoD item's id and check it off. New regression test asserts the render carries each item id and position. Pure render fix — no model/ledger/frontend change, no token-usage impact

### 0.6.5

- **修复：与 dsh-better-sidebar 并存时看板顶栏右侧按钮被其右上角常驻按钮簇遮挡（[#19](https://github.com/cloader/dsh-taskboard/issues/19)，@heptaspirit 报告）**：better-sidebar 在视口右上角钉有「展开底部面板 / 展开侧边栏」常驻按钮簇（z-index 45 浮层，占视口右边 10~70px、纵向与中栏顶带重合），它对 DSH 原生会话头的避让契约（右栏收起时 header `padding-right:78px`）在看板激活时失效——看板隐藏了该会话头并把自己的工具条放进同一条顶带，右端控件（筛选 chip、设置/诊断/导入导出、版本号）沉到按钮簇下面，窗口越窄挤进角落的控件越多。修复：镜像 better-sidebar 自己的避让契约——看板激活且其右栏收起（`body[data-dsh-sidebar-collapsed]`）时，工具条右侧预留 62px（70px 簇足迹 + 8px 间隙 − 16px 看板自身 padding），作用于全部换行行，任何窗口宽度下工具条内容都不再进入簇区；未安装 better-sidebar 或其右栏展开时规则零生效，纯 CSS 无 JS 开销

**English:**

- **Fix: the board toolbar's right-side controls overlapped by dsh-better-sidebar's persistent corner toggle cluster ([#19](https://github.com/cloader/dsh-taskboard/issues/19), reported by @heptaspirit)**: better-sidebar pins its "expand bottom panel / expand sidebar" cluster at the viewport's top-right corner (a z-index 45 overlay spanning 10-70px from the right edge, vertically coinciding with the center column's top band); its yield contract for DSH's own session header (`padding-right: 78px` while the right panel is collapsed) goes moot when the board is active — the board hides that header and puts its toolbar into the same top band, whose right end (filter chips, settings/diagnostics/import-export, the version pill) sinks beneath the cluster, worsening as the window narrows. Fix: mirror better-sidebar's own yield contract — while the board is active AND its right panel is collapsed (`body[data-dsh-sidebar-collapsed]`), the toolbar reserves 62px on its right (70px cluster footprint + 8px gap − 16px board padding), applied to every wrapped row so no toolbar content enters the cluster zone at any window width; with better-sidebar absent or its panel open the selector never matches — pure CSS, zero JS cost

### 0.6.4

- **修复：client 激活早于 locale 服务时界面语言被永久定型为英文（[#16](https://github.com/cloader/dsh-taskboard/issues/16)，@imroc 报告并验证方案）**：taskboard client 零依赖、先于 `dsh-client-locale` 激活，`initI18n` 拿不到服务时的一次性回退检测撞上服务端渲染的静态 `<html lang="en">`，此后无重试。修复：无服务分支增加「迟挂载」——MutationObserver 监听 `<html lang>` 变化即时重新检测发布（locale 运行时激活同步 lang 后立即跟随），并以 250ms×8 轮询重试 `ctx.get('locale')`、服务出现即正常订阅接管；dispose 全量拆除

**English:**

- **Fix: the board language froze to English when the client activated before the locale service ([#16](https://github.com/cloader/dsh-taskboard/issues/16), reported and fix verified by @imroc)**: the taskboard client has zero service deps and activates BEFORE `dsh-client-locale` provides; the one-shot fallback detection in `initI18n` then hit the server-rendered static `<html lang="en">` and never retried. Fix: a LATE ATTACH on the no-service path — a MutationObserver on `<html lang>` re-detects and publishes the moment the locale runtime syncs it, and a 250ms×8 poll retries `ctx.get('locale')`, attaching (and subscribing to) the real service as soon as it exists; dispose tears everything down

### 0.6.3

- **并列多仓库工作空间的 Worktree 镜像模式**
  - Worktree 隔离升级为「任务镜像」：自动发现工作区内的并列 git 仓库（根仓库 + 有界扫描嵌套仓库，深度 ≤3、上限 8 个、60s 缓存），每个仓库各自建立同名任务分支的 worktree，按其在工作区中的相对路径挂进 `<项目>/.dsh-worktrees/<任务ID>/`，形成结构同构的任务镜像
  - 每仓库独立的提交证据（commits / 未提交修改 / diff 统计）与合并：详情页「合并」按仓库顺序逐个 `--no-ff` 合并，一个仓库冲突不阻断其他仓库，系统评论与弹窗按仓库汇总结果（✓ 已合并 / ⟲ 无新提交 / ✗ 失败原因）
  - 部分失败不破界：某仓库镜像准备失败仅将其从镜像中剔除并在执行引导中标注「禁改」，首个（根）仓库失败仍整体降级原目录执行；仓库数超上限整体降级并注明原因
  - Diff 查看器支持 `?repo=` 按仓库查看：镜像 worktree 优先，回落该仓库主检出；任务镜像清理（删 worktree / 物理清除 / 孤儿清理）聚合所有仓库的未提交检查后「先子后根」删除，任一仓库有未提交修改则整体拒绝
  - 任务记录新增 `branches`（各仓库分支 pin）与执行记录 `repos`（各仓库证据），纯附加字段——单仓库工作区行为、账本格式、旧数据完全不变
  - 不支持 git submodule / linked worktree 形态的嵌套目录（发现阶段跳过）
  - 镜像清理与证据的评审修复：根镜像的 dirty 检查/证据采集/合并 clean 检查现在豁免镜像结构性噪声（嵌套子镜像的 untracked 目录与 gitlink 漂移 `M 子仓`）——此前真实 git 下已全部提交的镜像仍被判 dirty，三条清理路由永远拒绝、settle 证据永远显示有未提交修改、容器工作区（根仓库以 gitlink 跟踪子仓）根分支无法合并；镜像删除修正为真正的「先子后根」并在聚合预检查通过后对根镜像以豁免+force 移除；新增真实 git 端到端集成测试（`tests/mirror-real-git.spec.ts`）覆盖整条闭环
  - DSH STORE 复检修复：`dsh.compatibility.dshReleases` 兼容矩阵扩展至 0.1.2-alpha 线（0.1.2-alpha.2 / alpha.3 / alpha.4 逐项声明 `compatible`），解除「最新 3 个官方版本无兼容结论」的暂时下架（[DSH-Store#321](https://github.com/AI-Scarlett/DSH-Store/issues/321)）；三个版本均以一次性 Profile 实测通过——独立 DSH_HOME 安装对应 dsh 版本 + link 挂载本插件 → 无头启动 `dsh web` → `/dsh-taskboard/state`、`/dsh-taskboard/workspaces` 探活 HTTP 200 → 卸载
  - 表单镜像徽章与纯容器工作区修复：新建任务表单的 Worktree 隔离选项在多仓库工作区显示「将自动整区镜像 N 个仓库」提示（workspaces 路由新增 `repoCount`）；工作区可用性判定从「根目录是 git 仓库」扩展为「根仓库或扫描到并列嵌套仓库」——纯容器工作区（根非仓库、只有并列子仓）不再被误标「非 git 仓库」而禁用 worktree 选项（host 端 prepareMirror 本就支持该形态）；看板设置默认隔离的 worktree 说明补充多仓库自动镜像

**English:**

- **Worktree mirror mode for parallel multi-repo workspaces**
  - Worktree isolation becomes a whole-workspace task mirror: the plugin discovers every parallel git repository in the workspace (root repo plus a bounded nested scan — depth ≤3, capped at 8 repos, 60s cache) and prepares one worktree per repo on the same task branch, mounted at its relative path under `<project>/.dsh-worktrees/<taskId>/`
  - Per-repo commit evidence (commits / dirty files / diff stats) and merging: the detail-page merge runs `--no-ff` per repo sequentially — one repo's conflict never blocks the others; the system comment and the alert summarize per-repo outcomes (✓ merged / ⟲ nothing to merge / ✗ failed)
  - Partial failure never blurs the boundary: a repo whose mirror preparation fails is dropped from the mirror and marked do-not-touch in the session framing; a failing first (root) repo still degrades the whole run; exceeding the repo cap degrades with a readable note
  - The diff viewer accepts `?repo=` per repo (mirror worktree first, falling back to that repo's main checkout); mirror cleanup (worktree-remove / purge / orphan cleanup) aggregates dirty checks across ALL repo worktrees and removes children before the root — any dirty repo refuses everything
  - Additive records only: `TaskRecord.branches` and `ExecutionRecord.repos` are new optional fields — single-repo workspaces keep byte-identical behavior, ledger format, and old data
  - Nested directories in submodule / linked-worktree form (.git as a file) are skipped by discovery
  - Review fixes for mirror cleanup and evidence: the root mirror's dirty checks, evidence collection, and merge clean-check now EXEMPT mirror-structural noise (untracked nested child worktrees and gitlink drift `M sub-repo`) — on real git a fully committed mirror still read as dirty, every cleanup route refused forever, settlement evidence always showed phantom uncommitted changes, and container workspaces (root repo tracking sub-repos as gitlinks) could never merge the root branch; mirror removal is now genuinely children-first and force-removes the root through that exempted noise once the aggregated real-dirty check has passed; a new real-git end-to-end integration test (`tests/mirror-real-git.spec.ts`) covers the whole loop
  - DSH STORE recheck fix: the `dsh.compatibility.dshReleases` matrix now covers the 0.1.2-alpha line (0.1.2-alpha.2 / alpha.3 / alpha.4 each declared `compatible`), clearing the "no compatible verdict for the latest 3 official releases" temporary unlisting ([DSH-Store#321](https://github.com/AI-Scarlett/DSH-Store/issues/321)); all three verified on disposable profiles — per-version install with an isolated DSH_HOME + link-mounted plugin → headless `dsh web` → `/dsh-taskboard/state` and `/dsh-taskboard/workspaces` probed at HTTP 200 → uninstalled
  - Form mirror badge + pure-container fix: the create-task form's worktree option now shows an "automatically mirrors N repos" note on multi-repo workspaces (the workspaces route gains `repoCount`); workspace availability widens from "the root is a git repo" to "a root repo OR any parallel nested repo" — pure-container workspaces (root not a repo, parallel sub-repos only) are no longer mislabeled non-git with the worktree option locked away (prepareMirror has supported that shape all along); the board-settings worktree hint mentions the auto-mirror

### 0.6.2

- **修复：DSH STORE 收录的两个确定性阻断（[DSH-Store#321](https://github.com/AI-Scarlett/DSH-Store/issues/321)）**
  - client 打包开启压缩（rolldown minify）：wrap 后 `lib/client.js` 从 320,851 字节降至 203,793 字节，重新低于 DSH STORE 单文件 262,144 字节（256 KiB）审核上限，解除「更新暂缓」
  - `package.json` 新增 `dsh.compatibility.dshReleases` 逐版本兼容声明（`0.1.1-rc.2: compatible`；`0.1.0-rc.8` / `0.1.1-rc.1: unknown`），并声明 `engines.node >=22`，解除「兼容性暂时下架」
  - 新增 `tests/client-size-budget.spec.ts` 体积预算测试：client 产物超出 256 KiB 上限减 16 KiB 预算线即测试失败，防止未来增长无声撞线
  - 无功能变化，纯构建配置与清单整改

**English:**

- **Fix: the two deterministic blockers to the DSH STORE listing ([DSH-Store#321](https://github.com/AI-Scarlett/DSH-Store/issues/321))**
  - The client bundle is now minified (rolldown minify): the wrapped `lib/client.js` shrinks from 320,851 to 203,793 bytes, back under DSH STORE's 262,144-byte (256 KiB) per-file review bound — clearing "update deferred"
  - `package.json` now declares per-release `dsh.compatibility.dshReleases` (`0.1.1-rc.2: compatible`; `0.1.0-rc.8` / `0.1.1-rc.1: unknown`) plus `engines.node >=22`, clearing "compatibility unlisted"
  - New `tests/client-size-budget.spec.ts` size-budget test fails the suite whenever the client artifact exceeds the 256 KiB bound minus a 16 KiB headroom, so future growth cannot silently re-trip the gate
  - No functional changes; build configuration and manifest remediation only

### 0.6.1

- **修复：`/` 快捷补全弹层被任务弹窗滚动容器裁剪**
  - 弹层改为 portal 到 document.body 并以 fixed 定位锚定输入框的视口矩形，滚动容器再也不会裁掉命令列表
  - 优先向上展开，上方空间不足自动下翻；贴边时收拢最大高度，由列表内部滚动兜底
  - 弹层打开期间跟随滚动与窗口缩放实时重定位（捕获阶段监听，覆盖表体内部滚动）
- **修复：键盘 ↑/↓ 选择补全项时列表不滚动**
  - 高亮项越出可视区时自动滚动列表使其完整可见（含首尾 wrap-around 跳变）
  - 直接调整列表自身 scrollTop，不用 scrollIntoView，避免连带滚动弹层后面的模态表体

**English:**

- **Fix: the `/` completion popup was clipped by the task-modal scroll container**
  - The popup now portals to document.body, fixed-positioned from the textarea's viewport rect — the scrollable form body can no longer clip the command list
  - Opens above by preference and flips below when the top is tight; clamps its max height at the edges with the list scrolling internally
  - Repositions live while open on scrolling and viewport resizes (a capture-phase listener covers the modal body's own scrolling)
- **Fix: arrow-key selection did not scroll the completion list**
  - The keyboard-highlighted item is scrolled fully into view automatically, including wrap-around jumps
  - Adjusts the list's own scrollTop directly instead of scrollIntoView, which would also scroll the modal body behind the popup
### 0.6.0

- **任务弹窗左右双栏宽屏布局、输入框 / 快捷补全与执行权限选择： [@jw5555555555](https://github.com/jw5555555555)（[#14](https://github.com/cloader/dsh-taskboard/pull/14)）**
  - 新建/编辑弹窗升级为左右双栏宽屏布局（左栏核心字段与执行配置、右栏描述与执行 Prompt）
  - 描述与 Prompt 输入框支持输入 `/` 快捷补全 Slash 命令与 Agent 技能（↑↓ 选择、Enter/Tab 确认、Esc 关闭，宿主动态发现的命令技能与内置清单合并）
  - 新增任务级「执行权限」三档选择（📁 可写入工作区 / 🔒 仅可查看 / ⚡ 完全权限），看板设置同步新增默认执行权限，卡片与详情页显示权限徽章
  - 描述与 Prompt 中的 Markdown 图片渲染为可点击缩略图并支持灯箱放大
  - 修复模型列表发现（运行时缺失时回落宿主 API）
  - 会话自动同步过滤子代理会话，避免子会话误建卡
- **界面中英双语，跟随 DSH 语言设置**
  - 看板全部界面文案（列头 / 卡片 / 详情 / 表单 / 模板 / 导入导出 / 设置 / 诊断 / 侧边栏入口）接入 DSH locale 服务，「设置 → 通用设置 → 语言」切换 zh/en 即时生效（无需刷新）
  - 语言偏好由 DSH 统一存储（settings.yaml 的 locale.preference），插件自身不新增任何配置
  - 无 locale 服务的部署按浏览器语言自动降级（中文环境 zh，其余 en）
  - 新增 src/client/i18n/（zh/en 双语字典 + 轻量适配器 + useT hook），labels 枚举文案改为键映射
  - 字典键集中英强制一致（编译期类型 + 单测 + 源码扫描三重校验）
  - 顺带修正 PLUGIN_VERSION 与 package.json 的版本漂移（0.5.4 → 0.5.5）

**English:**

- **Two-column wide task form, `/` slash completion and execution-permission picker: [@jw5555555555](https://github.com/jw5555555555) ([#14](https://github.com/cloader/dsh-taskboard/pull/14))**
  - The create/edit modal becomes a two-column wide layout (core fields and execution config on the left, description and execution prompt on the right)
  - The description and prompt inputs gain `/` slash autocomplete for slash commands and agent skills (↑↓ navigate, Enter/Tab pick, Esc close; host-discovered commands/skills merge over the built-in list)
  - New per-task three-way "execution permission" picker (📁 workspace write / 🔒 read-only / ⚡ full access) plus a default-permission board setting, with permission badges on cards and the detail panel
  - Markdown images in description/prompt render as clickable thumbnails with a lightbox
  - Fixes model-catalog discovery (falls back to the host API when the runtime face is missing)
  - Session auto-sync now filters out subagent sessions to avoid spurious cards
- **Bilingual UI following the DSH language setting**
  - All board copy (columns / cards / detail / form / templates / import-export / settings / diagnostics / sidebar entry) now consumes the DSH locale service — switching zh/en under "Settings → General → Language" applies live without a reload
  - The preference stays stored by DSH itself (locale.preference in settings.yaml); the plugin adds no settings of its own
  - Deployments without the locale service fall back to the browser language (zh on Chinese browsers, en otherwise)
  - Adds src/client/i18n/ (zh/en dictionaries + a thin adapter + a useT hook); labels.ts becomes enum key maps
  - zh/en key parity enforced three ways (compile-time types, unit tests, a source scan)
  - Also fixes the PLUGIN_VERSION drift against package.json (0.5.4 → 0.5.5)

### 0.5.5

- **外部工作区会话自动同步看板： [@jw5555555555](https://github.com/jw5555555555)（[#13](https://github.com/cloader/dsh-taskboard/pull/13)）**：看板「设置」新增「自动同步工作区会话」开关（出厂默认关闭）——开启后，工作区直接新建的会话自动在看板生成任务卡片：按会话工作目录（cwd）映射到对应项目，取首条用户消息与会话标题作为任务的描述与标题；运行中自动进入「进行中」并绑定会话 ID（卡片可一键跳转），执行成功自动流转「待验收」并生成系统评论，异常退回「待办」；自动过滤看板自身创建的内部执行会话防止重复建卡；多轮续跑延续同一张卡片

**English:**

- **Sync external workspace sessions onto the board: [@jw5555555555](https://github.com/jw5555555555) ([#13](https://github.com/cloader/dsh-taskboard/pull/13))**: board settings gain an "auto-sync external sessions" toggle (off by default) — once enabled, sessions created directly in a workspace spawn task cards automatically: the project is resolved from the session's cwd, and the first user message plus the session title become the task's description and title; running sessions enter In Progress with the session ID bound (cards gain one-click jump), successful turns settle into In Review with a system comment, failures return to Todo; the board's own internal execution sessions are filtered out to avoid duplicate cards; multi-turn continuations keep the same card

### 0.5.4

- **看板卡片与任务详情一键跳转执行会话： [@jw5555555555](https://github.com/jw5555555555)（[#11](https://github.com/cloader/dsh-taskboard/pull/11)）**：卡片元数据行新增「🤖 会话ID ↗」按钮、详情页顶部新增「🤖 跳转会话 ↗」按钮、持有者 Chip 可点击——进行中优先、其次最近一次执行对应的会话一键直达（看板自动收起）；已归档 / 已删除 / 会话服务不可用分别给出明确提示
- **新建任务记住上次选用的模型，支持设置思考强度： [@jw5555555555](https://github.com/jw5555555555)（[#11](https://github.com/cloader/dsh-taskboard/pull/11)）**：create 模式自动带出上次的模型与思考强度（模板预填与编辑不受影响）；模型可固定思考强度（reasoningEffort，如 low/medium/high），随执行会话下发；支持思考强度的模型从 DSH 模型目录读取可用档位
- **列内排序新增「按标题」： [@Amoss-1](https://github.com/Amoss-1)（[#4](https://github.com/cloader/dsh-taskboard/pull/4)）**：数字感知比较，数字前缀按真实数值排序（`01 < 02 < 10 < 90`，字符串比较会把 `10` 排到 `02` 前）；排序选择随视图状态持久化
- 界面细节：下拉 / 输入框适配明暗主题（DSH 主题变量 + color-scheme）；模板管理弹窗布局优化

**English:**


- **One-click session jump from the card & task detail: [@jw5555555555](https://github.com/jw5555555555) ([#11](https://github.com/cloader/dsh-taskboard/pull/11))**: a "🤖 sessionId ↗" button on cards, a "🤖 Jump to session" button on top of the detail panel, and a clickable holder chip — straight to the running (or most recent) execution's session (the board collapses over it); archived / deleted / unavailable sessions each get distinct notices
- **New-task form remembers the last model, with reasoning-effort support: [@jw5555555555](https://github.com/jw5555555555) ([#11](https://github.com/cloader/dsh-taskboard/pull/11))**: create mode brings back the last chosen model and effort (template prefill and editing are unaffected); a model can pin a reasoning effort (e.g. low/medium/high) passed down to the execution session; reasoning-capable models read their available efforts from the DSH model catalog
- **Column sort gains "by title": [@Amoss-1](https://github.com/Amoss-1) ([#4](https://github.com/cloader/dsh-taskboard/pull/4))**: numeric-aware comparison keeps numeric prefixes in true numeric order (`01 < 02 < 10 < 90` — plain string comparison would put `10` before `02`); the choice persists with the rest of the view state
- Interface polish: selects and inputs adapt to light/dark themes (DSH theme variables + color-scheme); template manager dialog layout improvements

### 0.5.3

- **执行 Prompt 改为追加式**：自定义 Prompt 不再整体替换开场指令——实际发给执行会话的是「标题+任务描述+Prompt」，写在描述里的背景不再被漏掉；新建/编辑表单文案与 `taskboard_create` 工具描述同步更新
- **新增内置「新增功能」模板**：排在「Bug 修复」之前——标题前缀「新增：」，按「明确需求要点 → 实现 → 补测试 → 跑套件」四步走，自带三项验收清单
- **「Bug 修复」模板首行改为「修复以上问题并按序交接」**：描述现在先于 Prompt 送达，「以上」才指得住

**English:**


- **The execution prompt is now append-style**: a custom prompt no longer replaces the opening instructions wholesale — the session receives "title + description + prompt", so context written in the description is no longer dropped; the create/edit form copy and the `taskboard_create` tool description were updated to match
- **New built-in "New feature" template**: placed before "Bug fix" — title prefix "New:", four steps (clarify requirements → implement → add tests → run suites), with a three-item acceptance checklist
- **"Bug fix" template first line now reads "fix the issues above"**: the description now reaches the session before the prompt, so "above" is the right pointer

> 📜 For the complete history of earlier versions, see [changelog.md](changelog.md) (in Chinese).

### 0.5.2

- **支持 DSH Desktop 非兼容模式下侧栏没有「任务看板」入口、看板也打不开的问题（[#6](https://github.com/cloader/dsh-taskboard/issues/6)）**：
- 支持 DSH Desktop V2.0.3 非兼容模式下侧栏没有「任务看板」入口、看板也打不开的问题
- 侧栏入口换上新图标：更直观的三列看板样式
- 新增非兼容模式的回归测试（共 199 项）

**English:**


- **Fixed the missing "Task Board" sidebar entry — and the board that wouldn't open — in DSH Desktop's non-compat mode**: the plugin only recognized the previous two interface generations, and the Desktop's new shell rebuilt the whole layout skeleton, so the entry never found its footing and kept retrying in the background forever. All three shell generations (browser, compatibility mode, non-compat mode) now show the entry and the board properly
- New sidebar icon: a more intuitive three-lane kanban style
- Added regression coverage for non-compat mode (199 cases in total)

### 0.5.1

这一版主要来自一次全面的代码体检：看板更防手滑、更稳，行为上有几处小变化。

- **详情页不再「串卡」**：以前在任务 A 点开「确认清除」后再点开任务 B，B 会直接停在待确认状态，手快就误删了。现在每次打开详情页都是干净状态
- **按钮防连点**：「创建任务」「立即执行」「复制」这些按钮在提交过程中会变灰。以前手快双击会建出两张一样的卡，甚至同时启动两个执行会话白烧 token
- **DSH 重启后马上能正常查板**：以前刚重启的几秒里 AI 查到的是一块空板，可能照流程重复建卡；现在不会了
- **归档的任务真正封存**：以前归档后还能从部分入口继续编辑、评论；现在彻底只读
- **新建任务只能落在 待规划 / 待办**：想开工请正常认领，不会再出现一张没有归属人的「进行中」
- **取消已结束的任务会给明确提示**：以前对已经跑完的任务点「停止」显示取消成功，其实什么都没发生；现在会如实告诉你没取消成
- **执行报告可以补交**：会话结束了才发现忘交报告？现在还能补上（限自己名下最近一次成功执行的任务）
- **复制长标题任务不再报错**：标题太长会自动截断再加（副本）后缀
- **编辑任务不再被偷偷改设置**：以前打开编辑器再保存，会把「跟随部署默认预设」悄悄固化成具体值；现在保持原样
- 内部质量：定时调度出错只记日志不再惊动整个进程、一批测试与构建卫生改进

**English:**


This release comes mostly from a comprehensive code health pass: the board is harder to misuse and steadier, with a few small behavior changes.

- **Detail panel no longer leaks state across cards**: previously, opening "confirm clear" on task A and then opening task B left B sitting in the pending-confirmation state — one fast click deleted things. Every detail-panel open now starts clean
- **Double-click protection**: "Create task", "Run now", "Copy" and friends gray out while submitting. Previously a quick double-click created duplicate cards or launched two concurrent execution sessions burning tokens
- **Board queries correct immediately after a DSH restart**: during the first seconds after restart, AI agents could see an empty board and dutifully re-create cards; fixed
- **Archived tasks are truly sealed**: archived tasks could still be edited/commented through some entry points; now fully read-only
- **New tasks can only land in Backlog or Todo**: start work by claiming properly — no more owner-less "In Progress" cards appearing out of nowhere
- **Stopping an already-finished execution reports honestly**: clicking "Stop" on a finished run used to claim success while doing nothing; now it tells you the truth
- **Execution reports can be submitted late**: realized the report was forgotten after the session ended? You can still submit (limited to your own most recent successful execution on that task)
- **Duplicating long-titled tasks no longer errors**: over-long titles are truncated with a "(copy)" suffix before creation
- **Editing no longer silently pins settings**: saving the editor used to freeze "follow deployment default preset" into a concrete value; it now stays as-is
- Internal quality: scheduler errors log instead of crashing the process, plus a batch of test and build-hygiene improvements

### 0.5.0

- **新增「看板设置」**：看板顶栏多了个「🛠 设置」按钮，可以选择新建任务默认怎么执行——在独立分支里隔离着干，或者直接在项目文件夹里干。保存后，新建的任务都按这个来；已经建好的任务不受影响
- **新建任务默认改为「直接在项目文件夹执行」**：以前新任务默认会在独立分支里执行，现在默认不开分支、直接在项目文件夹干活。习惯分支隔离的团队，到「🛠 设置」里改回来就行
- **导出按钮合并成一个**：原来的「⬇ JSON」「⬇ CSV」两个按钮合并成一个「⬇ 导出」，点开再选要哪种格式
- 新建任务时不再记住上一次的隔离选择，统一跟着「看板设置」走

**English:**


- **Board Settings added**: a "🛠 Settings" button appears in the board toolbar letting you choose the default execution mode for new tasks — isolated in a dedicated branch, or directly in the project folder. Saving applies to all newly created tasks; existing tasks are untouched
- **Default for new tasks changed to "run directly in the project folder"**: new tasks used to default to branch isolation; they now skip branching and work in the project folder. Teams preferring branch isolation can flip it back in "🛠 Settings"
- **Export buttons merged**: "⬇ JSON" and "⬇ CSV" merged into one "⬇ Export" — click and choose the format
- The create form no longer remembers the previous isolation choice; it follows Board Settings uniformly

### 0.4.5

- **移除 0.4.4 引入的「每 2 秒自动检查样式」机制**：上一版给样式表打的归属标记已经从根上解决了误删问题——其他插件更新时不会再删看板的样式，周期性检查只是多余的保险。现在去掉这个常驻的后台定时器，页面少一份轮询；防掉样式的效果不变（归属标记仍在，本插件自己热更新后也会重新挂回样式）
- 对使用者无任何可见变化，纯粹是内部做减法

**English:**


- **Removed the "style check every 2 seconds" mechanism introduced in 0.4.4**: the style ownership marker from the previous release fixed the accidental-deletion problem at its root — other plugins updating no longer remove board styles, making the periodic watchdog redundant insurance. The resident background timer is gone (one less poller on the page); anti-style-loss behavior unchanged (ownership marker remains, and the plugin re-attaches styles after its own hot reload)
- No visible change for users — pure internal subtraction

### 0.4.4

- **修复看板偶尔突然掉样式的问题（[ #3](https://github.com/cloader/dsh-taskboard/issues/3)）**。排查结论：浏览器里其他插件在后台热更新时，会按"样式归属"做清理，而看板自己的样式表没有归属标记，被误当成别的插件的样式连带删掉了。本次修复后：
  - 看板的样式表明确打上了自己的归属标记，其他插件更新时不会再误删它
  - 看板每 2 秒自动检查一次样式是否完好，即便被误删也会立刻自动恢复——以后遇到掉样式，最多闪一下就自动修好，不用再刷新页面
- 新增回归测试：样式归属标记生效、误删后 2 秒内自动恢复、样式不会重复注入

**English:**


- **Fixed styles occasionally vanishing from the board ([#3](https://github.com/cloader/dsh-taskboard/issues/3))**. Root cause: other plugins hot-reloading in the background perform cleanup by "style ownership," and the board's stylesheet carried no ownership marker, so it was mistaken for someone else's and removed. After this fix:
  - The board stylesheet carries an explicit ownership marker and survives other plugins' updates
  - The board checked its stylesheet every 2 seconds and self-healed instantly even if removed — at worst a flicker, no page refresh needed
- Added regression tests: ownership marker present, auto-recovery within 2s after deletion, no duplicate injection

### 0.4.3

- **修复折叠侧边栏时入口不收成纯图标（用户反馈）**：收起侧边栏后，shell 把侧栏收成 36×36 图标轨道（layout frame 出现 `data-sidebar-collapsed` 属性、侧栏根节点切换 CSS-Module `*_collapsed` 哈希类），而看板入口仍保持全宽——图标、「任务看板」文字、右侧计数角标挤在窄轨里。修复：折叠信号下入口镜像原生轨道几何（36×36、居中、与原生 newSession 折叠态同款间距），隐藏文字与角标，图标 14→16px 保证可读；双信号选择器（`[data-sidebar-collapsed]` 与 `[class*="_collapsed"]`）沿用 0.4.2 双选择器原则，新旧 shell 通吃；展开态完全不受影响，`aria-label` 保留无障碍提示
- 回归测试：断言两组折叠选择器与 36px 轨道几何都注入样式表、shell 真实产生的 `hHd-Xa_collapsed` 类名命中选择器模式（150 项）
- README 按 dsh.market 五维评分体系重构：新增目录 / 环境要求 / 快速开始（含完整 agent 工作流示例）/ Agent 工具参考表 / 安全 / 配置与数据 / 常见问题；仓库元数据补 homepage 与 topics

**English:**


- **Fixed the sidebar entry not collapsing to a bare icon when the sidebar collapses (user report)**: collapsed shells reduce the sidebar to a 36×36 icon rail (`data-sidebar-collapsed` on the layout frame, root node switching to CSS-module `*_collapsed` hashed classes) while the board entry stayed full width — icon, label, and counter crammed into the narrow rail. Fix: under collapse signals the entry mirrors native rail geometry (36×36, centered, same spacing as the native collapsed newSession tile), hiding text and badge and bumping the icon 14→16px for legibility; dual-signal selectors (`[data-sidebar-collapsed]` and `[class*="_collapsed"]`) continue the 0.4.2 dual-selector principle, covering old and new shells; expanded state untouched; `aria-label` retained for accessibility
- Regression tests: both collapse selector groups and the 36px rail geometry verified injected; the shell's actual `hHd-Xa_collapsed` class name matches the selectors (150 cases)
- README restructured around the dsh.market five-dimension rubric: added table of contents / prerequisites / quick start (with a full agent workflow example) / agent tool reference table / safety / configuration & data / FAQ; repository metadata gained homepage and topics

### 0.4.2

- **修复 DSH Desktop 上看板不出现（用户反馈：入口能点、后端正常，但中间看板无变化）**：当前 DSH Desktop 的 Web shell（`dsh-client-ui-layout`）已完全移除 `data-pane` 属性，中间列改用 CSS Module 哈希类名（`pI_x6G_centerCol`）——而看板挂载选择器写死 `[data-pane="conversation"]`，`querySelector` 永远落空，看板容器从未创建（侧栏入口正常，是因为它一直有 `[class*="sidebarCol"]` 兜底）。修复：挂载选择器与隐藏规则双兼容 `'[data-pane="conversation"], [class*="centerCol"]'`（新旧 shell 通吃，与侧栏入口同款兜底策略）；`.dsh-atb-view` 以 `height:100%` 撑满列容器，不依赖列内部结构
- 回归测试：构造无 `data-pane`、哈希类名 `centerCol` 的 Desktop shell DOM——看板容器正确创建于列内、隐藏规则双选择器齐备

**English:**


- **Fixed the board never appearing on DSH Desktop (user report: entry clickable, backend healthy, center column unchanged)**: the current DSH Desktop web shell (`dsh-client-ui-layout`) dropped `data-pane` attributes entirely, using CSS-module hashed classes instead (`pI_x6G_centerCol`) — while the board's mount selector hardcoded `[data-pane="conversation"]`, so `querySelector` always missed and the container was never created (the sidebar entry worked because it always had a `[class*="sidebarCol"]` fallback). Fix: mount selector and hide rule now accept both `'[data-pane="conversation"], [class*="centerCol"]'` (old and new shells, same fallback strategy as the sidebar entry); `.dsh-atb-view` fills the column with `height:100%`, independent of inner structure
- Regression tests: a Desktop-shell DOM without `data-pane` but with the hashed `centerCol` class — container created inside the column, both hide-rule selectors present

### 0.4.1

- **修复侧栏入口点击竞态（用户反馈）**：部分 shell 的 DOM 里，任务看板侧栏入口被插在 class 含 `newSession` 的容器内部——点击入口时，看板的全局捕获监听器（「点侧栏会话/新会话让位」语义）先 `closeBoard`，入口自身的 `toggleBoard` 再翻回来，表现为**看板一开就闪关、或入口按钮关不掉**。修复：捕获监听器先按 `closest('[data-dsh-atb-entry]')` 整体豁免入口子树（比给选择器加 `:not()` 更稳——`:not()` 只排除元素自身匹配，挡不住入口嵌在带类祖先容器内的形态）；真会话行/新会话按钮的让位语义不变。顺带加固 `newSessionButton()` 锚点扫描排除自身入口，杜绝自愈重插时锚点自引用
- 回归测试：构造「入口位于 newSession 容器内」的竞态形态 DOM——点击入口开/关 toggle 正常；点真新会话按钮仍让位

**English:**


- **Fixed a click race on the sidebar entry (user report)**: in some shells the board entry ends up nested inside the container whose class contains `newSession` — clicking it, the board's global capture listener ("yield the view when a session/new-session is clicked") ran `closeBoard` first, then the entry's own `toggleBoard` flipped it back, manifesting as **the board flashing shut on open, or the entry refusing to close it**. Fix: the capture listener exempts the entry subtree wholesale via `closest('[data-dsh-atb-entry]')` (steadier than a `:not()` clause, which only excludes self-matches and can't guard against ancestor nesting); genuine session rows and the new-session button keep their yield semantics. Also hardened `newSessionButton()` anchor scanning to exclude the entry itself, eliminating self-referencing anchors during self-heal re-insertion
- Regression tests: DOM reproducing the "entry nested in a newSession container" shape — open/close toggling normal; genuine new-session clicks still yield

### 0.4.0

**验收效率包——把「人验收」环节在看板内闭环：**

- **验收清单 DoD**：任务模型新增 `checklist`（≤30 项 × 200 字，勾选人/时间/证据 note 全程留痕）。建卡表单整组编辑（编辑保留勾选状态与证据）；agent 侧新工具 `taskboard_checklist`（add 增补 / check 勾选附证据 / uncheck 重开，代码闸：勾选永远不等于完成）；执行开场框架行注入清单并下达「完成一项勾一项」纪律；待验收卡片与详情未完成项红色高亮，「✓ 完成」在有未勾项时二次确认并显示数量
- **结构化执行报告**：执行记录新增 `report { summary, changedFiles, checks, artifacts, risk }`；agent 收尾用新工具 `taskboard_execution_report` 提交——按「调用会话 + 运行中执行」定位挂载（agent 无需知道执行 id，重复提交覆盖）；待验收详情页分栏渲染（摘要 / 改动文件 / 自验 / 产物 / 风险）；开场交接协议更新为「报告 → 评论 → 移待验收」三步
- **JSON 导入**：`validateLedgerImport` 纯函数逐卡校验分类（新增 / 覆盖 / 无效+原因，文件内重复 id 拒绝；schemaVersion 不符明确报错；导入时残留 `running` 执行标记为失败——其结算守望已随源主机消亡）；`POST /import/preview` 干跑 + `POST /import` 提交（merge 按 id upsert；replace 整册替换前自动写 `ledger.backup-<ts>.json`）；GUI「⬆ 导入」弹窗全流程可视化，整册替换双重确认
- **任务模板**：host 侧 `templates.json` side file（首启播种内置 Bug 修复 / 发布检查 / 例行巡检）；「+ 新建任务 ▼」下拉选模板预填全部配置（含清单与 preset）；任务详情「⌗ 存为模板」；管理弹窗改名 / 删除 / 直接使用
- **Diff 查看器**：git face 新增 `showCommit` / `showPathDiff`（fail-soft，128KB / 2000 行封顶标注截断）；详情页隔离块的提交行与未提交修改文件行点击即懒加载展开 diff；worktree 已删时自动回落主仓
- 测试 116 → 145；`taskboard_get` 详情渲染清单与报告标记；复制任务携带清单

**English:**


**The acceptance-efficiency pack — closing the human-acceptance loop inside the board:**

- **DoD acceptance checklists**: the task model gained `checklist` (≤30 items × 200 chars, with checker / time / evidence note recorded throughout). Whole-group editing in the create/edit form (editing preserves tick states and evidence); new agent tool `taskboard_checklist` (add / check with evidence / uncheck — code gate: checking never completes); the opening frame injects the checklist with the "tick each item as you finish it" discipline; unchecked items highlight red on In Review cards and details, and "✓ Done" double-confirms showing the outstanding count
- **Structured execution reports**: executions gained `report { summary, changedFiles, checks, artifacts, risk }`; agents submit via new tool `taskboard_execution_report` — located by calling session + running execution (no execution id needed; resubmission overwrites); side-by-side rendering in the In Review detail panel; the opening hand-off protocol became three steps: report → comment → move to In Review
- **JSON import**: `validateLedgerImport` pure function classifies every card (added / overwritten / invalid + reason, duplicate ids within one file rejected; schemaVersion mismatch errors clearly; residual `running` executions marked failed on import — their settlement watchers died with the previous host); `POST /import/preview` dry-run + `POST /import` commit (merge upserts by id; full replace auto-writes `ledger.backup-<ts>.json` first); GUI "⬆ Import" dialog visualizes the whole flow with double confirmation for full replacement
- **Task templates**: host-side `templates.json` side file (seeded on first start with Bug fix / Release check / Routine inspection); the "+ New Task ▼" dropdown applies a template to pre-fill the entire form (checklist and preset included); "⌗ Save as template" in task detail; rename/delete/use-now in the management dialog
- **Diff viewer**: the git face gained `showCommit` / `showPathDiff` (fail-soft, capped at 128 KB / 2000 lines with truncation noted); clicking commit rows or uncommitted modified-file rows in the isolation block lazily expands diffs in-board; automatic fallback to the main repo once the worktree is gone
- Tests 116 → 145; `taskboard_get` detail renders checklist and report markers; duplicating a task carries the checklist

### 0.3.3

- **修复执行会话拿不到工具（非标准模式）**：0.3.0 起部署引入 preset 体系后，工具不再是全局注册，而是各 preset 组合在会话创建时挂载（GUI 建会话走 apiproxy 的 composeAgent → presets.mount）。我们的执行服务此前直接 agents.create，不挂任何组合 → 会话无工具。现对齐该链路：执行会话按 preset 组合创建，`agentPreset` 记入会话头
- **任务级 preset 字段**：创建任务时可选「执行模式（preset）」，默认预选部署默认 preset（本部署即标准模式）——即按你的决定「默认标准模式」；可切任意 preset（如梁神模式）或选「跟随部署默认」（不落字段，随部署默认变）；编辑随时可改（每轮执行现组合，无锁定）；复制任务携带；`taskboard_create` 增 `presetId` 参数；详情页显示 preset chip
- **坏 preset 防护**：preset 解析失败（不存在/损坏）→ 执行直接失败、原因写入执行记录、任务退回待办——不产出半组合会话（与 apiproxy 回滚语义一致）
- preset 目录用来自 `agentPreset.list` 连接 RPC（无 roster 或离线时下拉隐藏，行为回落到裸组合）；测试 111 → 116 项

**English:**


- **Fixed execution sessions getting no tools (non-standard modes)**: since 0.3.0 deployments gained the preset system, and tools stopped being globally registered — each preset composition mounts tools at session creation (GUI-created sessions go through apiproxy's composeAgent → presets.mount). Our executor called agents.create directly, mounting nothing → tool-less sessions. Now aligned with that path: execution sessions compose from the task's preset, and `agentPreset` is recorded in the session header
- **Per-task preset field**: task creation offers "execution mode (preset)", defaulting to the deployment default preset (standard mode on this deployment); switch to any preset or "follow deployment default" (field omitted, tracks deployment default); editable anytime (each round recomposes, no lock-in); duplicated tasks carry it; `taskboard_create` gains `presetId`; detail panel shows a preset chip
- **Broken-preset guard**: preset resolution failure (missing/corrupt) fails the execution outright, writes the reason to the execution history, and returns the task to Todo — no half-composed sessions (matching apiproxy rollback semantics)
- Preset options come from the `agentPreset.list` connection RPC (dropdown hidden when no roster or offline, falling back to bare composition); tests 111 → 116

### 0.3.2

- **修复 worktree 执行会话脱离项目组、工具不可用**：0.3.0–0.3.1 把执行会话 cwd 指向 worktree 子目录，而 DSH 的会话模型要求 cwd === 工作区根目录（全等）——子目录导致会话无法挂入项目组（显示「未分组」），且文件沙箱边界与相对路径解析全部失效（agent 无法创建文件）。现改回：会话 cwd = 项目根（分组、工具、沙箱完整可用），worktree 绝对路径与边界纪律（命令 workdir 指向 worktree、文件读写用绝对路径、禁改主工作区其它文件、提交到任务分支）在开场框架行中明确下达。git 隔离与证据采集不受影响

**English:**


- **Fixed worktree execution sessions leaving the project group with no tools**: 0.3.0–0.3.1 pointed the executing session's cwd at the worktree subdirectory, but DSH's session model requires cwd === workspace root (strict equality) — subdirectories left the session ungrouped with the file sandbox boundary and relative-path resolution broken (agents couldn't create files). Reverted: session cwd = project root (grouping, tools, sandbox fully functional), while the worktree absolute path and boundary discipline (commands use the worktree as workdir, file I/O via absolute paths, don't touch other files in the main working tree, commit to the task branch) are stated explicitly in the opening frame. Git isolation and evidence collection unaffected

### 0.3.1

- **↻ 续跑**：详情页新增「续跑」——保留现有 worktree 与分支原状（上次的提交和未提交修改都在），在其上继续执行；基线取 worktree 当前 HEAD，证据只统计本轮新增提交。默认「立即执行」仍为全新基线（重置分支到主区 HEAD）
- **同仓库 git 操作互斥**：同一仓库的建/删 worktree、合并、删分支在进程内串行执行，消除并发隔离执行之间的 index.lock 竞争
- **失败/取消也留证据**：turn 出错或用户停止时，已产生的提交与未提交修改照样采集进执行记录（原先只在成功结算时采集）——中断的半成品可凭记录判断是否续跑
- **执行记录证据封顶**：提交最多保留 50 条、未提交修改最多 100 行（均记录总数），超大改动不再撑爆每次全量重写的台账
- **合并空跑检测**：分支没有领先主工作区的新提交时直接提示「无需合并」，不再产生假的「已合并」系统评论
- **物理清除连带清理**：purge 任务前先检查 worktree——有未提交修改拒绝并列出文件；通过后连带删除 worktree 与任务分支
- **降级语义细化**：降级原因区分「git 不可用（未安装/不在 PATH）」与「当前项目不是 git 仓库」；降级运行的开场提示明确警告会话正在主项目目录工作（先 git status、改动集中、结束说明改动文件）
- **全新检出提示**：全新 worktree 的开场提示告知不含 node_modules/构建产物，构建测试前可能需重装依赖
- **诊断面板增强**：新增 gitignore 建议列表（git 项目未忽略 `.dsh-worktrees/` 一目了然，仍不自动修改）；「悬挂执行中」更名为「执行中」
- README 注明 Worktree 隔离是协作约定而非沙箱；测试 97 → 111 项

**English:**


- **↻ Resume**: "Resume" in the detail panel keeps the existing worktree and branch intact (last round's commits and uncommitted edits remain) and executes on top of them; the baseline becomes the worktree's current HEAD, and evidence counts only this round's new commits. Plain "Run now" still uses a fresh baseline (branch reset to the main tree's HEAD)
- **Same-repo git mutual exclusion**: worktree creation/removal, merges, and branch deletion on one repository serialize in-process, eliminating index.lock races between concurrent isolated executions
- **Evidence survives failure/cancellation**: on turn errors or user stops, commits already made and uncommitted edits are still collected into the execution history (previously collected only on successful settlement) — interrupted half-done work can be judged from the record for a possible resume
- **Evidence caps in execution history**: at most 50 commits and 100 lines of uncommitted changes per execution (totals recorded), so huge diffs no longer bloat the fully-rewritten-on-every-write ledger
- **Empty-merge detection**: merging a branch with no new commits ahead of the main working tree now says "nothing to merge" instead of producing a fake "merged" system comment
- **Physical purge cascades**: purging a task checks the worktree first — refuses with uncommitted changes and lists the files; on pass, deletes the worktree and task branch too
- **Finer degradation semantics**: reasons distinguish "git unavailable (not installed / not on PATH)" from "current project is not a git repository"; degraded runs warn in the opening prompt that the session works in the main project directory (run git status first, keep changes focused, list changed files when done)
- **Fresh-checkout hint**: openings on a brand-new worktree mention node_modules/build artifacts aren't there and dependencies may need reinstalling before building/testing
- **Diagnostics panel enhanced**: gitignore suggestions list (projects that haven't ignored `.dsh-worktrees/` at a glance; never auto-edited); "dangling in progress" renamed to "executing"
- README notes worktree isolation is a collaboration convention, not a sandbox; tests 97 → 111

### 0.3.0

- **Git Worktree 隔离执行（旗舰）**：并发执行互不污染代码，验收即审分支
  - 任务级隔离开关：新建表单「执行隔离」（默认 Worktree、记住上次选择；非 git 项目自动禁用并提示）；`taskboard_create` 增 `isolation` 参数；复制任务携带；首次执行前可改、开始后锁定
  - 执行链路：每次全新 worktree（`git worktree add --force` 到固定路径 `.dsh-worktrees/<任务ID>`，固定分支 `task/<标题>+<任务ID>`，标题清洗+截断、空标题回退纯 ID、改名不改分支）；执行会话 cwd 指向 worktree；开场框架行引导 agent 把改动提交到该分支
  - 结算采集：提交列表（hash+主题）、未提交修改警告、改动统计与文件数——「执行记录 ↔ commits 关联」并入本轮
  - 验收操作（详情页）：⇥ 合并（`--no-ff`，主区脏/冲突原样报告且自动 `merge --abort` 复原）、🗑 删除 worktree（有未提交修改拒绝，可选连分支删除）、保留分支退回继续修改
  - 安全规则：显式关闭 = 全程零 git 调用；非 git 项目 / git 不可用 / 超时全部自动降级原目录（isolationNote 注明原因，fail-soft：台账与执行永不因 git 失败而失败）；合并的干净检查豁免插件自有的 `.dsh-worktrees/` 目录；所有 git 操作带超时（查询 2s / 结构操作 15s）
  - host 新模块 `src/host/git.ts`：窄接口 GitFace（detect/prepare/collect/merge/remove/deleteBranch），exec 层可注入（测试零真 git）；workspaces 路由下发 git 检测结果（60s 缓存）；启动时对未忽略 `.dsh-worktrees/` 的项目提示 gitignore 建议（不自动改）
- **⚙ 健康诊断**：台账基本项（修订号/任务数/悬挂执行中）+ 遗留 worktree 列表（台账无主但目录存在）一键清理（未注册目录 fs 兜底，有未提交修改仍拒绝）
- `taskboard_get` 详情输出隔离与分支信息；测试 67 → 97 项

**English:**


- **Git worktree isolated execution (flagship)**: concurrent executions never pollute each other's code; acceptance reviews the branch
  - Per-task isolation toggle: "execution isolation" in the create form (default Worktree, remembers last choice; auto-disabled with a notice on non-git projects); `taskboard_create` gains `isolation`; duplicated tasks carry it; changeable until first execution, locked thereafter
  - Execution chain: every run gets a fresh worktree (`git worktree add --force` at the fixed path `.dsh-worktrees/<taskId>`, fixed branch `task/<title>+<taskId>` — sanitized/truncated titles, pure-ID fallback, renames never rename branches); the executing session's cwd pointed at the worktree; the opening frame steers the agent to commit onto that branch
  - Settlement collection: commit list (hash + subject), uncommitted-changes warning, change stats and file counts — "execution ↔ commits association" shipped in this round
  - Acceptance actions (detail panel): ⇥ Merge (`--no-ff`; dirty/conflicted main tree reported verbatim with automatic `merge --abort` restoration), 🗑 Delete worktree (refused with uncommitted changes, optional branch deletion), or keep the branch and send back for more edits
  - Safety rules: explicitly disabled = zero git calls throughout; non-git project / unavailable git / timeouts all degrade to in-place execution (reason in isolationNote, fail-soft: ledger and execution never fail because of git); clean-check exemption for the plugin's own `.dsh-worktrees/`; all git ops carry timeouts (queries 2s / structural ops 15s)
  - New host module `src/host/git.ts`: narrow GitFace interface (detect/prepare/collect/merge/remove/deleteBranch), injectable exec layer (tests use zero real git); workspace routes deliver git detection results (60s cache); startup hints suggest gitignore entries for projects not ignoring `.dsh-worktrees/` (never auto-applied)
- **⚙ Health diagnostics**: ledger basics (revision / task count / dangling executions) + orphaned-worktree list (on disk, unowned in the ledger) with one-click cleanup (unregistered directories cleaned via fs fallback; still refused with uncommitted changes)
- `taskboard_get` detail output includes isolation and branch info; tests 67 → 97

### 0.2.2

- **待验收快捷操作**：待验收列卡片上直接「✓ 完成 / ✗ 退回」，退回可附原因（可留空），退回与评语一次原子提交（移卡失败不会产生孤儿评论）
- 非法状态流转的 HTTP 状态码由 500 修正为 400

**English:**


- **In Review quick actions**: "✓ Done / ✗ Send back" directly on In Review cards; sending back may attach a reason (optional); return + comment commit atomically (no orphaned comments when the move fails)
- Invalid state transitions now return HTTP 400 instead of 500

### 0.2.1

- 调整任务发起时的提示词

**English:**


- Tuned the task-kickoff prompt

### 0.2.0

- **看板效率**：顶栏新增搜索（标题/ID，大小写不敏感）、列内排序（默认/最近更新/紧急度/创建时间）；筛选与排序按 localStorage 持久化（搜索不持久）
- **侧边栏状态条**：「任务看板」入口同行右侧显示 `待办|进行中|待验收` 计数（如 `0|1|2`），三个数字分别着蓝/橙/紫状态色，悬停提示含义与实时数字，数字变化时上下滚动动画（增长上滚、减少下滚，尊重 prefers-reduced-motion）
- **执行结算闭环**：执行会话结束但未按协议交接（没评论/没移待验收）时，系统自动补评论并移入待验收——任务不再静默挂在进行中；执行失败也留系统评论
- **认领租约**：认领超 30 分钟未动的任务，卡片与详情显示「⏱ 认领超时」；详情页新增「🔓 释放认领」一键退回待办
- **执行记录保留上限**：每任务保留最近 20 条执行记录（详情页显示「+N 已清理」），定时任务的台账不再无限膨胀
- **全局并发上限**：同时执行的会话数默认上限 3（`DSH_TASKBOARD_MAX_CONCURRENT` 可调）；调度器满载时保留到期窗口不烧掉，下个 tick 重试
- **执行 Prompt 模板变量**：`{{lastExecution}}`（上次执行结果）、`{{lastComments}}`（最近 3 条评论）——巡检类定时任务能看到上次跑出了什么
- **复制任务**：详情页「⧉ 复制」一键克隆全部配置为新卡
- **导出**：顶栏「⬇ JSON」全量台账备份、「⬇ CSV」任务清单（带 BOM，Excel 直接打开）
- **状态色点**：五列列头与「其它任务」三列的分类文字前显示状态色圆点（待规划灰/待办蓝/进行中橙/待验收紫/已完成绿/已删除红），与详情页状态 pill 同色系
- **执行会话跳转**：详情页执行记录（倒序，最新在最上）点击会话短 ID 直接打开该执行会话，看板自动收起；已删除与已归档分开提示并带短 ID；运行时服务惰性解析、会话列表镜像滞后时自动刷新重查一次；短 ID 剥离 `taskboard-` 中缀，各记录可区分

**English:**


- **Board efficiency**: toolbar search (title / ID, case-insensitive) and in-column sorting (default / recently updated / urgency / created time); filters and sorting persist via localStorage (search doesn't)
- **Sidebar status strip**: the "Task Board" entry shows `todo|in_progress|in_review` counts on the right (e.g. `0|1|2`), colored blue/orange/purple, with hover tooltips explaining meaning and live values; numbers roll vertically on change (up on increase, down on decrease, respecting prefers-reduced-motion)
- **Settlement closure**: when an execution session ends without protocol hand-off (no comment / not moved to In Review), the system auto-comments and moves it to In Review — tasks no longer hang silently In Progress; failed executions also leave a system comment
- **Claim lease**: tasks claimed over 30 minutes ago show "⏱ Claim timed out" on card and detail; the detail panel adds "🔓 Release claim" returning it to Todo
- **Execution history cap**: the 20 most recent executions per task are kept (detail shows "+N cleared"), so scheduled tasks no longer bloat the ledger forever
- **Global concurrency cap**: 3 concurrent execution sessions by default (`DSH_TASKBOARD_MAX_CONCURRENT` adjustable); a loaded scheduler preserves due windows instead of burning them, retrying next tick
- **Execution prompt template variables**: `{{lastExecution}}` (previous execution result), `{{lastComments}}` (three most recent comments) — inspection-type scheduled tasks can see what last round found
- **Duplicate task**: "⧉ Duplicate" in the detail panel clones the full configuration into a new card
- **Export**: "⬇ JSON" full-ledger backup and "⬇ CSV" task list (BOM included, opens straight in Excel)
- **Status dots**: colored dots before category labels on the five columns and the three "other tasks" columns (backlog gray / todo blue / in-progress orange / in-review purple / done green / deleted red), matching the detail-panel status pill palette
- **Session jump**: clicking a session short-ID in the execution history (newest first) opens that execution session and collapses the board; deleted vs archived targets get distinct notices with short IDs; lazy service resolution with one automatic refresh-and-retry when the session-list mirror lags; short IDs strip the `taskboard-` infix so records stay distinguishable

### 0.1.3

- **执行竞态与持锁修复**：
  - 「立即执行」原子闸：in-progress 检查移入串行写队列，重复点击 / 调度重叠最多开一个执行会话
  - 认领改为显式 `claimedBy/claimedAt` 字段（原先从 updatedBy 推断，用户编辑会误清持锁）；执行期间任务由执行会话持有，其他会话不可移动；旧台账加载时自动迁移
  - 执行失败自动回退 todo（原先永久卡在 in_progress）；host 重启后残留的 running 执行标记为 failed 并归还任务；成功结算后释放持锁
- **执行可取消**：详情页「■ 停止执行」——停止执行会话、执行记录标记 cancelled、任务回到待办
- **模型校验**：建卡/改卡的固定模型做结构校验 + provider 路由存在性校验（host llm 运行时不可达时只做前者）
- **台账安全**：`store.snapshot()/get()` 返回冻结副本，外部修改直接抛错，杜绝绕过版本号的原地改数据
- **调度器**：tick 前先加载台账（修复 host 重启后首个 tick 读到空表导致定时任务不触发）；启动补偿定时器随 dispose 清理
- **其它**：执行记录会话 ID 点击复制；详情页显示持锁会话；删除死代码（`store.flush` / routes `taskPath`）

**English:**


- **Execution race and lock fixes**:
  - "Run now" atomic gate: the in-progress check moved into the serialized write queue — repeated clicks / overlapping schedules open at most one execution session
  - Claims became explicit `claimedBy/claimedAt` fields (previously inferred from updatedBy; user edits accidentally cleared locks); during execution the task is held by the executing session and immovable by others; legacy ledgers migrate automatically on load
  - Failed executions fall back to Todo (previously stuck in in_progress forever); leftover running executions are marked failed and their tasks returned after a host restart; locks release on successful settlement
- **Cancellable executions**: "■ Stop" in the detail panel — stops the execution session, marks the execution cancelled, returns the task to Todo
- **Model validation**: fixed models on create/edit get structural validation + provider-route existence validation (structural only when the host LLM runtime is unreachable)
- **Ledger safety**: `store.snapshot()/get()` return frozen copies; in-place mutation throws, killing version-bypassing data edits
- **Scheduler**: the ledger loads before each tick (fixing post-restart first ticks reading an empty ledger and skipping scheduled tasks); startup compensation timers clean up on dispose
- **Other**: execution-history session IDs copy on click; the detail panel shows the holding session; dead code removed (`store.flush`, routes `taskPath`)

### 0.1.2

- **看板拖拽**：所有列的卡片可互相拖动（按状态机校验合法流转，非法拖放弹窗提示）；正在执行的任务拖动会被拦截，提示「该任务正在由【任务名】会话执行，不能拖动」
- **执行会话体验**：执行会话标题固定为任务名（经 `sessionTitle.rename` 写入，不会被自动重命名覆盖）；首条消息以正常用户消息呈现（不再是插件上下文行）
- **交互优化**：
  - 新建/编辑弹框新增「⚡ 立即执行」按钮（保存后直接发起执行）
  - 详情页「立即执行」移至「编辑」按钮旁
  - 「+ 新建任务」移至看板标题统计旁
  - 状态流转按钮文案统一为「移至→{状态}」
- **弹窗**：原生 `alert()` 全部替换为主题化模态弹窗（Esc/遮罩可关）

**English:**


- **Board drag & drop**: cards drag between all columns (legal transitions validated by the state machine; illegal drops explain themselves in a dialog); dragging an executing task is intercepted with "this task is being executed by the 【task】 session"
- **Execution session polish**: execution sessions take the task's title (written via `sessionTitle.rename`, immune to auto-renaming); the first message renders as a normal user message (no longer a plugin context line)
- **UX improvements**:
  - Create/edit modal gained a "⚡ Run now" button (executes right after saving)
  - Detail-panel "Run now" moved beside "Edit"
  - "+ New Task" moved next to the board-title stats
  - Transition buttons unified to "Move → {status}"
- **Dialogs**: native `alert()` fully replaced by themed modals (Esc/backdrop closable)

### 0.1.1

- 初始 npm 发布：看板协作、8 个 agent 工具、手动/cron 执行、SSE 实时视图

**English:**


- Initial npm release: board collaboration, 8 agent tools, manual/cron execution, SSE live view
