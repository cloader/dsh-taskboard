[![npm version](https://img.shields.io/npm/v/dsh-taskboard.svg)](https://www.npmjs.com/package/dsh-taskboard)
[![License](https://img.shields.io/npm/l/dsh-taskboard.svg)](https://github.com/cloader/dsh-taskboard/blob/main/LICENSE)

[English](./README_en.md) | 简体中文

# dsh-taskboard

DeepSeek Harness 的**任务看板插件**：人建卡、agent 认领执行、人验收。任务挂项目（workspace）、可指定模型与 preset、支持手动与定时执行，全流程双向协作。

- **闭环协作**：人建卡 → agent 认领执行 → 结构化报告 → 人验收（✓ 完成 / ✗ 退回附原因）
- **10 个 `taskboard_*` agent 工具** + 代码级协议闸：agent 永远移不到 done、任务被持有时不可抢、跨项目不可认领
- **执行**：手动或 cron 定时（host 侧调度，浏览器关了照跑）；手动执行新建会话，定时执行复用同一任务的会话，可指定模型与 preset
- **Git Worktree 隔离**：每次执行独立 worktree + 任务分支，验收时一键合并；并列多仓库工作区整区镜像隔离（0.6.3）；非 git 项目自动降级
- **验收效率**：DoD 验收清单（agent 勾选附证据）、结构化执行报告（摘要/改动文件/自验/产物/风险）、看板内 diff 查看器
- **实时看板**：SSE 实时刷新、五列流转、筛选排序持久化、JSON 导入导出、任务模板

**零配置**：安装即用——无需 Token、无需 API Key、无需额外服务或数据库。

## 界面

<p align="center"><img src="https://raw.githubusercontent.com/cloader/dsh-taskboard/main/img/board.png" alt="任务看板" width="880"></p>

<p align="center"><img src="https://raw.githubusercontent.com/cloader/dsh-taskboard/main/img/modal.png" alt="新建任务" width="440"></p>

## 目录

- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [Agent 工具参考](#agent-工具参考)
- [功能特性](#功能特性)
- [安全](#安全)
- [配置与数据](#配置与数据)
- [常见问题](#常见问题)
- [开发](#开发)
- [升级日志](#升级日志)

## 环境要求

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| DeepSeek Harness | ≥ 0.1.1 | 需要 `dsh plugin` 子命令与 web profile |
| Node.js | ≥ 20 | 仅 GitHub 源安装构建时需要 |
| git | 可选 | Worktree 隔离需要；缺失时自动降级原目录执行 |

> **双轨挂载（0.8.0）**：dsh ≥ 0.1.7（带官方 slot 系统）时，看板作为**一等侧边栏面板**注册（`sidebar.panellist` + `main`，宿主拥有侧栏行与面板切换，从根本上消除「看板打开后其他面板点不动」这类问题，[#31](https://github.com/cloader/dsh-taskboard/issues/31)）；旧版 shell 自动回落到原有的 DOM 注入方式，行为与 0.7.x 完全一致。两条路径运行时自动互斥选择，无需配置。

## 安装

```bash
# 一键安装（npm，预构建、免构建授权 —— 推荐）
dsh plugin --profile web add dsh-taskboard

# 或从 GitHub 源安装
dsh plugin --profile web add github:cloader/dsh-taskboard
```

安装后**重启 `dsh web` 并刷新页面**：侧边栏出现「任务看板」入口即成功。无需任何后续配置。

<details>
<summary>GitHub 源安装卡在 prepare / allowBuilds？</summary>

git 源插件安装时经 prepare 脚本构建，pnpm 会先阻止——按报错提示把精确 key 加进 profile 目录 `pnpm-workspace.yaml` 的 `allowBuilds` 后重跑即可。npm 源是预构建产物，无此步骤。
</details>

<details>
<summary>开发模式安装（改代码即生效）</summary>

```bash
git clone https://github.com/cloader/dsh-taskboard.git
cd dsh-taskboard
npm install && npm run build
dsh plugin --profile web add "link:/path/to/dsh-taskboard"
```

link 安装后，仓库里 `npm run build` 重建、刷新页面即生效；改完宿主侧代码需重启 `dsh web`。
</details>

卸载：`dsh plugin --profile web remove dsh-taskboard`（台账数据保留在当前数据目录，见[配置与数据](#配置与数据)）。

> 官方 `@deepseek-ai/dsh-*` 包只写进 profile 的 `bundles` 列表，不要 `plugin add` 进 dependencies（避免 SDK 双实例遮蔽）。

## 快速开始

**第 1 步 · 建卡**：看板右上「+ 新建任务」——选项目、紧急度、执行方式（认领/定时+cron）、模型与 preset、Git 隔离开关、验收清单；可勾「⚡ 立即执行」。

**第 2 步 · agent 执行**：三种触发方式任选——

1. GUI「立即执行」/「↻ 续跑」（详情页或表单）
2. cron 定时（host 侧调度，无需开浏览器）
3. 任意会话里让 agent 用 `taskboard_*` 工具认领：`按看板上的任务 t-xxxxx 执行`

**第 3 步 · 人验收**：待验收列「✓ 完成」一键验收；「✗ 退回」退回待办并附原因（agent 下轮开工前会读）。

一次完整的 agent 工作流（协议由插件在执行开场自动下达）：

```text
你：执行看板任务 t-ab12cd
agent：
  taskboard_list                # 查板：项目内 todo 任务
  taskboard_get t-ab12cd        # 读需求、评论、验收清单
  taskboard_move → in_progress  # 认领（代码闸：被持有/跨项目会被拒绝）
  ……编码 / 测试……
  taskboard_checklist check     # 逐项勾验收清单，附证据 note
  taskboard_execution_report    # 结构化报告：摘要/改动文件/自验/产物/风险
  taskboard_comment_add         # 交接说明
  taskboard_move → in_review    # 移待验收
你：看板待验收列 ✓ 完成   # done 永远只属于人——agent 调用会被代码闸拒绝
```

## Agent 工具参考

任何会话可用；项目边界：只有属于任务所在项目的会话才能认领或执行。

| 工具 | 作用 |
| --- | --- |
| `taskboard_list` | 查板（按项目/状态/紧急度过滤，紧凑摘要） |
| `taskboard_get` | 读单卡全文：描述、prompt、评论流、清单、执行记录 |
| `taskboard_comments` | 列出任务评论（视为最新需求，先读后动） |
| `taskboard_create` | 建卡（workspaceId、紧急度、清单、preset、隔离、定时） |
| `taskboard_update` | 改标题/描述/prompt/紧急度/清单（model/execution 只读） |
| `taskboard_move` | 移卡：todo→in_progress→in_review（**到不了 done**） |
| `taskboard_comment_add` | 追加评论（交接、风险、进展） |
| `taskboard_delete` | 软删除（可 purge；执行中不可删） |
| `taskboard_checklist` | 验收清单 add / check（附证据）/ uncheck |
| `taskboard_execution_report` | 提交结构化执行报告，自动挂到当前执行 |

## 功能特性

**看板协作**
- 五列看板（待规划 / 待办 / 进行中 / 待验收 / 已完成）+ 受阻标记，SSE 实时刷新
- 任务挂项目：认领校验会话归属，跨项目不可抢
- 紧急度三色（紧急/一般/不急）筛选与色条；搜索（标题/ID）与列内排序，筛选排序持久化
- 列头状态色圆点：待规划灰 / 待办蓝 / 进行中橙 / 待验收紫 / 已完成绿 / 已删除红
- 新建/编辑弹窗：项目、模型（含思考强度）、紧急度、执行方式、cron 实时校验与下次运行预览、执行隔离开关、验收清单编辑
- 详情面板：状态流转（done 仅限人工；清单未全勾时完成需二次确认并显示未勾数）、agent/用户评论流、执行记录（倒序，最新在最上；会话 ID 点击跳转打开该执行会话；已删除/已归档分开提示）、停止执行、Worktree 隔离块（分支 / 提交 / 改动统计 / 合并与清理）、执行报告块、验收清单块
- 待验收列卡片快捷操作：「✓ 完成」一键验收、「✗ 退回」退回待办并可附退回原因（agent 开工前会读）
- **图片附件（0.7.0）**：任务描述与评论可选择、粘贴或拖放 PNG/JPEG/GIF/WebP，自动插入 Markdown；详情中显示缩略图，点击灯箱放大。图片保存在本机数据目录，单文件上限 5 MiB
- **双栏宽屏任务弹窗 + Slash 补全（0.6.0）**：新建/编辑弹窗左右双栏（左栏核心字段与执行配置，右栏描述与 Prompt）；描述/Prompt 输入 `/` 即弹出命令与技能补全（↑↓/Enter/Tab/Esc 键盘导航，宿主动态发现与内置清单合并）；描述与 Prompt 中的 Markdown 图片渲染为缩略图，点击灯箱放大
- **执行权限（0.6.0）**：任务级三档执行权限（📁 可写入工作区 / 🔒 仅可查看 / ⚡ 完全权限），表单选择 + 看板设置默认执行权限；卡片、详情、模板列表显示权限徽章
- **界面中英双语（0.6.0）**：看板全部界面文案跟随 DSH「设置 → 通用设置 → 语言」（zh/en）实时切换，无需刷新；语言偏好由 DSH 统一存储（settings.yaml 的 locale.preference），插件自身不新增任何配置；无 locale 服务的环境自动按浏览器语言降级
- **外部会话自动同步（0.5.5）**：看板设置开启「🔄 自动纳入会话」后，工作区直接新建的会话自动在看板生成任务卡片（按会话工作目录映射项目，取首条消息作标题/描述）——运行中进「进行中」并绑定会话（可一键跳转）、成功结算自动流转「待验收」、异常退回「待办」；自动过滤看板内部执行会话（0.6.0 起连同子代理会话一并过滤），多轮续跑延续同一张卡片；出厂默认关闭
- **一键跳转执行会话（0.5.4）**：任务卡片新增「🤖 会话ID ↗」按钮、详情页顶部新增「🤖 跳转会话 ↗」按钮，持有者 Chip 同样可点——进行中优先、其次最近一次执行对应的会话一键直达（看板自动收起）；已归档 / 已删除 / 会话服务不可用分别精准提示
- **记住上次模型（0.5.4）**：新建任务自动带出上次选用的模型与思考强度（模板预填与编辑不受影响）
- **验收清单 DoD（0.4.0）**：建卡时定验收条件（≤30 项）；agent 用 `taskboard_checklist` 增补/勾选（附证据 note）；用户在详情页直接勾选；待验收时未完成项红色高亮 + 卡片「☑ n/m」角标（未全勾显红）；清单编辑在表单中整组管理（勾选状态与证据保留）
- **结构化执行报告（0.4.0）**：agent 收尾用 `taskboard_execution_report` 提交（摘要 / 改动文件 / 自验 / 产物 / 剩余风险），自动挂到当前执行记录；待验收详情页分栏渲染；开场框架行明示提交时序（报告 → 评论 → 移待验收）
- **JSON 导入（0.4.0）**：顶栏「⬆ 导入」选择备份文件 → 干跑预览（新增 / 覆盖 / 无效分类明细）→ 合并（按 id upsert）或整册替换（自动先备份当前台账 + 二次确认）；⬇ JSON 导出的文件即同格式可直接恢复
- **任务模板（0.4.0）**：「+ 新建任务 ▼」下拉（空白 / 内置 新增功能·Bug 修复·发布检查·例行巡检 / 管理模板）一键预填表单（标题/描述/Prompt/紧急度/定时/隔离/preset/清单）；任务详情「⌗ 存为模板」沉淀常用配置；模板随台账保存在当前数据目录，改名/删除在管理弹窗
- **Diff 查看器（0.4.0）**：隔离块提交行、未提交修改文件行点击即在看板内展开 diff（提交 `git show` / 文件 `git diff`，128KB·2000 行封顶标注截断）；worktree 已删时回落主仓（仅限提交与带基线的范围 diff）

**Agent 工具（taskboard_\*）**
- 10 个工具：查板 / 建卡 / 改卡 / 移卡 / 评论 / 软删除 / 验收清单 / 执行报告，任何会话可用
- 代码级协议闸：agent 永远移不到 done（清单全勾也不行）；任务被持有时不可抢占；model/execution 对 agent 只读

**执行**
- 手动执行新建会话；cron 定时首次创建会话，后续触发复用该任务上一次定时执行的会话和上下文，重启 DSH 后从持久化历史恢复。每次仍单独记录执行结果和报告，并发送当前任务内容与交接协议。手动执行不会替换定时会话。会话已删除、已归档，或项目、模型、preset、权限、隔离配置变化时新建会话；旧会话忙碌、锁定或恢复失败时回退新建会话，本次执行照常进行。升级前的执行记录及导入的任务在首次定时执行时新建会话。会话复用不改变 Git worktree 的准备规则，当前目录与工作状态以本次提示为准。
- **任务级 preset（0.3.3）**：新建/编辑表单「执行模式（preset）」下拉——执行会话按该 preset 组合（工具集与人设由此而来，对齐 GUI 新会话的组合方式）；默认预选部署默认 preset，也可选「跟随部署默认」；preset 损坏时执行直接失败并把原因写进执行记录（不产出半组合会话）；随时可改，下轮执行生效
- **Git Worktree 隔离执行（0.3.0）**：任务级开关（0.5.0 起新建任务的默认值由「看板设置」统一决定，出厂默认原目录执行），每次执行在 `<项目>/.dsh-worktrees/<任务ID>` 独立 worktree 上进行，分支 `task/<标题>+<任务ID>`（首次创建后定死，改名不改）；执行会话归属项目根目录（分组、工具与文件沙箱完整可用——DSH 要求会话 cwd 即工作区根，0.3.2 修正），worktree 路径与边界纪律在开场指令中明确下达；结算自动采集提交列表 / 未提交修改警告 / 改动统计；非 git 项目或 git 不可用时自动降级原目录执行（执行记录注明降级原因，台账与执行主流程永不因 git 失败而失败）；验收时详情页一键 `--no-ff` 合并到主工作区（主区脏或冲突原样报告，不自动解决）、删除 worktree（有未提交修改时拒绝）、可选删分支；支持「↻ 续跑」在现有 worktree/分支上继续执行（保留上次改动与提交）
- **多仓库镜像隔离（0.6.3）**：工作区内并列多个 git 仓库时（根仓库 + 嵌套独立仓库），worktree 模式自动升级为「任务镜像」——有界扫描发现全部仓库（深度 ≤3、上限 8 个、60s 缓存；submodule 与 linked worktree 形态跳过），每仓库各自建立同名任务分支的 worktree，按相对路径挂进 `<项目>/.dsh-worktrees/<任务ID>/` 形成结构同构镜像；执行引导逐仓库给出镜像路径与分支并声明边界纪律（未镜像仓库禁改）；提交证据、diff 查看（`?repo=` 按仓库）与合并（逐仓库 `--no-ff`，一仓冲突不阻断他仓，按仓库汇总）均分仓库进行；镜像清理聚合全部仓库的未提交检查后「先子后根」删除；任务与执行记录新增 `branches` / `repos` 附加字段，单仓库行为与旧数据零变化；根仓库以 gitlink（embedded repo）形式跟踪子仓的容器工作区同样完全可用——嵌套子镜像在根镜像 status 中的结构性噪音（未跟踪目录 / gitlink 漂移）已在证据采集、合并检查与镜像清理中自动豁免；新建任务表单在多仓库工作区显示「将镜像 N 个仓库」提示，纯容器工作区（根非仓库、只有并列子仓）同样可选 Worktree 隔离
- **看板设置（0.5.0）**：顶栏「🛠 设置」——选择新建任务默认怎么执行（🌿 Worktree 隔离 / 📁 原目录执行，出厂默认后者）。保存后新建的任务都按它来；之后改设置，已建好的任务不受影响
  > Worktree 隔离是协作约定而非沙箱：执行会话拥有完整工具权限，隔离依赖分支约定，不适用于运行不可信代码的场景。
- host 侧调度：关掉浏览器照常触发；错过窗口跳过不补跑
- 乐观并发（ifVersion）+ 完整归因（谁改的、哪个会话执行的）
- ⚙ 健康诊断：台账基本项 + 遗留 worktree（台账无主但目录存在）一键清理

## 安全

- **验收权只属于人**：agent 把任务移到 done 的调用被代码级协议闸直接拒绝（不是提示词约定）；任务被持有时不可抢占，跨项目不可认领。
- **Worktree 隔离是协作约定而非沙箱**：执行会话拥有完整工具权限，隔离依赖分支约定，不适用于运行不可信代码的场景。
- **数据本地**：台账、模板和图片附件全部存本机，可在看板设置中迁移数据目录；不外发任何数据，无需 Token / API Key。

## 配置与数据 

开箱即用，全部配置项如下（均为可选）：

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `DSH_TASKBOARD_MAX_CONCURRENT` | `3` | 全局同时执行的会话数上限 |
| `DSH_HOME` | `~/.dsh` | DSH 主目录，也是未自定义时的数据目录及位置引导文件所在目录 |
| `ATB_TRACE` | 未设置 | `=1` 时 host 打印工具调用跟踪（调试用） |

数据目录默认是 `DSH_HOME`，可在「🛠 设置 → 数据存储位置」中检查并迁移到其他绝对路径。三个数据项始终一起迁移；卸载插件不删除数据。

| 文件 | 内容 |
| --- | --- |
| `dsh-taskboard.json` | 任务台账（全部任务/执行/评论） |
| `dsh-taskboard-templates.json` | 任务模板 |
| `dsh-taskboard-assets/` | 图片附件（按内容哈希去重） |
| `dsh-taskboard.json.backup-<时间戳>` | 整册导入替换前的自动备份 |
| `DSH_HOME/dsh-taskboard-storage.json` | 自定义数据目录的位置引导文件；固定留在 DSH 主目录 |
| `<项目>/.dsh-worktrees/<任务ID>/` | 任务执行 worktree（多仓库工作区：整区任务镜像，每仓库一个子 worktree） |

随时可顶栏「⬇ JSON」备份台账、「⬇ CSV」导出任务清单（带 BOM，Excel 直接打开）。图片附件不在 JSON 内；完整备份需复制设置页显示的数据目录中的 `dsh-taskboard-assets/` 文件夹。

## 常见问题

**侧边栏没有「任务看板」入口？**
刷新页面；仍没有则确认插件已装进当前 profile 并重启 `dsh web`（宿主半区在进程启动时加载）。三代 shell 均支持：`data-pane`（dev）、哈希类名（官方布局，0.4.2 起）、DSH Desktop 非兼容 extended frame（0.5.2 起）。

**任务数据存在哪？怎么备份？**
见[配置与数据](#配置与数据)。GUI「⬇ JSON」可导出、恢复台账；图片附件还需备份 `dsh-taskboard-assets/` 文件夹。

**浏览器关了，定时任务还跑吗？**
跑。调度在 host 进程侧，与浏览器无关；错过的时间窗口跳过不补跑。

**项目不是 git 仓库，能用吗？**
能。Worktree 隔离自动降级为原目录执行，执行记录注明降级原因；其余功能不受影响。

**多个项目怎么协作？**
任务挂项目（= DSH workspace）。认领校验会话归属：只有任务所在项目内的会话能认领/执行，跨项目不可抢。

**agent 会把任务直接标成「已完成」吗？**
不会。这是代码级协议闸（不是提示词约定）：`taskboard_move` 到 done 的调用被直接拒绝，验收永远由人在看板完成。

**GitHub 源安装报 prepare 被阻止？**
pnpm 的构建授权——按报错把 key 加进 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重跑；或改用 npm 源（预构建，无此步骤）。

**和 dsh-better-sidebar 并存，看板顶栏右侧按钮被遮住？**
0.6.5 起已自动避让：better-sidebar 收起时其右上角常驻按钮簇（展开底部面板 / 展开侧边栏）占据视口右上 10~70px，看板激活时会为工具条右侧预留这块区域（镜像 better-sidebar 对 DSH 原生会话头的避让契约），任何窗口宽度都不再重叠；未安装 better-sidebar 或其侧栏展开时无任何影响（[#19](https://github.com/cloader/dsh-taskboard/issues/19)）。

**Windows 版 DSH Desktop 的窗口按钮与看板顶栏重叠？**
0.6.6 的修复会根据看板距窗口顶部的实际位置，为原生窗口控制按钮预留顶部空间；已有独立标题栏时保持原间距，窗口缩放和布局变化时重新计算。该问题已通过 Windows 实机验收（[#20 评论](https://github.com/cloader/dsh-taskboard/issues/20#issuecomment-5597498727)）。

**编辑任务时 DoD 勾选框占位过多，把文本输入框挤出去？**
0.6.6 已将 checkbox 排除在弹窗的整行输入框样式之外，恢复勾选框的 15px 宽度及文本输入区域（[#20](https://github.com/cloader/dsh-taskboard/issues/20)）。

## 开发

```bash
git clone https://github.com/cloader/dsh-taskboard.git
cd dsh-taskboard
npm install && npm run build    # host ESM + client CJS 双构建
npm test                        # vitest 全量（含真实 git 镜像集成测试）
node tests/manual-git-e2e.mjs   # 真 git 端到端手测（worktree 全链路 + 续跑 + diff 查看器）
node scripts/screenshot.mjs     # 重新生成 img/ 截图（需本机 Edge）
```

## 升级日志

### 0.8.0

**新特性：**

- **官方 Slot API 挂载（双轨兼容）**：dsh ≥ 0.1.7 的 slot 系统 shell 上，看板改由官方 `sidebar.panellist` + `main` 注册为一等侧边栏面板——侧栏行、激活态、面板切换全部由宿主拥有，行右缘保留与旧版入口同款的实时统计（宽侧栏：待办｜进行中｜待验收 三色计数；折叠轨道：待办角标）；旧版 shell 自动回落 0.7.x 的 DOM 注入路径，注册失败亦即时降级，两条路径严格互斥。

**修复：**

- **定时任务并发排队（[#30](https://github.com/cloader/dsh-taskboard/issues/30)）**：到期任务在并发满载时会持久化进入 FIFO 队列，释放槽位后继续执行，不再因排队超过旧 5 分钟阈值而静默丢失；真正离线错过的周期任务会留下系统评论。
- **调度设置**：可在「🛠 设置」配置最大并发执行数（1–100）及「离线错过超时后不补任务」（1–1440 分钟），保存后即时生效，已排队任务不受超时影响。

### 0.7.5

**新特性：**

- 增加已归档和已删除卡片的批量删除或清理功能（[#29](https://github.com/cloader/dsh-taskboard/issues/29)）。

### 0.7.4

**新特性：**

- **执行方式三档**：认领制、定时执行（新增，指定时间只跑一次，触发即消费；错过不补跑）、定期执行（原 cron 定时执行）。
- **定期任务接棒**：每轮执行成功后原卡进入「待验收」供审查，系统自动新建一张 todo 接棒卡承接 cron 继续下一轮周期，验收与周期执行互不阻塞；调度只触发 todo 状态，in_review 卡片不再被定时执行。

### 0.7.3

**修复：**

- **定时任务默认权限与终态调度（[#28](https://github.com/cloader/dsh-taskboard/issues/28)）**：agent 使用 `taskboard_create` 时会物化看板默认权限，并可通过创建/更新工具显式设置权限；`done`、`canceled`、`archived` 不再被 cron 重新拉起，循环任务仍可在 `in_review` 下按计划继续运行；支持用户将误标为 `done` 的任务重开到 `todo`。

### 0.7.2

**新特性：**

- **定时执行会话复用（[#26](https://github.com/cloader/dsh-taskboard/issues/26)）**：cron 定时首次执行才创建会话，后续触发沿用该任务上一次定时执行的会话与上下文，重启 DSH 后从持久化历史恢复，不再每天产生大量新会话；手动执行仍新建会话。项目、模型、preset、权限或隔离配置变化时自动新建兼容会话；旧会话忙碌、锁定、损坏或恢复失败时回退新建会话，本次执行照常进行。每次执行仍独立记录结果与报告。

**修复：**

- **复用会话下的结算与交接修正**：失败结算按执行 ID 精确定位；系统交接评论判定增加时间过滤，历史评论不再被误认为本次交接；取消请求可胜过尚未提交的空闲结算。

### 0.7.1

**修复：**

- **数据目录迁移成功提示**：迁移完成后在看板设置的存储区显示绿色成功提示（含新路径）；旧数据清理失败以警示样式显示在成功提示下方，不再占用全局错误横幅。

### 0.7.0

**新特性：**

- **可设置数据存储路径**：看板设置中可检查并迁移数据目录，`dsh-taskboard.json`、`dsh-taskboard-templates.json` 和 `dsh-taskboard-assets/` 始终一起迁移；先完整复制和校验，再切换位置，失败不覆盖原数据。
- **任务描述与评论支持插入图片（[#25](https://github.com/cloader/dsh-taskboard/issues/25)）**：支持选择、粘贴和拖放 PNG/JPEG/GIF/WebP，自动插入 Markdown，并在详情中显示缩略图与灯箱预览。图片按内容哈希在本地去重保存，台账和 SSE 只记录短链接。
- DSH 开发依赖升级到 0.1.5-rc.2 系列（`@deepseek-ai/cordis` 4.0.2、`@deepseek-ai/schemastery` 3.18.2），实测兼容 DSH 0.1.5-rc.1。

**修复：**

- **模型前缀缓存失效（[#24](https://github.com/cloader/dsh-taskboard/issues/24)）**：协议与 10 个 `taskboard_*` 工具在插件挂载时同步注册并提高缓存命中率，后续工作区/agent 服务就绪或重载不会改变工具定义；依赖尚未就绪时返回 `taskboard_not_ready`。工具执行等待共享的台账首次加载；工具清理与运行服务生命周期分离。


> 📜 更早版本的完整更新历史见 [changelog.md](changelog.md)。
