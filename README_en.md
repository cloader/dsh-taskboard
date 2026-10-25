[![npm version](https://img.shields.io/npm/v/dsh-taskboard.svg)](https://www.npmjs.com/package/dsh-taskboard)
[![License](https://img.shields.io/npm/l/dsh-taskboard.svg)](https://github.com/cloader/dsh-taskboard/blob/main/LICENSE)

English | [简体中文](./README.md)

# dsh-taskboard

> **Contributing and pull requests**: branch from `dev` for features, fixes and documentation, and set your PR base to **`dev`**. `main` is the protected stable release branch; maintainers integrate releases through a `dev → main` PR. CI must pass before merging into `main`.

A **task board plugin for DeepSeek Harness**: humans create cards, agents claim and execute them, humans review and accept. Tasks live on projects (= workspaces), support per-task model & preset selection, and can run manually or on a cron schedule — full two-way collaboration from card to sign-off.

- **Closed loop**: human creates a card → agent claims & executes → structured hand-off report → human accepts (✓ done / ✗ send back with a reason)
- **10 `taskboard_*` agent tools** plus code-level protocol gates: agents can never move a task to *done*, held tasks cannot be snatched away, cross-project claims are rejected
- **Execution**: manual, one-shot scheduled, or host-side periodic cron runs (keep running when the browser closes); scheduled tasks can reuse an existing session in the selected project; periodic tasks can return to todo each round or keep a review record while creating the next todo card
- **Git worktree isolation**: each run works on its own worktree + dedicated task branch, one-click merge at acceptance; parallel multi-repo workspaces are mirrored whole (0.6.3); non-git projects fall back automatically
- **Efficient acceptance**: DoD acceptance checklists (agent checks items off with evidence), structured execution reports (summary / changed files / checks / artifacts / risks), in-board diff viewer
- **Live board**: SSE real-time refresh, five-column flow, persisted filters & sorting, JSON import/export, task templates
- **External task sync**: ZenTao project/execution Bugs, Stories and Tasks, plus TAPD Bugs/Stories/Tasks, with assignee filtering, polling, project mapping and conflict protection. See External task sync below.

**Zero configuration**: install and it works — no tokens, no API keys, no extra services or databases.

## Screenshots

<p align="center"><img src="https://raw.githubusercontent.com/cloader/dsh-taskboard/main/img/board.png" alt="Task board" width="880"></p>

<p align="center"><img src="https://raw.githubusercontent.com/cloader/dsh-taskboard/main/img/modal.png" alt="New task dialog" width="440"></p>

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Agent Tool Reference](#agent-tool-reference)
- [Features](#features)
- [Safety](#safety)
- [Configuration & Data](#configuration--data)
- [FAQ](#faq)
- [Development](#development)
- [Changelog](#changelog)

## Prerequisites

| Dependency | Requirement | Notes |
| --- | --- | --- |
| DeepSeek Harness | ≥ 0.1.1 | Requires the `dsh plugin` subcommand and the web profile |
| Node.js | ≥ 20 | Only needed when installing/building from the GitHub source |
| git | optional | Required for worktree isolation; falls back to running in place when missing |

## Installation

```bash
# One-command install from npm (prebuilt, no build approval — recommended)
dsh plugin --profile web add dsh-taskboard

# Or install from the GitHub source
dsh plugin --profile web add github:cloader/dsh-taskboard
```

After installing, **restart `dsh web` and refresh the page**: you should see a "Task Board" entry in the sidebar. No further configuration needed.

<details>
<summary>GitHub-source install stuck on prepare / allowBuilds?</summary>

Plugins installed from a git source go through a prepare script, and pnpm blocks it first — follow the error message and add the exact key to `allowBuilds` in your profile's `pnpm-workspace.yaml`, then retry. The npm package ships prebuilt artifacts and never hits this step.
</details>

<details>
<summary>Developer-mode install (edit code and see changes immediately)</summary>

```bash
git clone https://github.com/cloader/dsh-taskboard.git
cd dsh-taskboard
npm install && npm run build
dsh plugin --profile web add "link:/path/to/dsh-taskboard"
```

With a link install, rebuild via `npm run build` in the repo and refresh the page; host-side changes additionally require restarting `dsh web`.
</details>

Uninstall: `dsh plugin --profile web remove dsh-taskboard` (ledger data stays in the active data directory — see [Configuration & Data](#configuration--data)).

> Official `@deepseek-ai/dsh-*` packages belong in the profile's `bundles` list only — do not `plugin add` them into dependencies (avoids shadowed dual SDK instances).

## Quick Start

**Step 1 · Create a card**: click "+ New Task" in the board toolbar — pick a project, urgency, execution mode (claim / one-shot / periodic cron), model and preset, Git isolation toggle, and an acceptance checklist. A one-shot task can start a new session or use an existing project session. A periodic task independently chooses a new session every run, create-first-then-reuse, or an existing project session, as well as whether completion returns to todo or creates a successor card; tick "⚡ Run now" to execute immediately.

**Step 2 · An agent executes it**, triggered any of three ways:

1. GUI "Run now" / "↻ Resume" buttons (detail panel or form)
2. Cron schedule (host-side — no browser required)
3. Ask any agent in any session to claim it with the `taskboard_*` tools: `pick up task t-xxxxx from the board and execute it`

**Step 3 · Human acceptance**: in the *In Review* column, "✓ Done" accepts in one click; "✗ Send back" returns it to *Todo* with an optional reason (agents read it before their next round).

A complete agent workflow (the protocol below is injected automatically by the plugin at execution start):

```text
You: execute board task t-ab12cd
agent:
  taskboard_list                # read the board: todo tasks in this project
  taskboard_get t-ab12cd        # requirements, comments, acceptance checklist
  taskboard_move → in_progress  # claim (code gate: rejects held / cross-project tasks)
  ……code & test……
  taskboard_checklist check     # tick checklist items one by one, with evidence notes
  taskboard_execution_report    # structured report: summary/files/checks/artifacts/risks
  taskboard_comment_add         # hand-off notes
  taskboard_move → in_review    # move to In Review
You: click ✓ Done in the In Review column   # done belongs to humans only — agent calls are rejected by the code gate
```

## Agent Tool Reference

Available in any session. Project boundary: only sessions belonging to the task's project can claim or execute it.

| Tool | Purpose |
| --- | --- |
| `taskboard_list` | Read the board (filter by project / status / urgency; compact summaries) |
| `taskboard_get` | Full single-card read: description, prompt, comment thread, checklist, executions |
| `taskboard_comments` | List a task's comments (treated as the latest requirements — read before acting) |
| `taskboard_create` | Create a card (workspaceId, urgency, checklist, preset, isolation, schedule) |
| `taskboard_update` | Edit title / description / prompt / urgency / checklist (model & execution are read-only) |
| `taskboard_move` | Move a card: todo→in_progress→in_review (**done is unreachable**) |
| `taskboard_comment_add` | Append a comment (hand-offs, risks, progress) |
| `taskboard_delete` | Soft delete (purge available; running executions cannot be deleted) |
| `taskboard_checklist` | Acceptance checklist add / check (with evidence) / uncheck |
| `taskboard_execution_report` | Submit the structured execution report, attached to the current execution |

**Project argument (0.9.5)**: `workspaceId` in `taskboard_list` and `taskboard_create` accepts a project ID or the absolute path of a registered project root (for example, `D:\work\my-project`). Relative paths and unregistered subdirectories do not identify the project root. Created tasks always store the project ID. Unknown projects fail with `not_found` and correction hints; registered projects without tasks still return zero rows, and omitting the list project filter still lists all projects.

## Features

**Board collaboration**
- Five-column board (Backlog / Todo / In Progress / In Review / Done) + blocked markers, SSE real-time refresh
- Tasks belong to projects: claiming validates session ownership — no snatching across projects
- Three-color urgency (urgent red / normal purple / relaxed blue) with filtering and color bars; search (title / ID) and in-column sorting; filters and sorting persist
- Status-colored dots on column headers: backlog gray / todo blue / in-progress orange / in-review purple / done green / deleted red
- **Collapsible project groups (0.8.10)**: click a project name row to fold its cards while keeping the name and count visible; each column/project pair folds independently and restores after refresh; supported on the main board and in canceled, archived, and trashed columns, with sticky headers and keyboard access preserved
- **Sticky project group headers while a column scrolls (0.8.9)**: on long columns the project group header (workspace name row) pins to the top instead of riding away with the cards; its fill is an opaque three-layer stack, so cards sliding underneath never bleed through
- **Done column folding and display limit (0.8.8)**: Board Settings can cap how many completed cards a column renders (default 50, 10–500; search exempts the cap); the done column collapses into a compact strip (state persisted, still a drop target) while the host omits done tasks from `/state` and reports the total; completed tasks sort newest-first, grouped per workspace, easing render lag on large histories
- Create/edit modal: project, model (with reasoning effort), urgency, execution mode, cron with live validation & next-run preview, periodic completion and independent session policies, isolation toggle, checklist editor
- Detail panel: status transitions (*done* is human-only; completing with unchecked items asks for confirmation and shows the count), agent/user comment thread, execution history (newest first; session IDs open the execution session on click; deleted/archived targets get distinct notices), stop execution, worktree isolation block (branch / commits / change stats / merge & cleanup), execution report block, acceptance checklist block; clicking any blank board area outside the panel dismisses it (0.8.8)
- Quick actions on In Review cards: "✓ Done" one-click accept, "✗ Send back" returns to Todo with an optional reason agents read before starting
- **Image attachments (0.7.0)**: task descriptions and comments accept PNG/JPEG/GIF/WebP through file picker, paste, or drag and drop and insert Markdown automatically; task details show thumbnails with click-to-zoom lightbox previews. Images stay in the local data directory, capped at 5 MiB each
- **Two-column wide task form + slash completion (0.6.0)**: the create/edit modal goes two-column (core fields and execution config on the left, description and prompt on the right); typing `/` in the description/prompt pops command and skill completion (↑↓/Enter/Tab/Esc keyboard navigation; host-discovered items merge over the built-in list); Markdown images in description/prompt render as thumbnails with a click-to-zoom lightbox
- **Execution permission (0.6.0)**: per-task three-way execution permission (📁 workspace write / 🔒 read-only / ⚡ full access) picked in the form plus a default-permission board setting; permission badges on cards, the detail panel and the template list
- **Bilingual UI, zh/en (0.6.0)**: every piece of board copy follows DSH's "Settings - General - Language" switch live (no reload); the preference is stored by DSH itself (locale.preference in settings.yaml) and the plugin adds no settings of its own; environments without the DSH locale service fall back to the browser language
- **External session auto-sync (0.5.5)**: with "🔄 auto-capture sessions" enabled in board settings, sessions created directly in a workspace spawn task cards automatically — the project is resolved from the session's cwd and the first user message becomes the title/description; running sessions enter In Progress with the session bound (one-click jump works), successful turns settle into In Review, failures fall back to Todo; subagent sessions are filtered too since 0.6.0; placeholder titles ("session xxxxxxxx") reconcile to the real title automatically (0.8.8); off by default
- **One-click session jump (0.5.4; double-click since 0.8.8)**: **double-click a task card** to open its execution session directly (the board collapses over it; single-click still selects the card — a 250ms debounce keeps the two apart); the detail panel's "🤖 Jump to session" button and the holder chip work the same — straight to the running (or most recent) execution's session. A card created in a conversation and worked on in that same conversation records no execution, and now still jumps back to that conversation; archived / deleted / unavailable sessions each get a precise notice
- **Remember the last model (0.5.4)**: the new-task form brings back the last chosen model and reasoning effort (template prefill and editing are unaffected)
- **DoD acceptance checklists (0.4.0)**: define acceptance criteria at creation (≤30 items); agents add/tick items via `taskboard_checklist` (with evidence notes); users tick them directly in the detail panel; unchecked items glow red while In Review and the card shows a "☑ n/m" badge (red until all ticked); checklist editing manages the whole group in the form (tick states and evidence preserved)
- **Structured execution reports (0.4.0)**: agents finish with `taskboard_execution_report` (summary / changed files / checks / artifacts / remaining risks), auto-attached to the current execution; rendered side-by-side in the In Review detail panel; the opening protocol makes the order explicit (report → comment → move to In Review)
- **JSON import (0.4.0)**: "⬆ Import" in the toolbar picks a backup file → dry-run preview (added / overwritten / invalid breakdown) → merge (upsert by id) or full replace (auto-backup of the current ledger first + double confirmation); JSON exports restore directly in the same format
- **Task templates (0.4.0)**: "+ New Task ▼" dropdown (blank / templates grouped by category / manage templates) pre-fills the form (title / description / prompt / urgency / schedule / isolation / preset / checklist); "⌗ Save as template" in the task form and the task detail captures your own presets (0.8.8 form direct-save; the form stays open so you can still create the task); templates live beside the ledger in the active data directory, rename/categorize/delete in the manager dialog with inline category editing for custom templates and factory categories (Development / Operations) on built-ins (0.8.8)
- **Diff viewer (0.4.0)**: clicking a commit row or an uncommitted modified-file row in the isolation block expands a diff in-board (`git show` for commits, `git diff` for files, capped at 128 KB / 2000 lines with truncation noted); falls back to the main repo when the worktree is gone (commits and baseline-range diffs only)

**Agent tools (`taskboard_*`)**
- 10 tools: board / create / edit / move / comments / soft delete / checklist / execution report — usable from any session
- Code-level protocol gates: agents can never reach *done* (not even with every checklist item ticked); held tasks cannot be preempted; model/execution fields are read-only to agents

**Execution**
- Manual runs open a new session. By default, a scheduled task creates a session on its first run and continues that conversation on later runs. You can also choose an existing session in the selected project to keep its context. If that chosen session is unavailable, the task reports the problem instead of silently switching to a new one.
- **Periodic completion policies (0.8.2)**: choose the behavior under **After periodic completion** in the task form. The default **Create a new todo** preserves this round for review and has the host create a new todo card inheriting the cron, prompt, and configuration. **Return to todo** has the host re-arm the same card for the next cron window. The choice persists on the task and is inherited by templates and successors; settlement enforces it without relying on an agent status move. Existing cron tasks without an explicit setting use the same default.
- **Per-task presets (0.3.3)**: an "execution mode (preset)" dropdown in the create/edit form — execution sessions are composed from that preset (tool sets and persona come from it, matching how the GUI composes new sessions); defaults to the deployment default preset, or pick "follow deployment default"; a broken preset fails the execution outright and records why in the execution history (no half-composed sessions); changeable anytime, effective next round
- **Git worktree isolated execution (0.3.0)**: per-task toggle (since 0.5.0 the default for newly created tasks comes from Board Settings; factory default runs in place). Every execution happens on a dedicated worktree at `<project>/.dsh-worktrees/<taskId>`, branch `task/<title>+<taskId>` (fixed after first creation; renaming doesn't rename branches). The executing session stays rooted at the project directory (grouping, tools, and the file sandbox fully available — DSH requires session cwd === workspace root, fixed in 0.3.2), and the worktree path plus boundary rules are spelled out in the opening instructions. Settlement collects commit lists / uncommitted-changes warnings / change stats automatically. Non-git projects or missing git degrade gracefully to in-place execution (the reason is recorded; the ledger and execution flow never fail because of git). At acceptance: one-click `--no-ff` merge into the main working tree (dirty tree / conflicts reported verbatim, never auto-resolved), worktree deletion (refused with uncommitted changes), optional branch deletion. "↻ Resume" continues on the existing worktree/branch (previous commits and edits kept)
- **Multi-repo mirror isolation (0.6.3)**: when a workspace holds several parallel git repositories (a root repo plus nested independent ones), worktree mode upgrades into a whole-workspace task mirror — a bounded scan discovers every repo (depth ≤3, capped at 8, 60s cache; submodule / linked-worktree shapes are skipped), each repo gets its own worktree on the same task branch mounted at its relative path under `<project>/.dsh-worktrees/<taskId>/`; the session framing lists every repo's mirror path and branch and marks un-mirrored repos do-not-touch; commit evidence, diff viewing (`?repo=`) and merging (per-repo `--no-ff`, one conflict never blocking the others, per-repo summaries) all work per repo; mirror cleanup aggregates dirty checks across all repo worktrees and removes children before the root; the new `branches` / `repos` record fields are purely additive — single-repo behavior and old data are untouched; container workspaces whose root repo tracks sub-repos as gitlinks (embedded repos) are fully supported too — the structural noise nested child mirrors produce in the root mirror's status (untracked directories / gitlink drift) is exempted automatically from evidence collection, merge clean-checks, and mirror removal; the create-task form shows an "mirrors N repos" note on multi-repo workspaces, and pure-container workspaces (root not a repo, parallel sub-repos only) can pick worktree isolation too
- **Board settings**: "🛠 Settings" in the toolbar configures the default model, reasoning effort, Agent preset, isolation, permission, and the completed-column display limit for new tasks. Effort is saved with its model and resets to the model default when switching models. Explicit task or template choices win; both the GUI and `taskboard_create` materialize board defaults onto new tasks, so later settings changes never rewrite existing tasks. Without a board model default, the GUI retains its remembered last model; the task form can also explicitly follow deployment defaults. Settings persist with the ledger and support JSON import/export.
  > Worktree isolation is a collaboration convention, not a sandbox: execution sessions hold full tool permissions, isolation rests on the branch convention, and it is not suitable for running untrusted code.
- Host-side scheduling: fires with the browser closed; missed windows are skipped, never replayed
- Optimistic concurrency (ifVersion) + full attribution (who changed what, which session executed)
- ⚙ Health diagnostics: ledger sanity checks + orphaned worktrees (present on disk but unowned in the ledger) with one-click cleanup

### Human action waiting and delivery review

- **Waiting for Me** filters human waits within the current project, search and urgency filters. Automatic recognition is labeled as a suggestion and avoids generic business terms such as login or verification codes.
- Task details support an editable reason, explicit marking, explicit clearing and restoring automatic recognition. Explicit clearing overrides inference. Human waiting and generic blocking are independent; terminal and trashed tasks are excluded.
- Agents can report or clear waits with `taskboard_update` using `waitingForHuman` and `waitingReason`. Describe the action needed without entering credentials. JSON backups preserve these fields; HTTP updates accept `waitingForHuman: null` to restore automatic recognition.
- Review/done cards summarize the latest execution. Details foreground its report and acceptance checklist, with earlier reports in history. Verification notes are reported evidence, not a guarantee of success; some tasks require no file changes.

## Safety

- **Acceptance authority belongs to humans**: agent calls moving a task to *done* are rejected by the code-level protocol gate (a prompt suggestion, not); held tasks cannot be preempted; cross-project claims are rejected.
- **Worktree isolation is a convention, not a sandbox**: execution sessions have full tool permissions; isolation relies on the branch convention and is unsuitable for untrusted code.
- **Local data**: the ledger, templates, and image attachments remain local, and Board Settings can migrate their data directory; nothing is sent anywhere and no tokens / API keys are required.

## Configuration & Data

Works out of the box. The complete configuration surface:

| Environment variable | Default | Description |
| --- | --- | --- |
| `DSH_TASKBOARD_MAX_CONCURRENT` | `3` | Global cap on concurrently executing sessions |
| `DSH_HOME` | `~/.dsh` | DSH home, the default data directory and the fixed location-pointer directory |
| `ATB_TRACE` | unset | With `ATB_TRACE=1` the host prints tool-call traces (debugging) |

The data directory defaults to `DSH_HOME` and can be validated and migrated under "🛠 Settings → Data storage location". All three data items always move together; uninstalling the plugin keeps them.

| File | Contents |
| --- | --- |
| `dsh-taskboard.json` | Task ledger (all tasks / executions / comments) |
| `dsh-taskboard-templates.json` | Task templates |
| `dsh-taskboard-assets/` | Image attachments (deduplicated by content hash) |
| `dsh-taskboard.json.backup-<timestamp>` | Automatic backup taken before a full-replace import |
| `DSH_HOME/dsh-taskboard-storage.json` | Location pointer for a custom data directory; always remains under DSH home |
| `<project>/.dsh-worktrees/<taskId>/` | Per-task execution worktree (multi-repo workspaces: a whole-workspace mirror with one sub-worktree per repo) |

Use "⬇ JSON" in the toolbar to back up the ledger, or export the task list as CSV ("⬇ Export", BOM included, opens straight in Excel). Images are not embedded in JSON; for a complete backup, copy `dsh-taskboard-assets/` from the data directory shown in Settings.

## FAQ

**No "Task Board" entry in the sidebar?**
Refresh the page. Still nothing? Confirm the plugin is installed in the current profile and restart `dsh web` (the host half loads at process start). All three shell generations are supported: `data-pane` (dev), hashed class names (official layout, since 0.4.2), and the DSH Desktop non-compat extended frame (since 0.5.2).

**Where is task data stored? How do I back it up?**
See [Configuration & Data](#configuration--data). "⬇ JSON" exports and restores the ledger; image attachments also require a backup of the `dsh-taskboard-assets/` folder.

**Do scheduled tasks still fire when the browser is closed?**
Yes. Scheduling lives in the host process and is browser-independent; missed windows are skipped, not replayed.

**Why does my periodic task stop in In Review, and how can it continue automatically?**
By default, the system retains this round for review and creates the next todo card. In the task form, choose **Return to todo** instead to reuse the card at the next cron window. Both policies are host-enforced; existing cron tasks without an explicit setting use the default create-successor behavior too.

**My project isn't a git repo — does it still work?**
Yes. Worktree isolation degrades automatically to in-place execution with the reason recorded in the execution history; everything else is unaffected.

**How do multiple projects cooperate?**
Tasks attach to projects (= DSH workspaces). Claiming validates session ownership: only sessions inside the task's project can claim/execute it — no cross-project snatching.

**Can an agent mark a task "Done" itself?**
No. That is a code-level protocol gate (not a prompt convention): `taskboard_move` calls targeting *done* are rejected outright; acceptance is always performed by a human on the board.

**GitHub-source install blocked at prepare?**
That's pnpm build authorization — add the key printed in the error to `allowBuilds` in the profile's `pnpm-workspace.yaml` and retry; or install from npm instead (prebuilt, no such step).

**Board toolbar's right-side buttons covered when dsh-better-sidebar is installed?**
Fixed since 0.6.5 with automatic yielding: while better-sidebar's right panel is collapsed, its persistent corner cluster ("expand bottom panel" / "expand sidebar") occupies the top-right 10-70px of the viewport; the active board now reserves that strip on the toolbar's right side (mirroring better-sidebar's own yield contract for DSH's native session header), so they never overlap at any window width. No effect when better-sidebar is absent or its panel is open ([#19](https://github.com/cloader/dsh-taskboard/issues/19)).

**Windows DSH Desktop caption controls overlap the board toolbar?**
The 0.6.6 fix reserves space below the native caption controls based on the board's actual position in the viewport. Layouts with a separate titlebar keep their normal spacing; window resizing and layout changes trigger recalculation. Verified on Windows Desktop ([#20 comment](https://github.com/cloader/dsh-taskboard/issues/20#issuecomment-5597498727)).

**DoD checkboxes take up the edit row and push the text input out?**
0.6.6 excludes checkboxes from the modal's full-width input styles, restoring the checkbox's 15px width and the text input area ([#20](https://github.com/cloader/dsh-taskboard/issues/20)).

## Development

```bash
git clone https://github.com/cloader/dsh-taskboard.git
cd dsh-taskboard
npm install && npm run build    # dual build: host ESM + client CJS
npm test                        # full vitest suite (including real-git mirror integration tests)
node tests/manual-git-e2e.mjs   # real-git end-to-end manual test (full worktree chain + resume + diff viewer)
```

`npm run build` cleans stale files from `lib/` before generating the host ESM modules and the client registration module, `lib/client.js`. `npm run build:host` and `npm run build:client` rebuild only their respective half and preserve the other half's output; run the full build before publishing.

## External task sync

ZenTao supports project or execution/iteration mapping for Bugs, Stories and Tasks. TAPD supports Bugs, Stories and Tasks. Both ZenTao modes have passed read-only real-deployment checks; TAPD remains locally mock-validated.

1. Open **External sync** in settings. ZenTao uses its installation URL without `/api.php/v1`, username and password. Reuse the login username as assignee by default, or enter another assignee. TAPD uses API Basic Auth or Bearer Token and a separate member nickname.
2. Select the **Sync scope** (Bugs, Stories, Tasks), import destination (Backlog or Todo) and polling interval (0 disables polling; otherwise 5–1440 minutes).
3. Choose **Link projects** (default) or **Link executions/iterations**, then **Sync project/execution list**. Discovery lists all readable entries for that mode, independent of selected item types.
4. Each row shows the name, ID and local project selector; execution names include their parent project. **Not linked** rows are excluded by default. Refresh preserves associations and flags previously linked entries that are no longer readable. Changing mode clears the mapping draft; saved configuration stays active until explicitly saved.
5. **Test connection** uses the current form without saving. Save configuration, then sync tasks. Empty mappings can be saved; they import nothing unless unlinked synchronization is enabled. Polling requires a running host and uses saved settings.

Project mode reads project Bugs/Stories and aggregates Tasks from all project executions, deduplicating within that project. Execution mode reads selected types directly from the execution. New imports filter by assignee and terminal state. The same Story can create separate cards under separate execution mappings. Mapping modes retain independent source identities; old cards are not merged or removed. Existing nonempty local destinations and execution states are preserved. Content uses three-way merge and existing running/terminal protections; deletion exclusions remain scoped to each mapping.

**Sync unlinked projects** / **Sync unlinked executions/iterations** is off by default. When enabled, every scan discovers all readable scopes, including newly created entries and rows without local associations. New cards from those scopes have no local project; linked scopes still use their configured destination. After a scope is associated and saved, the next sync fills empty card destinations without creating duplicates. Nonempty destinations, archived cards and trashed cards are preserved. Saving with no associations is supported in this mode. Turning it off stops future unlinked scans without deleting cards.

Old ZenTao connections without a mapping mode retain credentials and tasks but pause automatic sync and require reassociation. Product IDs are never reinterpreted as project IDs. Refresh, associate and save to resume.

Credentials remain in the host-only plaintext `dsh-taskboard-external.json` under active DSH_HOME; protect this file. Passwords/tokens are excluded from public status and task exports. ZenTao obtains in-memory tokens; old token-only configurations are unsupported. Task and sync metadata persistence is atomic. One active connection is supported; screenshots, attachments, webhooks and write-back are excluded.

Real-deployment validation on 2026-10-16 read 4 Bugs, 4 linked Stories and 8 Tasks in project mode, with corresponding execution results. Each mode imported 2 Bugs and 2 Tasks for admin; repeat scans created or updated nothing. No Stories were assigned to that account, so assigned Story imports remain covered by mock tests. Only temporary local ledgers were written; tracker business data was not changed.

## Changelog

### 0.9.6

- **Claim from linked workspace roots ([#62](https://github.com/cloader/dsh-taskboard/pull/62), thanks [@reysonk](https://github.com/reysonk))**: add the board-wide `allowClaimFromLinkedRoots` setting, off by default. When enabled, sessions may claim tasks in attached workspace roots without changing task ownership. Requires the multi-root workspace plugin; missing or throwing services fall back to primary-root claiming.
- **Protocol and scope guidance**: align the agent protocol and bilingual settings hints. Cross-root work must use the task project directory and respect existing file permissions. Creation rules remain unchanged: registered project IDs and resolvable project directories are accepted.
- **Regression coverage**: cover linked-root claims, default rejection, unavailable services, error hints, cross-project creation and protocol constraints; all 583 tests across 44 files pass.

### 0.9.5

- **Project paths and correction hints (#58 / #59)**: `taskboard_list` and `taskboard_create` accept the absolute path of a registered project root as `workspaceId`, while created tasks still store the project ID. Unknown projects continue to fail with `not_found`; error details provide a reusable ID for the calling session project, or list up to 8 project IDs when the session cannot be associated. Thanks to [@Ausli](https://github.com/Ausli).

### 0.9.4

- **Comment wake (#51)**: in-review cards gain a "Send & let the agent handle" button — clicking merges the comment with every pending user comment into ONE user message and wakes the task's conversation (the card returns to in progress); a live session receives it immediately, otherwise the run continues the card's conversation or starts fresh with the reason recorded. Worktree-isolated tasks always resume the mirror so reviewed work survives. Delivered comments are marked with a session jump; agent/system comments never trigger delivery, and only in-review cards can be woken (enforced at both gates).
- **Comment attribution and readability**: system comments carry their session and are excluded from the delivery backlog, so legacy system comments are no longer mislabeled as pending user feedback; agent labels jump to their session, and the executions timeline is collapsed by default.

### 0.9.3

- **Ledger crash recovery (#53)**: locks orphaned by a host crash are recovered immediately via pid liveness checks; live or indeterminate owners are never reaped by age. Clean startup no longer takes the write lock, and reconciliation failures degrade to a warning instead of a fatal load failure — fixing the crash loop where a restart would fail again.
- **Human action waiting (based on #54, thanks [@monkey-sking](https://github.com/monkey-sking))**: explicit waits, explicit clears and automatic recognition are fully persisted through the shared protocol and independent of generic blocking. Amber badges and a "waiting for me" filter highlight cards waiting on humans; heuristic reasons are localized and never stored as credentials.
- **Delivery review (based on #54)**: the latest execution report and checklist are foregrounded on cards and in task details, with labeled report history, neutral verification markers and one-click path copying.
- **Default project (#56)**: board settings gain a default project; new tasks start from it when no board filter is set, and dangling references are skipped on read.
- **Quality**: CI adds independent typechecking and regression coverage for lock recovery, waiting state, filters, report history and the default project; builds run automatically before publish.

### 0.9.2

- **List filter validation (#52, thanks [@Ausli](https://github.com/Ausli))**: `taskboard_list` filter errors now surface as `not_found` / `invalid_input` instead of silently matching nothing.

### 0.9.1

- Map ZenTao projects or executions/iterations, independently select Bugs/Stories/Tasks, and associate local projects row by row.
- Optionally sync unlinked/new scopes into projectless cards. Legacy product configurations retain credentials/tasks and require reassociation.
- Test the current form, save empty mappings, and improve settings layout and copy.
- Fix card session navigation and reruns for unheld in-progress cards without a running execution (#50).

### 0.9.0

- Add ZenTao/TAPD external sync and a shared provider contract; ZenTao is verified against a real deployment. Add settings navigation, login-assignee reuse, conflict handling, durable sync status and request throttling.
- Fall back to a new conversation when a scheduled bound session cannot be reused (#49).

> 📜 For the complete history of earlier versions, see [changelog.md](changelog.md).
