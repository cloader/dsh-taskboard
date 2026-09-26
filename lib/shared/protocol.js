//#region src/shared/protocol.ts
/** Statuses shown as the five main board columns, in order. */
const MAIN_STATUSES = [
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done"
];
/** Statuses collected under the secondary tab. */
const SECONDARY_STATUSES = ["canceled", "archived"];
/** Every valid status, main first. */
const ALL_STATUSES = [...MAIN_STATUSES, ...SECONDARY_STATUSES];
/**
* Legal forward/sideways transitions. Anything not listed is rejected with
* `invalid_transition`. `archived` is terminal.
*/
const TRANSITIONS = {
	backlog: ["todo", "canceled"],
	todo: [
		"in_progress",
		"backlog",
		"canceled"
	],
	in_progress: [
		"in_review",
		"todo",
		"canceled"
	],
	in_review: [
		"in_progress",
		"todo",
		"done",
		"canceled"
	],
	done: ["archived", "todo"],
	canceled: ["archived", "todo"],
	archived: []
};
/**
* Whether a status move is legal per the state machine.
* @param from - current status.
* @param to - requested status.
* @returns true when the transition is allowed.
*/
function canTransition(from, to) {
	return TRANSITIONS[from].includes(to);
}
/**
* The claim move: the one transition that transfers ownership of a task to
* the calling session. Guarded by the project (workspace) boundary in the
* tool layer.
*/
function isClaim(from, to) {
	return from === "todo" && to === "in_progress";
}
/** All valid urgency values. */
const URGENCIES = [
	"urgent",
	"normal",
	"relaxed"
];
/**
* Factory-default isolation (0.5.0): 原目录执行. Applies when neither the
* task record nor the board setting (`BoardSettings.defaultIsolation`)
* says otherwise. Before 0.5.0 the implicit default was 'worktree'.
*/
const DEFAULT_ISOLATION = "none";
const MAX_SCHEDULE_MISSED_AFTER_MINUTES = 1440;
const MAX_QUEUE_MAX_AGE_MINUTES = 10080;
/** Default spacing between scheduler-created sessions. */
const DEFAULT_DISPATCH_INTERVAL_MS = 1e3;
const MAX_DISPATCH_INTERVAL_MS = 6e4;
/** Validate an isolation value. */
function asIsolation(raw) {
	if (raw !== "worktree" && raw !== "none") throw new Error("isolation must be 'worktree' or 'none'");
	return raw;
}
/** Resolve a task's effective isolation (omitted → the factory default). */
function effectiveIsolation(task) {
	return task.isolation === void 0 ? DEFAULT_ISOLATION : task.isolation;
}
/** Factory default permission preset (0.5.5). */
const DEFAULT_PERMISSION = "workspace-write";
/** Validate and normalize a permission string into a valid {@link PermissionMode}. */
function asPermission(raw) {
	if (typeof raw !== "string") return DEFAULT_PERMISSION;
	const normalized = raw.trim();
	if (normalized === "workspace-write" || normalized === "workspaceWrite") return "workspace-write";
	if (normalized === "read-only" || normalized === "readOnly") return "read-only";
	if (normalized === "danger-full-access" || normalized === "fullAccess") return "danger-full-access";
	throw new Error("permission must be 'workspace-write', 'read-only', or 'danger-full-access'");
}
/** Validate raw input into sanitized {@link BoardSettings} (unknown fields dropped). */
function asBoardSettings(raw) {
	if (typeof raw !== "object" || raw === null) throw new Error("board settings must be an object");
	const e = raw;
	const out = {};
	if (e.defaultIsolation !== void 0) {
		if (typeof e.defaultIsolation !== "string") throw new Error("defaultIsolation must be 'worktree' or 'none'");
		out.defaultIsolation = asIsolation(e.defaultIsolation);
	}
	if (e.syncExternalSessions !== void 0) {
		if (typeof e.syncExternalSessions !== "boolean") throw new Error("syncExternalSessions must be a boolean");
		out.syncExternalSessions = e.syncExternalSessions;
	}
	if (e.defaultPermission !== void 0) out.defaultPermission = asPermission(e.defaultPermission);
	if (e.maxConcurrent !== void 0) {
		if (typeof e.maxConcurrent !== "number" || !Number.isSafeInteger(e.maxConcurrent) || e.maxConcurrent < 1 || e.maxConcurrent > 100) throw new Error(`maxConcurrent must be an integer from 1 to 100`);
		out.maxConcurrent = e.maxConcurrent;
	}
	if (e.scheduleMissedAfterMinutes !== void 0) {
		if (typeof e.scheduleMissedAfterMinutes !== "number" || !Number.isSafeInteger(e.scheduleMissedAfterMinutes) || e.scheduleMissedAfterMinutes < 1 || e.scheduleMissedAfterMinutes > 1440) throw new Error(`scheduleMissedAfterMinutes must be an integer from 1 to ${MAX_SCHEDULE_MISSED_AFTER_MINUTES}`);
		out.scheduleMissedAfterMinutes = e.scheduleMissedAfterMinutes;
	}
	if (e.queueMaxAgeMinutes !== void 0) {
		if (typeof e.queueMaxAgeMinutes !== "number" || !Number.isSafeInteger(e.queueMaxAgeMinutes) || e.queueMaxAgeMinutes < 0 || e.queueMaxAgeMinutes > 10080) throw new Error(`queueMaxAgeMinutes must be an integer from 0 to ${MAX_QUEUE_MAX_AGE_MINUTES}`);
		out.queueMaxAgeMinutes = e.queueMaxAgeMinutes;
	}
	if (e.dispatchIntervalMs !== void 0) {
		if (typeof e.dispatchIntervalMs !== "number" || !Number.isSafeInteger(e.dispatchIntervalMs) || e.dispatchIntervalMs < 0 || e.dispatchIntervalMs > 6e4) throw new Error(`dispatchIntervalMs must be an integer from 0 to ${MAX_DISPATCH_INTERVAL_MS}`);
		out.dispatchIntervalMs = e.dispatchIntervalMs;
	}
	return out;
}
/** The effective default isolation for NEW tasks (board setting → factory default). */
function defaultIsolationOf(settings) {
	return settings?.defaultIsolation ?? "none";
}
/** The effective external session sync switch (board setting → factory default false). */
function defaultSyncExternalSessionsOf(settings) {
	return settings?.syncExternalSessions ?? false;
}
/** The effective default permission preset for NEW tasks (board setting → factory default 'workspace-write'). */
function defaultPermissionOf(settings) {
	return settings?.defaultPermission ?? "workspace-write";
}
/** Effective global execution cap (board setting → supplied deployment default). */
function maxConcurrentOf(settings, fallback = 3) {
	return settings?.maxConcurrent ?? fallback;
}
/** Effective offline missed-window threshold in minutes (board setting → factory default). */
function scheduleMissedAfterMinutesOf(settings) {
	return settings?.scheduleMissedAfterMinutes ?? 5;
}
/** Effective queued-work shelf life in minutes; zero means durable replay. */
function queueMaxAgeMinutesOf(settings) {
	return settings?.queueMaxAgeMinutes ?? 0;
}
/** Effective minimum spacing between scheduled session starts. */
function dispatchIntervalMsOf(settings) {
	return settings?.dispatchIntervalMs ?? 1e3;
}
/** Default periodic behavior: keep this round for review and create the next todo card. */
const DEFAULT_PERIODIC_COMPLETION = "spawn";
/**
* Parse a five-field cron expression. Supported field syntax: star, star/step
* (`* / n` without spaces), a single number, an `a-b` range, and comma lists
* of those. Day-of-week accepts both 0 and 7 as Sunday (normalized to 0).
*
* @param expr - the expression to parse.
* @returns the match sets per field, or null when invalid.
*/
function parseCron(expr) {
	const fields = expr.trim().split(/\s+/);
	if (fields.length !== 5) return null;
	const ranges = [
		[0, 59],
		[0, 23],
		[1, 31],
		[1, 12],
		[0, 7]
	];
	const sets = [];
	for (let i = 0; i < 5; i++) {
		const [min, max] = ranges[i];
		const set = /* @__PURE__ */ new Set();
		if (!parseCronField(fields[i], min, max, set)) return null;
		sets.push(set);
	}
	const weekdays = /* @__PURE__ */ new Set();
	for (const day of sets[4]) weekdays.add(day === 7 ? 0 : day);
	return {
		minutes: sets[0],
		hours: sets[1],
		days: sets[2],
		months: sets[3],
		weekdays
	};
}
/** Parse one cron field into a match set; false on any syntax error. */
function parseCronField(field, min, max, out) {
	for (const part of field.split(",")) {
		const [range, stepRaw] = part.split("/");
		const step = stepRaw === void 0 ? 1 : Number.parseInt(stepRaw, 10);
		if (!Number.isInteger(step) || step < 1) return false;
		let lo;
		let hi;
		if (range === void 0 || range === "") return false;
		if (range === "*") {
			lo = min;
			hi = max;
		} else if (range.includes("-")) {
			const [a, b] = range.split("-");
			lo = Number.parseInt(a ?? "", 10);
			hi = Number.parseInt(b ?? "", 10);
			if (!Number.isInteger(lo) || !Number.isInteger(hi)) return false;
		} else {
			lo = Number.parseInt(range, 10);
			if (!Number.isInteger(lo)) return false;
			hi = stepRaw === void 0 ? lo : max;
		}
		if (lo < min || hi > max || lo > hi) return false;
		for (let v = lo; v <= hi; v += step) out.add(v);
	}
	return out.size > 0;
}
/**
* The next time at or after `from` matching the cron sets (local time),
* or null when no match exists within four years (e.g. Feb 30).
* @param match - parsed cron sets.
* @param from - epoch ms start point (inclusive match candidate).
* @returns the next match's epoch ms, or null.
*/
function nextCronTime(match, from) {
	const start = new Date(from);
	start.setSeconds(0, 0);
	start.setMinutes(start.getMinutes() + 1);
	const cap = from + 4 * 366 * 24 * 60 * 60 * 1e3;
	let t = start.getTime();
	while (t <= cap) {
		const d = new Date(t);
		if (match.months.has(d.getMonth() + 1) && match.days.has(d.getDate()) && match.weekdays.has(d.getDay()) && match.hours.has(d.getHours()) && match.minutes.has(d.getMinutes())) return t;
		t += 6e4;
	}
	return null;
}
/**
* Whether `rel` is a legal repo-path key (0.6.3): `''` = the workspace root
* repo; otherwise a relative forward-slash path with no traversal/absolute
* shape and no dot segments. These keys ride into filesystem joins
* (`<workspace>/<rel>`) and ledger maps — the same R4 paranoia as task ids.
*/
function isValidRelRepoPath(rel) {
	if (rel === "") return true;
	if (rel.length === 0 || rel.length > 300) return false;
	if (/^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith("\\\\") || rel.startsWith("/")) return false;
	return rel.split("/").every((p) => p.length > 0 && p !== "." && p !== ".." && !p.startsWith(".") && !/[\\:*?"<>|]/.test(p));
}
/**
* Enforce the execution-record retention cap on one task (in place): keep the
* newest {@link MAX_EXECUTIONS} records, count the dropped ones in
* `executionsPruned`. Running records are always the newest, never dropped.
* @param task - the task to prune.
*/
function pruneExecutions(task) {
	if (task.executions.length <= 20) return;
	const dropped = task.executions.length - 20;
	task.executions = task.executions.slice(-20);
	task.executionsPruned = (task.executionsPruned ?? 0) + dropped;
}
/**
* Mint the successor card of a PERIODIC scheduled task that just succeeded
* (0.7.x): the finished card goes to in_review for acceptance while this
* fresh todo card carries the cron onward, keeping the cycle alive. The
* next run is recomputed from `now` (no compensating catch-up burst).
* Pure: the caller pushes the returned record into the ledger.
* @param source - the finished periodic task (still carrying its cron).
* @param prevExecutionId - id of the execution that just succeeded.
* @param now - current epoch ms.
* @returns the successor task record.
*/
function spawnNextCycle(source, prevExecutionId, now) {
	const cron = source.execution.cron;
	if (cron === void 0) throw new Error("spawnNextCycle: source task has no cron");
	const match = parseCron(cron);
	const next = match === null ? void 0 : nextCronTime(match, now) ?? void 0;
	if (next === void 0) throw new Error("spawnNextCycle: cron has no upcoming match within 4 years");
	return {
		id: newTaskId(),
		title: source.title,
		description: source.description,
		prompt: source.prompt,
		workspaceId: source.workspaceId,
		urgency: source.urgency,
		status: "todo",
		blocked: false,
		execution: {
			mode: "scheduled",
			cron,
			nextRunAt: next,
			periodicCompletion: source.execution.periodicCompletion ?? "spawn"
		},
		...source.model !== void 0 ? { model: structuredClone(source.model) } : {},
		...source.isolation !== void 0 ? { isolation: source.isolation } : {},
		...source.presetId !== void 0 ? { presetId: source.presetId } : {},
		...source.permission !== void 0 ? { permission: source.permission } : {},
		...source.checklist !== void 0 ? { checklist: source.checklist.map((item) => ({
			...item,
			checked: false,
			checkedBy: void 0,
			checkedAt: void 0,
			note: void 0
		})) } : {},
		...source.branch !== void 0 ? { branch: source.branch } : {},
		...source.branches !== void 0 ? { branches: { ...source.branches } } : {},
		spawnedFrom: source.id,
		version: 1,
		createdAt: now,
		updatedAt: now,
		createdBy: { kind: "system" },
		updatedBy: { kind: "system" },
		comments: [{
			id: newCommentId(),
			body: normalizeBody(`[系统] 定期任务上一轮执行完毕（执行 ${prevExecutionId ?? "未知"}），本卡承接定时继续下一轮；上一轮成果见 ${source.id} 的待验收。`),
			systemKey: "sys.spawnedFrom",
			systemParams: {
				sourceId: source.id,
				executionId: prevExecutionId ?? ""
			},
			version: 1,
			createdAt: now
		}],
		executions: []
	};
}
/** An empty ledger. */
function emptyLedger() {
	return {
		schemaVersion: 1,
		revision: 0,
		tasks: []
	};
}
/** Random base36 suffix. */
function suffix() {
	return Math.random().toString(36).slice(2, 8);
}
/**
* Legal task id charset (R4): `t-<base36>-<base36>` from {@link newTaskId},
* and the ONLY shape accepted from the outside (import) or used to build
* filesystem paths (worktree dirs). Ids ride into `join(ws, '.dsh-worktrees',
* id)` — a lax charset here is an arbitrary-directory delete primitive.
*/
function isValidTaskId(id) {
	return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id);
}
/** Mint a task id. */
function newTaskId() {
	return `t-${Date.now().toString(36)}-${suffix()}`;
}
/** Mint a comment id. */
function newCommentId() {
	return `c-${Date.now().toString(36)}-${suffix()}`;
}
/** Mint a checklist item id. */
function newChecklistItemId() {
	return `k-${Date.now().toString(36)}-${suffix()}`;
}
/** Mint an execution id. */
function newExecutionId() {
	return `e-${Date.now().toString(36)}-${suffix()}`;
}
/**
* Validate and normalize a title: trimmed, 1..200 chars.
* @param raw - the raw input.
* @returns the normalized title.
* @throws when empty or too long.
*/
function normalizeTitle(raw) {
	const t = raw.trim();
	if (t.length === 0 || t.length > 200) throw new Error("title must be 1..200 characters");
	return t;
}
/**
* Validate a task prompt: trimmed, at most 8000 chars; empty becomes ''.
* @param raw - the raw input.
*/
function normalizePrompt(raw) {
	const t = (raw ?? "").trim();
	if (t.length > 8e3) throw new Error("prompt must be at most 8000 characters");
	return t;
}
/**
* Validate and normalize a comment body: trimmed, 1..4000 chars.
* @param raw - the raw input.
*/
function normalizeBody(raw) {
	const t = raw.trim();
	if (t.length === 0 || t.length > 4e3) throw new Error("comment body must be 1..4000 characters");
	return t;
}
/**
* Validate an urgency value.
* @param raw - the raw input.
*/
function asUrgency(raw) {
	if (!URGENCIES.includes(raw)) throw new Error(`urgency must be one of: ${URGENCIES.join(", ")}`);
	return raw;
}
/**
* Validate a status value.
* @param raw - the raw input.
*/
function asStatus(raw) {
	if (!ALL_STATUSES.includes(raw)) throw new Error(`status must be one of: ${ALL_STATUSES.join(", ")}`);
	return raw;
}
/**
* Parse a raw runAt input: epoch ms number or ISO date string → epoch ms.
* @param raw - untyped runAt value.
* @returns the epoch ms, or undefined when absent.
*/
function normalizeRunAt(raw) {
	if (raw === void 0 || raw === null) return void 0;
	if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
	if (typeof raw === "string") {
		const t = Date.parse(raw);
		if (Number.isNaN(t)) throw new Error("execution.runAt is not a valid time (epoch ms or ISO string)");
		return t;
	}
	throw new Error("execution.runAt must be an epoch ms number or an ISO date string");
}
/**
* Validate an execution config request from raw tool/route input.
* `scheduled` requires either a valid cron (periodic, 定期执行) or a runAt
* instant (one-shot, 定时执行); the two are mutually exclusive. A cron's
* first `nextRunAt` is computed from `now`.
* @param raw - raw execution input ({@link ExecutionConfig} fields, untyped).
* @param now - current epoch ms.
* @param opts - `allowPastRunAt` lets the import path keep a historical
*   one-shot instant instead of rejecting it.
* @returns the normalized config.
*/
function normalizeExecution(raw, now, opts) {
	const mode = raw.mode ?? "claim";
	if (mode !== "claim" && mode !== "scheduled") throw new Error("execution.mode must be 'claim' or 'scheduled'");
	if (mode === "claim") {
		if (raw.periodicCompletion !== void 0) throw new Error("execution.periodicCompletion requires a cron schedule");
		return { mode };
	}
	const runAt = normalizeRunAt(raw.runAt);
	const cron = (raw.cron ?? "").trim();
	if (cron.length > 0 && runAt !== void 0) throw new Error("execution: cron and runAt are mutually exclusive (periodic vs one-shot)");
	if (runAt !== void 0) {
		if (raw.periodicCompletion !== void 0) throw new Error("execution.periodicCompletion requires a cron schedule");
		if (!opts?.allowPastRunAt && runAt <= now) throw new Error("execution.runAt must be in the future");
		return {
			mode,
			runAt,
			nextRunAt: runAt
		};
	}
	const match = parseCron(cron);
	if (match === null) throw new Error("execution.cron is not a valid 5-field cron expression");
	const next = nextCronTime(match, now);
	if (next === null) throw new Error("execution.cron never matches within 4 years");
	const periodicCompletion = raw.periodicCompletion ?? "spawn";
	if (periodicCompletion !== "rearm" && periodicCompletion !== "spawn") throw new Error("execution.periodicCompletion must be 'rearm' or 'spawn'");
	return {
		mode,
		cron,
		nextRunAt: next,
		periodicCompletion
	};
}
/**
* The effective prompt of a task: title+description, with the explicit
* prompt appended when set — title+description+prompt.
* @param task - the task.
*/
function effectivePrompt(task) {
	const head = task.title;
	const body = task.description.length > 0 ? `${head}\n\n${task.description}` : head;
	return task.prompt.length > 0 ? `${body}\n\n${task.prompt}` : body;
}
/**
* Whether the task is currently claimed by a session (running state).
* @param task - the task.
*/
function isClaimedBy(task) {
	return task.status === "in_progress" && task.claimedBy !== void 0 ? task.claimedBy : void 0;
}
/**
* Maintain the explicit claim fields around a status change: entering
* in_progress under a session records the holder (an execution-start or an
* agent claim); every move out of in_progress releases the claim (handoff,
* give-back, cancel). A user-driven move into in_progress records no holder —
* no session works on it yet.
* @param task - the task being written (mutated in place).
* @param to - the target status.
* @param now - current epoch ms.
* @param holder - the session id claiming the task, when applicable.
*/
function syncClaim(task, to, now, holder) {
	if (to !== "in_progress") {
		delete task.claimedBy;
		delete task.claimedAt;
	} else if (holder !== void 0) {
		task.claimedBy = holder;
		task.claimedAt = now;
	}
}
/**
* Collect unique execution session IDs associated with a task:
* - executions with a non-empty `sessionId`
* Creator and claim sessions may serve other tasks and are never included.
* @param task - the task record to inspect.
* @returns an array of distinct session IDs in stable discovery order.
*/
function taskAssociatedSessionIds(task) {
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	const push = (raw) => {
		if (typeof raw === "string") {
			const trimmed = raw.trim();
			if (trimmed.length > 0 && !seen.has(trimmed)) {
				seen.add(trimmed);
				result.push(trimmed);
			}
		}
	};
	if (Array.isArray(task.executions)) {
		for (const ex of task.executions) if (ex !== null && typeof ex === "object") push(ex.sessionId);
	}
	return result;
}
/**
* Validate and normalize a pinned model: `{ provider, model, reasoningEffort? }`,
* provider and model must be non-empty trimmed strings.
* @param raw - the raw input.
* @returns the normalized model.
* @throws when the shape or the fields are invalid.
*/
function normalizeModel(raw) {
	if (typeof raw !== "object" || raw === null) throw new Error("model must be { provider: string, model: string }");
	const { provider, model, reasoningEffort } = raw;
	if (typeof provider !== "string" || typeof model !== "string") throw new Error("model must be { provider: string, model: string }");
	const p = provider.trim();
	const m = model.trim();
	if (p.length === 0 || m.length === 0) throw new Error("model.provider and model.model must be non-empty strings");
	const eff = typeof reasoningEffort === "string" && reasoningEffort.trim().length > 0 ? reasoningEffort.trim() : void 0;
	return {
		provider: p,
		model: m,
		...eff !== void 0 ? { reasoningEffort: eff } : {}
	};
}
/**
* Validate and normalize one checklist text line: trimmed, 1..200 chars.
* @param raw - the raw text.
* @throws when empty or too long.
*/
function normalizeChecklistText(raw) {
	const t = raw.trim();
	if (t.length === 0 || t.length > 200) throw new Error(`checklist item text must be 1..200 characters`);
	return t;
}
/**
* Build a fresh unchecked checklist from plain text lines (create route /
* templates / tool adds).
* @param texts - the item texts (validated individually).
*/
function checklistFromTexts(texts) {
	const items = texts.map((text) => ({
		id: newChecklistItemId(),
		text: normalizeChecklistText(text),
		checked: false
	}));
	if (items.length > 30) throw new Error(`checklist may hold at most 30 items`);
	return items;
}
/**
* Validate and normalize a full checklist array (GUI update route, import):
* missing ids are minted, text is checked, checked flags must be booleans,
* checkedBy/checkedAt are kept only on checked items.
* @param raw - untyped array from the wire.
* @throws with a readable reason on any invalid entry.
*/
function normalizeChecklist(raw) {
	if (!Array.isArray(raw)) throw new Error("checklist must be an array");
	if (raw.length > 30) throw new Error(`checklist may hold at most 30 items`);
	return raw.map((entry) => {
		if (typeof entry !== "object" || entry === null) throw new Error("checklist item must be an object");
		const e = entry;
		const text = normalizeChecklistText(typeof e.text === "string" ? e.text : "");
		const id = typeof e.id === "string" && e.id.trim().length > 0 ? e.id.trim() : newChecklistItemId();
		const checked = e.checked === true;
		const checkedBy = typeof e.checkedBy === "string" ? e.checkedBy.trim().slice(0, 100) : void 0;
		const checkedAt = typeof e.checkedAt === "number" && Number.isFinite(e.checkedAt) ? e.checkedAt : void 0;
		const note = typeof e.note === "string" && e.note.trim().length > 0 ? e.note.trim().slice(0, 400) : void 0;
		if (!checked) return {
			id,
			text,
			checked: false
		};
		return {
			id,
			text,
			checked: true,
			...checkedBy !== void 0 && checkedBy.length > 0 ? { checkedBy } : {},
			...checkedAt !== void 0 ? { checkedAt } : {},
			...note !== void 0 ? { note } : {}
		};
	});
}
/** Checklist progress: how many items are checked (absent checklist → 0/0). */
function checklistProgress(task) {
	const items = task.checklist ?? [];
	return {
		done: items.filter((i) => i.checked).length,
		total: items.length
	};
}
/** Report string-list caps. */
const REPORT_LIST_CAPS = {
	changedFiles: 50,
	checks: 50,
	artifacts: 30
};
/** Per-entry cap for report lists (chars). */
const REPORT_ENTRY_MAX = 300;
/** Validate one report string list: strings trimmed 1..300 chars. */
function normalizeReportList(raw, field) {
	if (raw === void 0) return [];
	if (!Array.isArray(raw)) throw new Error(`report.${field} must be an array of strings`);
	const out = raw.map((entry) => {
		if (typeof entry !== "string") throw new Error(`report.${field} must be an array of strings`);
		const t = entry.trim();
		if (t.length === 0 || t.length > REPORT_ENTRY_MAX) throw new Error(`report.${field} entries must be 1..${REPORT_ENTRY_MAX} characters`);
		return t;
	});
	if (out.length > REPORT_LIST_CAPS[field]) throw new Error(`report.${field} may hold at most ${REPORT_LIST_CAPS[field]} entries`);
	return out;
}
/**
* Validate and normalize a structured execution report.
* @param raw - untyped tool/route input.
* @throws with a readable reason on any invalid field.
*/
function normalizeExecutionReport(raw) {
	if (typeof raw !== "object" || raw === null) throw new Error("report must be an object");
	const e = raw;
	const summary = typeof e.summary === "string" ? e.summary.trim() : "";
	if (summary.length === 0 || summary.length > 2e3) throw new Error("report.summary must be 1..2000 characters");
	const risk = typeof e.risk === "string" ? e.risk.trim().slice(0, 2e3) : "";
	return {
		summary,
		changedFiles: normalizeReportList(e.changedFiles, "changedFiles"),
		checks: normalizeReportList(e.checks, "checks"),
		artifacts: normalizeReportList(e.artifacts, "artifacts"),
		risk
	};
}
/** One unknown-value read helper: string fields with defaults. */
function strOr(raw, key, fallback) {
	const v = raw[key];
	return typeof v === "string" ? v : fallback;
}
/** One unknown-value read helper: finite numbers with defaults. */
function numOr(raw, key, fallback) {
	const v = raw[key];
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
/** Evidence caps for imported per-repo facts (aligns the host's collect caps). */
const IMPORT_COMMIT_CAP = 50;
const IMPORT_DIRTY_CAP = 100;
/**
* Sanitize an imported per-task branches map (0.6.3): legal repo keys only,
* non-empty branch strings, capped at {@link MAX_MIRROR_REPOS} entries.
* @returns undefined when nothing legal remains.
*/
function normalizeBranchesMap(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const out = {};
	for (const [key, value] of Object.entries(raw)) {
		if (Object.keys(out).length >= 8) break;
		if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) continue;
		if (key === "" || !isValidRelRepoPath(key)) continue;
		out[key] = value.trim();
	}
	return Object.keys(out).length > 0 ? out : void 0;
}
/**
* Sanitize ONE imported per-repo evidence entry (0.6.3): rebuilds the record
* field by field, capping evidence arrays like the host's own collection.
* @returns undefined for a structurally illegal entry (dropped, not fatal).
*/
function normalizeRepoEvidence(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const e = raw;
	if (typeof e.repo !== "string" || !isValidRelRepoPath(e.repo)) return void 0;
	if (typeof e.branch !== "string" || e.branch.length === 0 || e.branch.length > 200) return void 0;
	if (typeof e.worktreePath !== "string" || e.worktreePath.length === 0 || e.worktreePath.length > 1e3) return void 0;
	const commits = Array.isArray(e.commits) ? e.commits.filter((c) => typeof c === "object" && c !== null && typeof c.hash === "string" && typeof c.subject === "string").slice(0, IMPORT_COMMIT_CAP) : void 0;
	const dirtyFiles = Array.isArray(e.dirtyFiles) ? e.dirtyFiles.filter((l) => typeof l === "string").slice(0, IMPORT_DIRTY_CAP) : void 0;
	return {
		repo: e.repo,
		branch: e.branch,
		worktreePath: e.worktreePath,
		...typeof e.baseCommit === "string" ? { baseCommit: e.baseCommit.slice(0, 100) } : {},
		...typeof e.headCommit === "string" ? { headCommit: e.headCommit.slice(0, 100) } : {},
		...commits !== void 0 && commits.length > 0 ? { commits } : {},
		...typeof e.commitsTotal === "number" && Number.isFinite(e.commitsTotal) ? { commitsTotal: e.commitsTotal } : {},
		...dirtyFiles !== void 0 && dirtyFiles.length > 0 ? { dirtyFiles } : {},
		...typeof e.dirtyFilesTotal === "number" && Number.isFinite(e.dirtyFilesTotal) ? { dirtyFilesTotal: e.dirtyFilesTotal } : {},
		...typeof e.diffStat === "string" ? { diffStat: e.diffStat.slice(0, 500) } : {},
		...typeof e.changedFiles === "number" && Number.isFinite(e.changedFiles) ? { changedFiles: e.changedFiles } : {}
	};
}
/**
* Validate ONE imported task record (pure): rebuilds it field by field with
* the normal validators, minting missing ids and re-arming cron. Executions
* left `running` by the exporting machine are marked failed — their
* settlement watchers died there and can never settle here.
* @param raw - the untyped record.
* @param now - current epoch ms (defaults for timestamps).
* @returns the rebuilt record, or a rejection reason.
*/
function validateImportedTask(raw, now) {
	if (typeof raw !== "object" || raw === null) return {
		ok: false,
		reason: "not an object"
	};
	const e = raw;
	const id = typeof e.id === "string" ? e.id.trim() : "";
	const fail = (reason) => ({
		ok: false,
		reason
	});
	if (!isValidTaskId(id)) return fail("missing/invalid id (must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$)");
	try {
		const rawExecution = typeof e.execution === "object" && e.execution !== null ? e.execution : {};
		const execution = normalizeExecution(rawExecution, now, { allowPastRunAt: true });
		const queuedWindow = typeof rawExecution.queuedRunAt === "number" && Number.isFinite(rawExecution.queuedRunAt) ? rawExecution.queuedRunAt : typeof rawExecution.dispatchingRunAt === "number" && Number.isFinite(rawExecution.dispatchingRunAt) ? rawExecution.dispatchingRunAt : void 0;
		if (execution.mode === "scheduled" && queuedWindow !== void 0 && typeof rawExecution.queuedAt === "number" && Number.isFinite(rawExecution.queuedAt)) {
			execution.queuedRunAt = queuedWindow;
			execution.queuedAt = rawExecution.queuedAt;
		}
		const comments = [];
		if (Array.isArray(e.comments)) for (const c of e.comments) {
			if (typeof c !== "object" || c === null) return fail("invalid comment entry");
			const ce = c;
			const body = typeof ce.body === "string" ? ce.body : "";
			if (body.trim().length === 0 || body.length > 4e3) return fail("invalid comment body");
			comments.push({
				id: typeof ce.id === "string" && ce.id.length > 0 ? ce.id : newCommentId(),
				body,
				version: numOr(ce, "version", 1),
				createdAt: numOr(ce, "createdAt", now),
				...typeof ce.threadId === "string" ? { threadId: ce.threadId } : {},
				...typeof ce.systemKey === "string" && /^sys\.[A-Za-z0-9]+$/.test(ce.systemKey) && ce.systemKey.length <= 100 ? {
					systemKey: ce.systemKey,
					...typeof ce.systemParams === "object" && ce.systemParams !== null && !Array.isArray(ce.systemParams) ? { systemParams: Object.fromEntries(Object.entries(ce.systemParams).filter(([key, value]) => key.length <= 100 && typeof value === "string" && value.length <= 4e3).slice(0, 20)) } : {},
					...Array.isArray(ce.systemRows) ? { systemRows: ce.systemRows.filter((row) => typeof row === "object" && row !== null && typeof row.repo === "string" && (row.repo === "" || isValidRelRepoPath(row.repo)) && [
						"merged",
						"noop",
						"failed"
					].includes(row.outcome) && (row.error === void 0 || typeof row.error === "string")).slice(0, 8).map((row) => ({
						repo: row.repo,
						outcome: row.outcome,
						...row.error !== void 0 ? { error: row.error.slice(0, 4e3) } : {}
					})) } : {}
				} : {}
			});
		}
		else return fail("comments must be an array");
		const executions = [];
		if (Array.isArray(e.executions)) for (const x of e.executions) {
			if (typeof x !== "object" || x === null) return fail("invalid execution entry");
			const xe = x;
			const trigger = xe.trigger === "scheduled" ? "scheduled" : "manual";
			const outcomeRaw = xe.outcome;
			if (outcomeRaw !== "running" && outcomeRaw !== "succeeded" && outcomeRaw !== "failed" && outcomeRaw !== "cancelled") return fail("invalid execution outcome");
			const outcome = outcomeRaw === "running" ? "failed" : outcomeRaw;
			executions.push({
				id: typeof xe.id === "string" && xe.id.length > 0 ? xe.id : newExecutionId(),
				...typeof xe.sessionId === "string" ? { sessionId: xe.sessionId } : {},
				trigger,
				...typeof xe.startedAt === "number" ? { startedAt: xe.startedAt } : {},
				...typeof xe.lastActivityAt === "number" ? { lastActivityAt: xe.lastActivityAt } : {},
				...typeof xe.endedAt === "number" ? { endedAt: xe.endedAt } : {},
				outcome,
				...outcomeRaw === "running" ? { error: "imported while still running (settlement watcher died with the exporting host)" } : typeof xe.error === "string" ? { error: xe.error } : {},
				...typeof xe.isolation === "string" && (xe.isolation === "worktree" || xe.isolation === "none") ? { isolation: xe.isolation } : {},
				...typeof xe.isolationNote === "string" ? { isolationNote: xe.isolationNote } : {},
				...typeof xe.branch === "string" ? { branch: xe.branch } : {},
				...typeof xe.worktreePath === "string" ? { worktreePath: xe.worktreePath } : {},
				...typeof xe.baseCommit === "string" ? { baseCommit: xe.baseCommit } : {},
				...typeof xe.headCommit === "string" ? { headCommit: xe.headCommit } : {},
				...Array.isArray(xe.commits) ? { commits: xe.commits.filter((c) => typeof c === "object" && c !== null && typeof c.hash === "string" && typeof c.subject === "string") } : {},
				...typeof xe.commitsTotal === "number" ? { commitsTotal: xe.commitsTotal } : {},
				...Array.isArray(xe.dirtyFiles) ? { dirtyFiles: xe.dirtyFiles.filter((l) => typeof l === "string") } : {},
				...typeof xe.dirtyFilesTotal === "number" ? { dirtyFilesTotal: xe.dirtyFilesTotal } : {},
				...typeof xe.diffStat === "string" ? { diffStat: xe.diffStat } : {},
				...typeof xe.changedFiles === "number" ? { changedFiles: xe.changedFiles } : {},
				...Array.isArray(xe.repos) ? { repos: xe.repos.slice(0, 8).map(normalizeRepoEvidence).filter((r) => r !== void 0) } : {},
				...typeof xe.report === "object" && xe.report !== null ? { report: normalizeExecutionReport(xe.report) } : {}
			});
		}
		else return fail("executions must be an array");
		const status = asStatus(strOr(e, "status", "todo"));
		const actorOf = (v) => typeof v === "object" && v !== null && v.kind === "agent" && typeof v.sessionId === "string" ? {
			kind: "agent",
			sessionId: v.sessionId
		} : { kind: "user" };
		const branchesMap = normalizeBranchesMap(e.branches);
		const task = {
			id,
			title: normalizeTitle(strOr(e, "title", "")),
			description: strOr(e, "description", "").trim(),
			prompt: normalizePrompt(strOr(e, "prompt", "")),
			workspaceId: strOr(e, "workspaceId", ""),
			urgency: asUrgency(strOr(e, "urgency", "normal")),
			status,
			blocked: e.blocked === true,
			execution,
			...typeof e.model === "object" && e.model !== null ? { model: normalizeModel(e.model) } : {},
			...typeof e.isolation === "string" && (e.isolation === "worktree" || e.isolation === "none") ? { isolation: e.isolation } : {},
			...typeof e.presetId === "string" && e.presetId.trim().length > 0 ? { presetId: e.presetId.trim() } : {},
			...typeof e.permission === "string" ? { permission: asPermission(e.permission) } : {},
			...Array.isArray(e.checklist) ? { checklist: normalizeChecklist(e.checklist) } : {},
			...typeof e.branch === "string" ? { branch: e.branch } : {},
			...branchesMap !== void 0 ? { branches: branchesMap } : {},
			...status === "in_progress" && typeof e.claimedBy === "string" ? { claimedBy: e.claimedBy } : {},
			...status === "in_progress" && typeof e.claimedAt === "number" ? { claimedAt: e.claimedAt } : {},
			version: Math.max(1, Math.trunc(numOr(e, "version", 1))),
			createdAt: numOr(e, "createdAt", now),
			updatedAt: numOr(e, "updatedAt", now),
			createdBy: actorOf(e.createdBy),
			updatedBy: actorOf(e.updatedBy),
			comments,
			executions,
			...typeof e.executionsPruned === "number" ? { executionsPruned: e.executionsPruned } : {},
			...typeof e.trashedAt === "number" ? { trashedAt: e.trashedAt } : {}
		};
		if (task.workspaceId.length === 0) return fail("missing workspaceId");
		return {
			ok: true,
			task
		};
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
}
/**
* Minimal structural check for ONE ledger record at load time (S11): unlike
* {@link validateImportedTask} this REBUILDS NOTHING (cron state, ids and
* timestamps must survive a load untouched) — it only rejects entries whose
* shape would break downstream consumers, including the R4 id charset.
* @param raw - the untyped record.
*/
function isPlausibleTaskRecord(raw) {
	if (typeof raw !== "object" || raw === null) return false;
	const t = raw;
	return typeof t.id === "string" && isValidTaskId(t.id) && typeof t.title === "string" && t.title.length > 0 && typeof t.workspaceId === "string" && t.workspaceId.length > 0 && ALL_STATUSES.includes(t.status) && typeof t.version === "number" && Number.isFinite(t.version) && t.version >= 1 && Array.isArray(t.comments) && Array.isArray(t.executions) && typeof t.execution === "object" && t.execution !== null && t.execution.mode !== void 0;
}
/**
* Validate a whole imported ledger and classify its tasks against the live
* one (pure). Duplicate ids INSIDE the file are invalid (first wins, later
* copies reported); schemaVersion must match {@link LEDGER_SCHEMA_VERSION}.
* @param raw - the parsed import file.
* @param knownIds - live ledger task ids.
* @param now - current epoch ms.
* @throws when the file is not a ledger or the schemaVersion is unsupported.
*/
function validateLedgerImport(raw, knownIds, now) {
	if (typeof raw !== "object" || raw === null) throw new Error("导入文件不是 JSON 对象");
	const e = raw;
	if (e.schemaVersion !== 1) throw new Error(`不支持的 schemaVersion ${String(e.schemaVersion)}（当前支持 1）`);
	if (!Array.isArray(e.tasks)) throw new Error("导入文件的 tasks 不是数组");
	const plan = {
		create: [],
		overwrite: [],
		invalid: [],
		...e.settings !== void 0 ? { settings: asBoardSettings(e.settings) } : {}
	};
	const seen = /* @__PURE__ */ new Set();
	for (const entry of e.tasks) {
		const id = typeof entry?.id === "string" ? entry.id : void 0;
		const result = validateImportedTask(entry, now);
		if (!result.ok) {
			plan.invalid.push({
				...id !== void 0 ? { id } : {},
				reason: result.reason
			});
			continue;
		}
		if (seen.has(result.task.id)) {
			plan.invalid.push({
				id: result.task.id,
				reason: "文件内重复 id"
			});
			continue;
		}
		seen.add(result.task.id);
		if (knownIds.has(result.task.id)) plan.overwrite.push(result.task);
		else plan.create.push(result.task);
	}
	return plan;
}
/**
* Build the compact summary of a task.
* @param task - the task.
*/
function summarize(task) {
	const last = task.executions.length > 0 ? task.executions[task.executions.length - 1] : void 0;
	const checklist = task.checklist !== void 0 && task.checklist.length > 0 ? checklistProgress(task) : void 0;
	return {
		id: task.id,
		title: task.title,
		workspaceId: task.workspaceId,
		urgency: task.urgency,
		status: task.status,
		blocked: task.blocked,
		executionMode: task.execution.mode,
		nextRunAt: task.execution.nextRunAt,
		model: task.model,
		permission: task.permission,
		version: task.version,
		claimOwner: isClaimedBy(task),
		commentCount: task.comments.length,
		lastExecutionOutcome: last?.outcome,
		...checklist !== void 0 ? { checklist } : {},
		trashed: task.trashedAt !== void 0
	};
}
//#endregion
export { ALL_STATUSES, DEFAULT_DISPATCH_INTERVAL_MS, DEFAULT_ISOLATION, DEFAULT_PERIODIC_COMPLETION, DEFAULT_PERMISSION, MAIN_STATUSES, MAX_DISPATCH_INTERVAL_MS, MAX_QUEUE_MAX_AGE_MINUTES, MAX_SCHEDULE_MISSED_AFTER_MINUTES, SECONDARY_STATUSES, URGENCIES, asBoardSettings, asIsolation, asPermission, asStatus, asUrgency, canTransition, checklistFromTexts, checklistProgress, defaultIsolationOf, defaultPermissionOf, defaultSyncExternalSessionsOf, dispatchIntervalMsOf, effectiveIsolation, effectivePrompt, emptyLedger, isClaim, isClaimedBy, isPlausibleTaskRecord, isValidRelRepoPath, isValidTaskId, maxConcurrentOf, newChecklistItemId, newCommentId, newExecutionId, newTaskId, nextCronTime, normalizeBody, normalizeBranchesMap, normalizeChecklist, normalizeChecklistText, normalizeExecution, normalizeExecutionReport, normalizeModel, normalizePrompt, normalizeRepoEvidence, normalizeTitle, parseCron, pruneExecutions, queueMaxAgeMinutesOf, scheduleMissedAfterMinutesOf, spawnNextCycle, summarize, syncClaim, taskAssociatedSessionIds, validateImportedTask, validateLedgerImport };

//# sourceMappingURL=protocol.js.map