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
	done: ["archived"],
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
* Validate an execution config request from raw tool/route input.
* `scheduled` requires a valid cron; computes the first `nextRunAt` from
* `now`.
* @param raw - raw execution input ({@link ExecutionConfig} fields, untyped).
* @param now - current epoch ms.
* @returns the normalized config.
*/
function normalizeExecution(raw, now) {
	const mode = raw.mode ?? "claim";
	if (mode !== "claim" && mode !== "scheduled") throw new Error("execution.mode must be 'claim' or 'scheduled'");
	if (mode === "claim") return { mode };
	const cron = (raw.cron ?? "").trim();
	const match = parseCron(cron);
	if (match === null) throw new Error("execution.cron is not a valid 5-field cron expression");
	const next = nextCronTime(match, now);
	if (next === null) throw new Error("execution.cron never matches within 4 years");
	return {
		mode,
		cron,
		nextRunAt: next
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
		const execution = normalizeExecution(typeof e.execution === "object" && e.execution !== null ? e.execution : {}, now);
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
				...typeof ce.threadId === "string" ? { threadId: ce.threadId } : {}
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
				...typeof xe.report === "object" && xe.report !== null ? { report: normalizeExecutionReport(xe.report) } : {}
			});
		}
		else return fail("executions must be an array");
		const status = asStatus(strOr(e, "status", "todo"));
		const actorOf = (v) => typeof v === "object" && v !== null && v.kind === "agent" && typeof v.sessionId === "string" ? {
			kind: "agent",
			sessionId: v.sessionId
		} : { kind: "user" };
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
export { ALL_STATUSES, DEFAULT_ISOLATION, DEFAULT_PERMISSION, MAIN_STATUSES, SECONDARY_STATUSES, URGENCIES, asBoardSettings, asIsolation, asPermission, asStatus, asUrgency, canTransition, checklistFromTexts, checklistProgress, defaultIsolationOf, defaultPermissionOf, defaultSyncExternalSessionsOf, effectiveIsolation, effectivePrompt, emptyLedger, isClaim, isClaimedBy, isPlausibleTaskRecord, isValidTaskId, newChecklistItemId, newCommentId, newExecutionId, newTaskId, nextCronTime, normalizeBody, normalizeChecklist, normalizeChecklistText, normalizeExecution, normalizeExecutionReport, normalizeModel, normalizePrompt, normalizeTitle, parseCron, pruneExecutions, summarize, syncClaim, validateImportedTask, validateLedgerImport };

//# sourceMappingURL=protocol.js.map