window.__ModuleLoader__.load({
  id: "dsh-taskboard",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/api.ts
async function unwrap(pending, path, signal) {
  const hasTimeoutName = (value) => typeof value === "object" && value !== null && "name" in value && value.name === "TimeoutError";
  const timedOut = (error) => hasTimeoutName(error) || signal?.aborted === true && hasTimeoutName(signal.reason);
  let res;
  try {
    res = await pending;
  } catch (error) {
    throw new Error(`taskboard: ${path}: ${timedOut(error) ? "request timed out" : "network request failed"}`, { cause: error });
  }
  let raw;
  try {
    raw = await res.text();
  } catch (error) {
    throw new Error(`taskboard: ${path}: ${timedOut(error) ? "response body timed out" : "response body read failed"} (HTTP ${res.status})`, { cause: error });
  }
  if (raw.trim().length === 0) throw new Error(`taskboard: ${path}: empty response body (HTTP ${res.status})`);
  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    const contentType = res.headers.get("content-type") ?? "";
    const kind = contentType.toLowerCase().includes("json") ? "invalid JSON response" : "non-JSON response";
    throw new Error(`taskboard: ${path}: ${kind} (HTTP ${res.status})`, { cause: error });
  }
  if (typeof body !== "object" || body === null || !("ok" in body) || typeof body.ok !== "boolean") {
    throw new Error(`taskboard: ${path}: invalid API response (HTTP ${res.status})`);
  }
  if (!body.ok) {
    const failure = body;
    if (!("error" in failure) || typeof failure.error?.code !== "string" || typeof failure.error.message !== "string") {
      throw new Error(`taskboard: ${path}: invalid API error response (HTTP ${res.status})`);
    }
    throw new Error(`taskboard: ${failure.error.code}: ${failure.error.message}`);
  }
  if (!("value" in body)) throw new Error(`taskboard: ${path}: invalid API response (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`taskboard: ${path}: HTTP ${res.status} with success body`);
  return body.value;
}
var TIMEOUT_MS = 1e4;
async function get(path) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  return unwrap(fetch(path, { signal }), path, signal);
}
async function post(path, body) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  return unwrap(fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal
  }), path, signal);
}
async function uploadImage(file) {
  const path = "/dsh-taskboard/assets";
  const signal = AbortSignal.timeout(3e4);
  return unwrap(fetch(path, {
    method: "POST",
    headers: { "content-type": file.type, "x-dsh-taskboard-upload": "1" },
    body: file,
    signal
  }), path, signal);
}
function createClient() {
  return {
    state: (options) => {
      const query = options?.excludeDone === true ? "?excludeDone=true" : "";
      return get(`/dsh-taskboard/state${query}`);
    },
    workspaces: () => get("/dsh-taskboard/workspaces"),
    projectSessions: (workspaceId) => get(`/dsh-taskboard/project-sessions?workspaceId=${encodeURIComponent(workspaceId)}`),
    create: (body) => post("/dsh-taskboard/tasks", body),
    get: (id) => get(`/dsh-taskboard/tasks/${encodeURIComponent(id)}`),
    update: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/update`, body),
    move: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/move`, body),
    archiveSessions: (id) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/archive-sessions`, {}),
    reject: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/reject`, body),
    comment: (id, bodyText) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/comment`, { body: bodyText }),
    uploadImage,
    remove: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/delete`, body),
    run: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/run`, body ?? {}),
    cancel: (id) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/cancel`, {}),
    mergeBranch: (id) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/merge`, {}),
    worktreeRemove: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/worktree-remove`, body),
    diagnostics: () => get("/dsh-taskboard/diagnostics"),
    clearQueue: () => post("/dsh-taskboard/queue/clear", {}),
    worktreeCleanup: (workspaceId, taskId) => post("/dsh-taskboard/worktree-cleanup", { workspaceId, taskId }),
    diff: (taskId, query) => {
      const params = new URLSearchParams({ execution: query.execution });
      if (query.commit !== void 0) params.set("commit", query.commit);
      if (query.path !== void 0) params.set("path", query.path);
      if (query.repo !== void 0) params.set("repo", query.repo);
      return get(`/dsh-taskboard/tasks/${encodeURIComponent(taskId)}/diff?${params.toString()}`);
    },
    importPreview: (file) => post("/dsh-taskboard/import/preview", file),
    importCommit: (mode, ledger) => post("/dsh-taskboard/import", { mode, ledger }),
    templates: () => get("/dsh-taskboard/templates"),
    templateUpsert: (body) => post("/dsh-taskboard/templates", body),
    templateDelete: (id) => post("/dsh-taskboard/templates/delete", { id }),
    settings: () => get("/dsh-taskboard/settings"),
    updateSettings: (body) => post("/dsh-taskboard/settings/update", body),
    storage: () => get("/dsh-taskboard/storage"),
    checkStorage: (directory) => post("/dsh-taskboard/storage/check", { directory }),
    migrateStorage: (directory) => {
      const path = "/dsh-taskboard/storage/migrate";
      const signal = AbortSignal.timeout(12e4);
      return unwrap(fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
        signal
      }), path, signal);
    },
    promptCompletions: () => get("/dsh-taskboard/prompt-completions"),
    modelCatalog: () => get("/dsh-taskboard/model-catalog"),
    stream(onChange, onGap) {
      const es = new EventSource("/dsh-taskboard/events");
      let revision;
      const hello = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (revision !== void 0 && payload.revision !== revision) onGap();
        revision = payload.revision;
      };
      const change = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (revision !== void 0 && payload.revision !== revision + 1) onGap();
        revision = payload.revision;
        onChange(payload);
      };
      es.addEventListener("hello", hello);
      es.addEventListener("change", change);
      es.onerror = () => {
      };
      return () => {
        es.close();
      };
    }
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/shared/external.ts
function normalizeExternalSource(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const e = raw;
  if (typeof e.connectionId !== "string" || !e.connectionId || typeof e.provider !== "string" || typeof e.syncedAt !== "number" || !Number.isFinite(e.syncedAt) || !e.item || typeof e.item !== "object") return void 0;
  const i = e.item;
  for (const field of ["projectId", "type", "id", "url", "status", "priority", "assignedTo", "title", "description"]) {
    if (typeof i[field] !== "string") return void 0;
  }
  try {
    if (!["http:", "https:"].includes(new URL(i.url).protocol)) return void 0;
  } catch {
    return void 0;
  }
  if (!["urgent", "normal", "relaxed"].includes(String(i.urgency)) || typeof i.closed !== "boolean") return void 0;
  const item = {
    projectId: i.projectId,
    type: i.type,
    id: i.id,
    url: i.url,
    status: i.status,
    priority: i.priority,
    assignedTo: i.assignedTo,
    title: i.title,
    description: i.description,
    urgency: i.urgency,
    closed: i.closed,
    ...Array.isArray(i.assignees) ? { assignees: i.assignees.filter((v) => typeof v === "string") } : {}
  };
  return {
    connectionId: e.connectionId,
    provider: e.provider,
    ...typeof e.providerName === "string" ? { providerName: e.providerName } : {},
    syncedAt: e.syncedAt,
    item,
    conflicts: Array.isArray(e.conflicts) ? e.conflicts.filter((v) => ["title", "description", "urgency"].includes(v)) : []
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/shared/protocol.ts
var MAIN_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done"
];
var SECONDARY_STATUSES = ["canceled", "archived"];
var ALL_STATUSES = [...MAIN_STATUSES, ...SECONDARY_STATUSES];
var TRANSITIONS = {
  backlog: ["todo", "canceled"],
  todo: ["in_progress", "backlog", "canceled"],
  in_progress: ["in_review", "todo", "canceled"],
  in_review: ["in_progress", "todo", "done", "canceled"],
  done: ["archived", "todo"],
  canceled: ["archived", "todo"],
  archived: []
};
function canTransition(from, to) {
  return TRANSITIONS[from].includes(to);
}
var DEFAULT_ISOLATION = "none";
var DEFAULT_MAX_CONCURRENT = 3;
var DEFAULT_SCHEDULE_MISSED_AFTER_MINUTES = 5;
var DEFAULT_QUEUE_MAX_AGE_MINUTES = 0;
var DEFAULT_DISPATCH_INTERVAL_MS = 1e3;
var DEFAULT_COMPLETED_DISPLAY_LIMIT = 50;
var MIN_COMPLETED_DISPLAY_LIMIT = 10;
var MAX_COMPLETED_DISPLAY_LIMIT = 500;
var DEFAULT_PERMISSION = "workspace-write";
function asPermission(raw) {
  if (typeof raw !== "string") return DEFAULT_PERMISSION;
  const normalized = raw.trim();
  if (normalized === "workspace-write" || normalized === "workspaceWrite") return "workspace-write";
  if (normalized === "read-only" || normalized === "readOnly") return "read-only";
  if (normalized === "danger-full-access" || normalized === "fullAccess") return "danger-full-access";
  throw new Error("permission must be 'workspace-write', 'read-only', or 'danger-full-access'");
}
function defaultIsolationOf(settings) {
  return settings?.defaultIsolation ?? DEFAULT_ISOLATION;
}
function defaultSyncExternalSessionsOf(settings) {
  return settings?.syncExternalSessions ?? false;
}
function defaultPermissionOf(settings) {
  return settings?.defaultPermission ?? DEFAULT_PERMISSION;
}
function maxConcurrentOf(settings, fallback = DEFAULT_MAX_CONCURRENT) {
  return settings?.maxConcurrent ?? fallback;
}
function scheduleMissedAfterMinutesOf(settings) {
  return settings?.scheduleMissedAfterMinutes ?? DEFAULT_SCHEDULE_MISSED_AFTER_MINUTES;
}
function queueMaxAgeMinutesOf(settings) {
  return settings?.queueMaxAgeMinutes ?? DEFAULT_QUEUE_MAX_AGE_MINUTES;
}
function dispatchIntervalMsOf(settings) {
  return settings?.dispatchIntervalMs ?? DEFAULT_DISPATCH_INTERVAL_MS;
}
function completedDisplayLimitOf(settings) {
  return settings?.completedDisplayLimit ?? DEFAULT_COMPLETED_DISPLAY_LIMIT;
}
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
  return { minutes: sets[0], hours: sets[1], days: sets[2], months: sets[3], weekdays };
}
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
function nextCronTime(match, from) {
  const start = new Date(from);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);
  const cap = from + 4 * 366 * 24 * 60 * 60 * 1e3;
  let t = start.getTime();
  while (t <= cap) {
    const d = new Date(t);
    if (match.months.has(d.getMonth() + 1) && match.days.has(d.getDate()) && match.weekdays.has(d.getDay()) && match.hours.has(d.getHours()) && match.minutes.has(d.getMinutes())) {
      return t;
    }
    t += 6e4;
  }
  return null;
}
var LEDGER_SCHEMA_VERSION = 1;
function emptyLedger() {
  return { schemaVersion: LEDGER_SCHEMA_VERSION, revision: 0, tasks: [] };
}
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
    for (const ex of task.executions) {
      if (ex !== null && typeof ex === "object") {
        push(ex.sessionId);
      }
    }
  }
  return result;
}
function taskSessionId(task) {
  const running = task.executions?.find((ex) => ex.outcome === "running");
  if (running?.sessionId !== void 0 && running.sessionId.length > 0) return running.sessionId;
  const sessionExecution = task.executions === void 0 ? void 0 : [...task.executions].reverse().find((ex) => ex.sessionId !== void 0 && ex.sessionId.length > 0);
  if (sessionExecution?.sessionId !== void 0) return sessionExecution.sessionId;
  if (task.claimedBy !== void 0 && task.claimedBy.startsWith("session-")) return task.claimedBy;
  if (task.execution?.autoReuseSessionId !== void 0) return task.execution.autoReuseSessionId;
  if (task.execution?.reuseSessionId !== void 0) return task.execution.reuseSessionId;
  if (task.createdBy?.kind === "agent" && task.createdBy.sessionId !== void 0) return task.createdBy.sessionId;
  if (task.updatedBy?.kind === "agent" && task.updatedBy.sessionId !== void 0) return task.updatedBy.sessionId;
  return void 0;
}
var MAX_CHECKLIST_ITEMS = 30;
function checklistProgress(task) {
  const items = task.checklist ?? [];
  return { done: items.filter((i) => i.checked).length, total: items.length };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/i18n/runtime.ts
var import_react = require("react");

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/i18n/zh.ts
var zh = {
  "ext.requestInterval": "\u6700\u5C0F\u8BF7\u6C42\u95F4\u9694\uFF08\u6BEB\u79D2\uFF0C0 \u5173\u95ED\uFF0C\u6700\u5927 10000\uFF09",
  "ext.removeMapping": "\u5220\u9664\u7B2C {n} \u4E2A\u9879\u76EE\u6620\u5C04",
  "ext.lastAttempt": "\u6700\u8FD1\u5C1D\u8BD5\u540C\u6B65",
  "set.nav.label": "\u8BBE\u7F6E\u5206\u7C7B",
  "set.nav.general": "\u901A\u7528\u8BBE\u7F6E",
  "set.nav.external": "\u5916\u90E8\u540C\u6B65",
  "ext.usernamePassword": "\u7528\u6237\u540D\u548C\u5BC6\u7801",
  "ext.username": "\u7985\u9053\u767B\u5F55\u7528\u6237\u540D",
  "ext.reuseLogin": "\u540C\u6B65\u6B64\u767B\u5F55\u8D26\u53F7\u7684\u4EFB\u52A1",
  "ext.assigneeAccount": "\u4EFB\u52A1\u5904\u7406\u4EBA\u8D26\u53F7\uFF08\u7985\u9053 account\uFF09",
  "ext.password": "\u7985\u9053\u767B\u5F55\u5BC6\u7801",
  "ext.heading": "\u5916\u90E8\u4EFB\u52A1\u540C\u6B65",
  "ext.hint": "\u9009\u62E9\u6765\u6E90\u3001\u8BA4\u8BC1\u65B9\u5F0F\u548C\u5DE5\u4F5C\u9879\u7C7B\u578B\uFF0C\u6309\u6240\u9009\u76EE\u6807\u5355\u5411\u5BFC\u5165\u5230\u5F85\u89C4\u5212\u6216\u5F85\u529E\uFF0C\u4E0D\u81EA\u52A8\u6267\u884C\u3002\u6D4B\u8BD5\u8FDE\u63A5\u4F7F\u7528\u9762\u677F\u5F53\u524D\u914D\u7F6E\uFF0C\u4EFB\u52A1\u540C\u6B65\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E\u3002",
  "ext.url": "API \u670D\u52A1\u5730\u5740\uFF08\u7985\u9053\u4E0D\u542B /api.php/v1\uFF09",
  "ext.provider": "\u4EFB\u52A1\u6765\u6E90",
  "ext.authMode": "\u8BA4\u8BC1\u65B9\u5F0F",
  "ext.itemTypes": "\u5DE5\u4F5C\u9879\u7C7B\u578B",
  "ext.type.bug": "\u7F3A\u9677",
  "ext.type.story": "\u9700\u6C42",
  "ext.type.task": "\u4EFB\u52A1",
  "ext.projectId": "\u5916\u90E8\u9879\u76EE ID",
  "ext.apiUser": "API \u7528\u6237\u540D\uFF08\u4E0D\u662F\u5904\u7406\u4EBA\u8D26\u53F7\uFF09",
  "ext.apiPassword": "API \u5BC6\u7801",
  "ext.companyId": "\u516C\u53F8 ID\uFF08TAPD \u53D1\u73B0\u9879\u76EE\u65F6\u5FC5\u586B\uFF09",
  "ext.terminalStatuses": "\u7ED3\u675F\u72B6\u6001\uFF08\u539F\u59CB\u72B6\u6001\u503C\uFF0C\u4EE5\u9017\u53F7\u5206\u9694\uFF09",
  "ext.urgentPriorities": "\u7D27\u6025\u4F18\u5148\u7EA7\u540D\u79F0\uFF08\u4EE5\u9017\u53F7\u5206\u9694\uFF09",
  "ext.relaxedPriorities": "\u4F4E\u4F18\u5148\u7EA7\u540D\u79F0\uFF08\u4EE5\u9017\u53F7\u5206\u9694\uFF09",
  "ext.manualAccount": "\u8BF7\u660E\u786E\u586B\u5199\u5904\u7406\u4EBA\u8D26\u53F7\uFF1B\u7985\u9053\u4F7F\u7528 account\uFF0CTAPD \u4F7F\u7528\u6210\u5458\u6635\u79F0\u3002API \u51ED\u636E\u4E0D\u4EE3\u8868\u8BE5\u5904\u7406\u4EBA\u3002",
  "ext.discoverProjects": "\u540C\u6B65\u9879\u76EE/\u4EA7\u54C1\u6E05\u5355",
  "ext.projectsFound": "\u5DF2\u53D1\u73B0 {count} \u4E2A\u9879\u76EE\uFF0C\u53EF\u5728\u9879\u76EE ID \u8F93\u5165\u6846\u4E2D\u9009\u62E9",
  "ext.discoverAccount": "\u8BC6\u522B\u5F53\u524D\u8D26\u53F7",
  "ext.account": "\u540C\u6B65\u8D26\u53F7\uFF08\u7CBE\u786E\u5339\u914D\u6307\u6D3E\u8D26\u53F7\uFF09",
  "ext.token": "API Token",
  "ext.tokenSaved": "\u5DF2\u4FDD\u5B58\uFF0C\u7559\u7A7A\u4FDD\u7559",
  "ext.since": "\u6700\u65E9\u521B\u5EFA\u65E5\u671F\uFF08\u7559\u7A7A\u4E0D\u9650\uFF09",
  "ext.interval": "\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF0C0 \u5173\u95ED\uFF0C\u6700\u5C11 5\uFF09",
  "ext.importStatus": "\u5BFC\u5165\u5230",
  "ext.scopeType": "\u6620\u5C04\u8303\u56F4",
  "ext.mappingMode": "\u9879\u76EE\u6620\u5C04\u65B9\u5F0F",
  "ext.syncUnmappedProjects": "\u540C\u6B65\u672A\u5173\u8054\u9879\u76EE\uFF08\u672A\u5173\u8054\u9879\u53CA\u65B0\u589E\u9879\u4E5F\u53C2\u4E0E\u540C\u6B65\uFF0C\u65B0\u5EFA\u5361\u7247\u7684\u5DE5\u4F5C\u9879\u76EE\u4E3A\u7A7A\uFF09\u3002",
  "ext.syncUnmappedExecutions": "\u540C\u6B65\u672A\u5173\u8054\u6267\u884C/\u8FED\u4EE3\uFF08\u672A\u5173\u8054\u9879\u53CA\u65B0\u589E\u9879\u4E5F\u53C2\u4E0E\u540C\u6B65\uFF0C\u65B0\u5EFA\u5361\u7247\u7684\u5DE5\u4F5C\u9879\u76EE\u4E3A\u7A7A\uFF09\u3002",
  "ext.syncUnmappedHint": "\u672A\u5173\u8054\u9879\u53CA\u65B0\u589E\u9879\u4E5F\u53C2\u4E0E\u540C\u6B65\uFF0C\u65B0\u5EFA\u5361\u7247\u7684\u5DE5\u4F5C\u9879\u76EE\u4E3A\u7A7A\u3002",
  "ext.unmappedMappingsFound": "\u5DF2\u540C\u6B65 {count} \u9879\uFF1B\u672A\u5173\u8054\u672C\u5730\u9879\u76EE\u7684\u9879\u4E5F\u5C06\u5BFC\u5165\u5361\u7247\u3002",
  "ext.linkProject": "\u9879\u76EE",
  "ext.linkExecution": "\u6267\u884C/\u8FED\u4EE3",
  "ext.syncScope": "\u540C\u6B65\u8303\u56F4",
  "ext.discoverMappings": "\u540C\u6B65\u9879\u76EE/\u6267\u884C\u8FED\u4EE3\u6E05\u5355",
  "ext.loadMappings": "\u8BF7\u5148\u540C\u6B65\u6E05\u5355\uFF0C\u518D\u9009\u62E9\u5404\u9879\u5173\u8054\u7684\u672C\u5730\u9879\u76EE\u3002",
  "ext.mappingsFound": "\u5DF2\u540C\u6B65 {count} \u9879\uFF0C\u8BF7\u9010\u884C\u9009\u62E9\u5173\u8054\u7684\u672C\u5730\u9879\u76EE\uFF1B\u4E0D\u5173\u8054\u7684\u9879\u4E0D\u53C2\u4E0E\u540C\u6B65\u3002",
  "ext.unlinked": "\u4E0D\u5173\u8054",
  "ext.scopeUnavailable": "\u5F53\u524D\u8D26\u53F7\u65E0\u6CD5\u8BFB\u53D6\u6B64\u9879\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65\u6E05\u5355\u6216\u53D6\u6D88\u5173\u8054\u3002",
  "ext.remapRequired": "\u8BF7\u91CD\u65B0\u5173\u8054\u9879\u76EE\u6216\u6267\u884C/\u8FED\u4EE3\uFF1B\u65E7\u4EFB\u52A1\u4FDD\u7559\uFF0C\u539F\u914D\u7F6E\u81EA\u52A8\u540C\u6B65\u5DF2\u6682\u505C\u3002",
  "ext.chooseScope": "\u8BF7\u9009\u62E9\u540D\u79F0\u4E0E ID",
  "ext.syncListFirst": "\u8BF7\u5148\u540C\u6B65\u6E05\u5355\u6216\u624B\u52A8\u586B\u5199",
  "ext.noScopes": "\u672A\u627E\u5230\u53EF\u7528\u9879\uFF0C\u53EF\u624B\u52A8\u586B\u5199 ID",
  "ext.enterScopeId": "\u624B\u52A8\u586B\u5199 ID",
  "ext.productScope": "\u4EA7\u54C1\uFF08Bug / \u9700\u6C42\uFF09",
  "ext.executionScope": "\u6267\u884C\uFF08\u5F00\u53D1\u4EFB\u52A1\uFF09",
  "ext.executionId": "\u6267\u884C ID",
  "ext.scopeHint": "Bug \u548C\u9700\u6C42\u4F7F\u7528\u4EA7\u54C1\u6620\u5C04\uFF1B\u5F00\u53D1\u4EFB\u52A1\u4F7F\u7528\u6267\u884C\u6620\u5C04\u3002\u540C\u6B65\u6E05\u5355\u540E\u6309\u540D\u79F0\u548C ID \u9009\u62E9\uFF0C\u4E5F\u53EF\u624B\u52A8\u586B\u5199\uFF1B\u5B9E\u9645\u5BFC\u5165\u7C7B\u578B\u7531\u4E0A\u65B9\u5DE5\u4F5C\u9879\u7C7B\u578B\u51B3\u5B9A\u3002",
  "ext.importBacklog": "\u5F85\u89C4\u5212",
  "ext.importTodo": "\u5F85\u529E",
  "ext.product": "\u4EA7\u54C1 ID",
  "ext.workspace": "\u672C\u5730\u9879\u76EE",
  "ext.addMapping": "\u6DFB\u52A0\u6620\u5C04",
  "ext.save": "\u4FDD\u5B58\u914D\u7F6E",
  "ext.unsavedChanges": "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF0C\u8BF7\u5148\u70B9\u51FB\u300C\u4FDD\u5B58\u914D\u7F6E\u300D\uFF0C\u518D\u7ACB\u5373\u540C\u6B65\u3002\u6D4B\u8BD5\u8FDE\u63A5\u548C\u540C\u6B65\u6E05\u5355\u4ECD\u4F7F\u7528\u5F53\u524D\u9762\u677F\u914D\u7F6E\u3002",
  "ext.test": "\u6D4B\u8BD5\u8FDE\u63A5",
  "ext.sync": "\u7ACB\u5373\u540C\u6B65",
  "ext.clearIgnored": "\u6E05\u9664\u5168\u90E8\u5BFC\u5165\u5FFD\u7565\u8BB0\u5F55",
  "ext.busy": "\u6B63\u5728\u5904\u7406\u2026",
  "ext.cancel": "\u505C\u6B62\u540C\u6B65",
  "ext.success": "\u64CD\u4F5C\u6210\u529F",
  "ext.result": "\u65B0\u589E {created} \xB7 \u66F4\u65B0 {updated} \xB7 \u672A\u53D8 {unchanged} \xB7 \u51B2\u7A81 {conflicts} \xB7 \u5FFD\u7565 {ignored}",
  "ext.source": "\u5916\u90E8\u6765\u6E90",
  "ext.status": "\u5916\u90E8\u72B6\u6001",
  "ext.synced": "\u6765\u6E90\u66F4\u65B0\u540C\u6B65\u65F6\u95F4",
  "ext.conflict": "{field} \u6709\u5916\u90E8\u66F4\u65B0\uFF0C\u8BF7\u9009\u62E9\u4FDD\u7559\u5185\u5BB9\uFF08\u6267\u884C\u4E2D\u8BF7\u5148\u7B49\u5F85\u7ED3\u675F\uFF09",
  "ext.accept": "\u91C7\u7528\u5916\u90E8\u5185\u5BB9",
  "ext.keep": "\u4FDD\u7559\u672C\u5730\u5185\u5BB9",
  "ext.field.title": "\u6807\u9898",
  "ext.field.description": "\u63CF\u8FF0",
  "ext.field.urgency": "\u4F18\u5148\u7EA7",
  // ── shared vocabulary ──────────────────────────────────────────────
  "shared.close": "\u5173\u95ED",
  "shared.cancel": "\u53D6\u6D88",
  "shared.loading": "\u8BFB\u53D6\u4E2D\u2026",
  "shared.blocked": "\u53D7\u963B",
  "shared.permission": "\u6743\u9650",
  "shared.confirmDelete": "\u786E\u8BA4\u5220\u9664",
  "shared.current": "\uFF08\u5F53\u524D\uFF1A{name}\uFF09",
  "shared.entry.aria": "Agent \u4EFB\u52A1\u770B\u677F",
  "shared.entry.label": "\u4EFB\u52A1\u770B\u677F",
  "shared.stats.title": "\u5F85\u529E {todo} \uFF5C \u8FDB\u884C\u4E2D {doing} \uFF5C \u5F85\u9A8C\u6536 {review}\uFF08\u5F85\u529E|\u8FDB\u884C\u4E2D|\u5F85\u9A8C\u6536\uFF09",
  "shared.duplicate.suffix": "\uFF08\u526F\u672C\uFF09",
  // ── status / urgency / outcome enums (labels.ts) ──────────────────
  "status.column.backlog": "\u5F85\u89C4\u5212",
  "status.column.todo": "\u5F85\u529E",
  "status.column.in_progress": "\u8FDB\u884C\u4E2D",
  "status.column.in_review": "\u5F85\u9A8C\u6536",
  "status.column.done": "\u5DF2\u5B8C\u6210",
  "status.column.canceled": "\u5DF2\u53D6\u6D88",
  "status.column.archived": "\u5DF2\u5F52\u6863",
  "status.pill.backlog": "\u5F85\u89C4\u5212",
  "status.pill.todo": "\u5F85\u529E",
  "status.pill.in_progress": "\u8FDB\u884C\u4E2D",
  "status.pill.in_review": "\u5F85\u9A8C\u6536",
  "status.pill.done": "\u5B8C\u6210",
  "status.pill.canceled": "\u53D6\u6D88",
  "status.pill.archived": "\u5F52\u6863",
  "status.move.backlog": "\u5F85\u89C4\u5212",
  "status.move.todo": "\u5F85\u529E",
  "status.move.in_progress": "\u8FDB\u884C\u4E2D",
  "status.move.in_review": "\u5F85\u9A8C\u6536",
  "status.move.done": "\u5B8C\u6210",
  "status.move.canceled": "\u53D6\u6D88",
  "status.move.archived": "\u5F52\u6863",
  "urgency.urgent": "\u7D27\u6025",
  "urgency.normal": "\u4E00\u822C",
  "urgency.relaxed": "\u4E0D\u6025",
  "outcome.running": "\u6267\u884C\u4E2D",
  "outcome.succeeded": "\u6210\u529F",
  "outcome.failed": "\u5931\u8D25",
  "outcome.cancelled": "\u5DF2\u53D6\u6D88",
  // ── board toolbar & columns (TaskBoard) ───────────────────────────
  "board.title": "Agent \u4EFB\u52A1\u770B\u677F",
  "board.count.tasks": "{n} \u4EFB\u52A1 \xB7 rev {rev}",
  "board.action.newTask": "+ \u65B0\u5EFA\u4EFB\u52A1 \u25BC",
  "board.action.blankTask": "\u7A7A\u767D\u4EFB\u52A1",
  "board.action.manageTemplates": "\u2317 \u7BA1\u7406\u6A21\u677F\u2026",
  "board.search.placeholder": "\u641C\u7D22\u6807\u9898 / ID\u2026",
  "board.filter.allProjects": "\u5168\u90E8\u9879\u76EE",
  "board.sort.title": "\u5217\u5185\u6392\u5E8F",
  "board.sort.default": "\u9ED8\u8BA4\u6392\u5E8F",
  "board.sort.updated": "\u6700\u8FD1\u66F4\u65B0",
  "board.sort.urgency": "\u6309\u7D27\u6025\u5EA6",
  "board.sort.created": "\u521B\u5EFA\u65F6\u95F4",
  "board.sort.byTitle": "\u6309\u6807\u9898",
  "board.action.backToBoard": "\u8FD4\u56DE\u770B\u677F",
  "board.action.otherTasks": "\u5176\u5B83\u4EFB\u52A1",
  "board.action.settingsTitle": "\u770B\u677F\u8BBE\u7F6E\uFF1A\u65B0\u5EFA\u4EFB\u52A1\u7684\u9ED8\u8BA4\u6267\u884C\u9694\u79BB\u7B49",
  "board.action.settings": "\u{1F6E0} \u8BBE\u7F6E",
  "board.action.diagTitle": "\u5065\u5EB7\u8BCA\u65AD\uFF1A\u9057\u7559 worktree\u3001\u53F0\u8D26\u57FA\u672C\u9879",
  "board.action.diag": "\u2699 \u8BCA\u65AD",
  "board.action.importTitle": "\u4ECE JSON \u5907\u4EFD\u6587\u4EF6\u5BFC\u5165\u53F0\u8D26\uFF08\u9884\u89C8\u540E\u5408\u5E76\u6216\u6574\u518C\u66FF\u6362\uFF09",
  "board.action.import": "\u2B06 \u5BFC\u5165",
  "board.action.exportTitle": "\u5BFC\u51FA\u53F0\u8D26\uFF1A\u5B8C\u6574 JSON \u5907\u4EFD\u6216\u4EFB\u52A1\u6E05\u5355 CSV",
  "board.action.export": "\u2B07 \u5BFC\u51FA \u25BC",
  "board.export.jsonTitle": "\u5B8C\u6574\u53F0\u8D26\u5907\u4EFD\uFF08\u542B\u6267\u884C\u5386\u53F2\u4E0E\u770B\u677F\u8BBE\u7F6E\uFF09\uFF0C\u53EF\u7528\u4E8E\u5BFC\u5165\u6062\u590D",
  "board.export.json": "\u5B8C\u6574\u53F0\u8D26\uFF08JSON\uFF09",
  "board.export.csvTitle": "\u4EFB\u52A1\u6E05\u5355\u8868\u683C\uFF08Excel \u53EF\u76F4\u63A5\u6253\u5F00\uFF0C\u4E2D\u6587\u5DF2\u52A0 BOM\uFF09",
  "board.export.csv": "\u4EFB\u52A1\u6E05\u5355\uFF08CSV\uFF09",
  "board.drag.forbidden": "\u65E0\u6CD5\u4ECE\u300C{from}\u300D\u62D6\u81F3\u300C{to}\u300D",
  "board.empty": "\u65E0\u4EFB\u52A1",
  "board.secondary.empty": "\u65E0\u5DF2\u53D6\u6D88 / \u5DF2\u5F52\u6863 / \u5DF2\u5220\u9664\u4EFB\u52A1",
  "board.group.trashed": "\u5DF2\u5220\u9664",
  "board.batch.trashArchived": "\u6279\u91CF\u5220\u9664",
  "board.batch.trashArchivedTip": "\u8FDB\u5165\u9009\u62E9\u6A21\u5F0F\uFF0C\u52FE\u9009\u540E\u6279\u91CF\u6807\u8BB0\u4E3A\u5F85\u6E05\u9664",
  "board.batch.purgeTrashed": "\u6279\u91CF\u6E05\u7406",
  "board.batch.purgeTrashedTip": "\u8FDB\u5165\u9009\u62E9\u6A21\u5F0F\uFF0C\u52FE\u9009\u540E\u7269\u7406\u6E05\u9664\uFF0C\u4E0D\u53EF\u6062\u590D",
  "board.batch.confirm": "\u786E\u8BA4\u6267\u884C",
  "board.batch.confirmTip": "\u786E\u8BA4\u5BF9\u672C\u5217\u9009\u4E2D\u5361\u7247\u6267\u884C\u6279\u91CF\u64CD\u4F5C",
  "board.batch.confirmCancelTip": "\u53D6\u6D88\u672C\u6B21\u6279\u91CF\u64CD\u4F5C",
  "board.batch.cancel": "\u53D6\u6D88",
  "board.batch.noneSelected": "\u8BF7\u5148\u52FE\u9009\u8981\u64CD\u4F5C\u7684\u5361\u7247",
  "board.batch.selectAll": "\u5168\u9009 / \u5168\u4E0D\u9009",
  // ── diagnostics panel (TaskBoard) ─────────────────────────────────
  "diag.title": "\u5065\u5EB7\u8BCA\u65AD",
  "diag.subtitle": "\u53F0\u8D26\u57FA\u672C\u9879\u4E0E worktree \u9057\u7559\u6E05\u7406",
  "diag.revision": "\u53F0\u8D26\u4FEE\u8BA2\u53F7",
  "diag.tasks": "\u4EFB\u52A1\u603B\u6570",
  "diag.running": "\u6267\u884C\u4E2D",
  "diag.orphans": "\u9057\u7559 worktree",
  "diag.orphans.heading": "\u9057\u7559 worktree\uFF08\u53F0\u8D26\u65E0\u4E3B\u4F46\u76EE\u5F55\u5B58\u5728\uFF09",
  "diag.orphans.none": "\u65E0\u9057\u7559 \u2014 \u5404\u9879\u76EE .dsh-worktrees \u76EE\u5F55\u5E72\u51C0",
  "diag.orphans.cleanup": "\u6E05\u7406",
  "diag.orphans.hint": "\u63D0\u793A\uFF1A\u6709\u672A\u63D0\u4EA4\u4FEE\u6539\u7684\u9057\u7559\u76EE\u5F55\u4F1A\u88AB\u62D2\u7EDD\u6E05\u7406\uFF0C\u8BF7\u5148\u624B\u52A8\u5904\u7406\u5176\u5185\u5BB9\u3002live \u4EFB\u52A1\u7684 worktree \u8BF7\u5728\u4EFB\u52A1\u8BE6\u60C5\u9875\u5220\u9664\u3002",
  "diag.gitignore.heading": "gitignore \u5EFA\u8BAE",
  "diag.gitignore.none": "\u65E0\u5F85\u529E \u2014 \u5404 git \u9879\u76EE\u5DF2\u5FFD\u7565 .dsh-worktrees \u76EE\u5F55",
  "diag.gitignore.suggestA": "\u5EFA\u8BAE\u5728 .gitignore \u52A0\u5165\u4E00\u884C",
  "diag.gitignore.suggestB": "\uFF08\u4E0D\u4F1A\u81EA\u52A8\u4FEE\u6539\uFF09",
  // ── task card (TaskCard) ──────────────────────────────────────────
  "card.drag.running": "\u8BE5\u4EFB\u52A1\u6B63\u7531\u4F1A\u8BDD\u6267\u884C\u4E2D\uFF08{title}\uFF09\uFF0C\u4E0D\u80FD\u62D6\u52A8",
  "card.badge.stale": "\u23F1 \u8BA4\u9886\u8D85\u65F6",
  "card.badge.modelTitle": "\u56FA\u5B9A\u6A21\u578B: {model}",
  "card.badge.modelEffort": " \xB7 \u601D\u8003\u5F3A\u5EA6: {effort}",
  "card.badge.checklistReview": "\u5F85\u9A8C\u6536\uFF1A\u6E05\u5355\u672A\u5168\u90E8\u52FE\u9009",
  "card.badge.checklist": "\u9A8C\u6536\u6E05\u5355\u8FDB\u5EA6",
  "card.badge.pendingPurge": "\u5F85\u6E05\u9664",
  "card.session.jumpTitle": "\u70B9\u51FB\u4E00\u952E\u8DF3\u8F6C\u5230\u4F1A\u8BDD\uFF1A{id}",
  "card.session.badge": "\u4F1A\u8BDD: {id}",
  "card.session.tagTitle": "\u6240\u5C5E\u4F1A\u8BDD\uFF1A{id}\uFF08\u70B9\u51FB\u8DF3\u8F6C\uFF09",
  "card.session.tagTitleWithTitle": "\u6240\u5C5E\u4F1A\u8BDD\uFF1A{title}\uFF08{id}\uFF0C\u70B9\u51FB\u8DF3\u8F6C\uFF09",
  "card.session.missing": "\u8BE5\u4F1A\u8BDD\u5DF2\u88AB\u5220\u9664\uFF08{id}\uFF09\uFF0C\u65E0\u6CD5\u6253\u5F00",
  "card.session.archived": "\u8BE5\u4F1A\u8BDD\u5DF2\u5F52\u6863\uFF08{id}\uFF09\uFF0C\u5DF2\u4ECE\u4F1A\u8BDD\u5217\u8868\u9690\u85CF",
  "card.session.unavailable": "\u4F1A\u8BDD\u5BFC\u822A\u4E0D\u53EF\u7528\uFF0C\u4F1A\u8BDD ID\uFF1A{id}",
  "card.reject.placeholder": "\u9000\u56DE\u539F\u56E0\uFF08\u53EF\u9009\uFF0Cagent \u5F00\u5DE5\u524D\u4F1A\u8BFB\uFF09\u2026",
  "card.reject.confirm": "\u9000\u56DE\u5F85\u529E",
  "card.action.doneTitle": "\u9A8C\u6536\u5B8C\u6210\uFF1A\u79FB\u81F3\u5DF2\u5B8C\u6210",
  "card.action.done": "\u2713 \u5B8C\u6210",
  "card.action.rejectTitle": "\u9000\u56DE\u5F85\u529E\uFF0C\u53EF\u9644\u9000\u56DE\u539F\u56E0",
  "card.action.reject": "\u2717 \u9000\u56DE",
  // ── alert modal ───────────────────────────────────────────────────
  "alert.ok": "\u77E5\u9053\u4E86",
  // ── diff view (TaskDetail) ────────────────────────────────────────
  "diff.commit": "\u63D0\u4EA4 {hash}",
  "diff.file": "\u6587\u4EF6 {path}",
  "diff.truncated": "\u26A0 \u5185\u5BB9\u8FC7\u957F\u5DF2\u622A\u65AD",
  "diff.failed": "\u83B7\u53D6\u5931\u8D25\uFF08\u539F\u56E0\u89C1\u770B\u677F\u9876\u90E8\u9519\u8BEF\u6761\uFF1B\u5BF9\u8C61\u53EF\u80FD\u5DF2\u968F worktree \u5220\u9664\u4E22\u5931\uFF09",
  // ── checklist block (TaskDetail) ──────────────────────────────────
  "checklist.title": "\u9A8C\u6536\u6E05\u5355\uFF08DoD\uFF09",
  "checklist.unchecked": " \xB7 {n} \u9879\u672A\u5B8C\u6210",
  "checklist.allDone": " \xB7 \u5168\u90E8\u5B8C\u6210",
  "checklist.byUser": "\u{1F464} \u7528\u6237",
  "checklist.uncheckedItem": "\u672A\u5B8C\u6210",
  "checklist.evidence": "\u8BC1\u636E\uFF1A{note}",
  // ── execution report block (TaskDetail) ───────────────────────────
  "report.title": "\u6267\u884C\u62A5\u544A",
  "report.submitted": "\u7531\u6267\u884C\u4F1A\u8BDD\u63D0\u4EA4 \xB7 {time}",
  "report.changedFiles": "\u6539\u52A8\u6587\u4EF6",
  "report.checks": "\u81EA\u9A8C\u60C5\u51B5",
  "report.artifacts": "\u4EA7\u7269",
  "report.risk": "\u5269\u4F59\u98CE\u9669",
  // ── isolation block (TaskDetail) ──────────────────────────────────
  "iso.title": "\u6267\u884C\u9694\u79BB",
  "iso.none": "\u{1F4C1} \u539F\u76EE\u5F55\u6267\u884C",
  "iso.worktreeTitle": "\u6267\u884C\u9694\u79BB \xB7 Worktree",
  "iso.branch": "\u{1F33F} \u5206\u652F",
  "iso.baseline": "\u57FA\u7EBF {base} \u2192 {head}",
  "iso.changed": "\u6539\u52A8 {n} \u4E2A\u6587\u4EF6",
  "iso.commit.openTitle": "\u70B9\u51FB\u5C55\u5F00\u8BE5\u63D0\u4EA4\u7684 diff",
  "iso.commits.more": "\u2026 \u5171 {n} \u4E2A\u63D0\u4EA4",
  "iso.nocommit": "\u8BE5\u6B21\u6267\u884C\u6CA1\u6709\u4EA7\u751F\u63D0\u4EA4\uFF08\u6539\u52A8\u53EF\u80FD\u672A\u63D0\u4EA4\uFF0C\u89C1\u4E0B\u65B9\u8B66\u544A\uFF09",
  "iso.dirty.toggle": "\u26A0 \u6709 {n} \u5904\u672A\u63D0\u4EA4\u4FEE\u6539\uFF08\u5408\u5E76\u524D\u8BF7\u8BA9 agent \u63D0\u4EA4\uFF0C\u6216\u624B\u52A8\u5904\u7406\uFF09",
  "iso.dirty.expand": " \u25BC \u67E5\u770B\u6587\u4EF6",
  "iso.dirty.collapse": " \u25B2",
  "iso.dirty.openTitle": "\u70B9\u51FB\u67E5\u770B\u8BE5\u6587\u4EF6\u7684\u672A\u63D0\u4EA4 diff",
  "iso.dirty.more": "\u2026 \u5171 {n} \u5904\uFF08\u5B8C\u6574\u5217\u8868\u89C1\u4EFB\u52A1\u53F0\u8D26\uFF09",
  "iso.hint.running": "\u6267\u884C\u4E2D \u2014 \u7ED3\u675F\u540E\u53EF\u5408\u5E76\u6216\u6E05\u7406",
  "iso.merge.confirm": "\u5C06\u5206\u652F\u4EE5 --no-ff \u5408\u5E76\u5230\u4E3B\u5DE5\u4F5C\u533A\uFF1F",
  "iso.merge.go": "\u786E\u8BA4\u5408\u5E76",
  "iso.merge.title": "\u5728\u4E3B\u5DE5\u4F5C\u533A git merge --no-ff \u8BE5\u4EFB\u52A1\u5206\u652F\uFF08\u8981\u6C42\u4E3B\u533A\u5E72\u51C0\uFF1B\u51B2\u7A81\u4F1A\u539F\u6837\u62A5\u544A\uFF09",
  "iso.merge.button": "\u21E5 \u5408\u5E76\u5230\u4E3B\u5DE5\u4F5C\u533A",
  "iso.merge.failed": "\u5408\u5E76\u5931\u8D25\uFF1A{error}",
  "iso.merge.noop": "\u8BE5\u5206\u652F\u6CA1\u6709\u9886\u5148\u4E3B\u5DE5\u4F5C\u533A\u7684\u65B0\u63D0\u4EA4\uFF0C\u65E0\u9700\u5408\u5E76\uFF08\u53EF\u9000\u56DE\u7EED\u8DD1\u6216\u76F4\u63A5\u6E05\u7406\uFF09",
  "iso.merge.done": "\u5DF2\u6309\u4ED3\u5E93\u5408\u5E76\uFF08--no-ff\uFF09\uFF1A{summary}",
  "iso.merge.partial": "\u90E8\u5206\u4ED3\u5E93\u5408\u5E76\u5931\u8D25\uFF1A{summary}\n{error}",
  "iso.repo.root": "\u6839\u4ED3\u5E93",
  "iso.remove.wt": "\u{1F5D1} \u5220\u9664 worktree",
  "iso.remove.wtTitle": "git worktree remove\uFF08\u6709\u672A\u63D0\u4EA4\u4FEE\u6539\u65F6\u62D2\u7EDD\uFF09",
  "iso.remove.wtb": "\u{1F5D1} \u5220 worktree + \u5206\u652F",
  "iso.remove.wtbTitle": "\u5220\u9664 worktree \u5E76\u5220\u9664\u4EFB\u52A1\u5206\u652F\uFF08\u6709\u672A\u63D0\u4EA4\u4FEE\u6539\u65F6\u62D2\u7EDD\uFF09",
  "iso.remove.confirmWt": "\u5220\u9664 worktree \u76EE\u5F55\uFF1F",
  "iso.remove.confirmWtb": "\u5220\u9664 worktree \u5E76\u5220\u9664\u5206\u652F\uFF1F",
  "iso.remove.failed": "\u5220\u9664\u5931\u8D25\uFF1A{error}",
  "iso.remove.branchFailed": "worktree \u5DF2\u5220\u9664\uFF0C\u4F46\u5206\u652F\u5220\u9664\u5931\u8D25\uFF1A{error}",
  "iso.hint.keep": "\u5206\u652F\u4E0E worktree \u4FDD\u7559\u4E2D \u2014 \u53EF\u9000\u56DE\u7EE7\u7EED\u4FEE\u6539",
  // ── detail pane (TaskDetail) ──────────────────────────────────────
  "detail.session.jumpTitle": "\u4E00\u952E\u8DF3\u8F6C\u5230\u5BF9\u5E94\u4F1A\u8BDD\uFF1A{id}",
  "detail.session.jump": "\u{1F916} \u8DF3\u8F6C\u4F1A\u8BDD \u2197",
  "detail.action.edit": "\u270E \u7F16\u8F91",
  "detail.action.duplicateTitle": "\u590D\u5236\u6B64\u4EFB\u52A1\u7684\u5168\u90E8\u914D\u7F6E\u4E3A\u4E00\u5F20\u65B0\u5361\uFF08\u5F85\u529E\u5217\uFF09",
  "detail.action.duplicate": "\u29C9 \u590D\u5236",
  "detail.action.saveTplTitle": "\u628A\u6B64\u4EFB\u52A1\u7684\u914D\u7F6E\uFF08\u542B\u6E05\u5355\uFF09\u4FDD\u5B58\u4E3A\u6A21\u677F\uFF0C\u65B0\u5EFA\u4EFB\u52A1\u65F6\u53EF\u7528",
  "detail.action.saveTplDone": "\u5DF2\u5B58\u4E3A\u6A21\u677F\uFF08\u65B0\u5EFA\u4EFB\u52A1 \u25BC \u4E0B\u62C9\u53EF\u7528\uFF0C\u53EF\u5728\u6A21\u677F\u7BA1\u7406\u4E2D\u6539\u540D\uFF09",
  "detail.action.saveTpl": "\u2317 \u5B58\u4E3A\u6A21\u677F",
  "detail.action.reuseTitle": "\u7EED\u8DD1\uFF1A\u4FDD\u7559\u73B0\u6709 worktree \u4E0E\u5206\u652F\uFF08\u4E0A\u6B21\u7684\u6539\u52A8\u548C\u63D0\u4EA4\u90FD\u5728\u539F\u5904\uFF09\uFF0C\u5728\u5176\u4E0A\u7EE7\u7EED\u6267\u884C\uFF1B\u9ED8\u8BA4\u300C\u7ACB\u5373\u6267\u884C\u300D\u4F1A\u91CD\u7F6E\u4E3A\u5168\u65B0\u57FA\u7EBF",
  "detail.action.reuse": "\u21BB \u7EED\u8DD1",
  "detail.action.runTitleModel": "\u65B0\u4F1A\u8BDD\u6267\u884C\uFF08{model}\uFF09",
  "detail.action.runTitleDefault": "\u65B0\u4F1A\u8BDD\u6267\u884C\uFF08\u9ED8\u8BA4\u6A21\u578B\uFF09",
  "detail.action.run": "\u25B6 \u7ACB\u5373\u6267\u884C",
  "detail.action.stopConfirm": "\u505C\u6B62\u8BE5\u6267\u884C\u4F1A\u8BDD\uFF1F",
  "detail.action.stop": "\u505C\u6B62",
  "detail.action.stopTitle": "\u505C\u6B62\u6267\u884C\u4F1A\u8BDD {id}\uFF08\u4EFB\u52A1\u56DE\u5230\u5F85\u529E\uFF09",
  "detail.action.stopExec": "\u25A0 \u505C\u6B62\u6267\u884C",
  "detail.chip.nextRun": "{cron} \xB7 \u4E0B\u6B21 {time}",
  "detail.chip.queuedRun": "\u7B49\u5F85\u6267\u884C \xB7 \u539F\u5B9A {time}",
  "detail.chip.checklist": "\u6E05\u5355 {done}/{total}",
  "detail.chip.isolated": "Worktree \u9694\u79BB",
  "detail.chip.holderTitle": "\u70B9\u51FB\u8DF3\u8F6C\u81F3\u8BE5\u4F1A\u8BDD\uFF1A{id}",
  "detail.chip.holderStale": "\u8BA4\u9886\u8D85\u65F6 \xB7 ",
  "detail.chip.holderBy": "\u7531 ",
  "detail.chip.holderSuffix": " \u6301\u6709 \u2197",
  "detail.chip.trashed": "\u5DF2\u5220\u9664\u5F85\u6E05\u9664",
  "detail.sub.line": "\u66F4\u65B0 {time} \xB7 \u6700\u8FD1\u64CD\u4F5C {who}",
  "detail.updatedBy.system": "\u2699\uFE0F \u7CFB\u7EDF",
  "detail.updatedBy.user": "\u{1F464} \u7528\u6237",
  "detail.field.description": "\u63CF\u8FF0",
  "detail.field.prompt": "\u6267\u884C Prompt",
  "detail.move.to": "\u79FB\u81F3\u2192{status}",
  "detail.move.confirmDoneUnchecked": "\u4ECD\u6709 {n} \u9879\u6E05\u5355\u672A\u52FE\u9009\uFF0C\u786E\u8BA4\u5B8C\u6210\uFF1F",
  "detail.move.confirmDone": "\u786E\u8BA4\u5B8C\u6210\uFF1F",
  "detail.move.confirmArchive": "\u786E\u8BA4\u5F52\u6863\u8BE5\u4EFB\u52A1\uFF1F",
  "detail.move.confirmArchiveSessionWithId": "\u662F\u5426\u8FDE\u540C\u6267\u884C\u4F1A\u8BDD {id} \u4E00\u540C\u5F52\u6863\uFF1F",
  "detail.move.confirmArchiveSessionCount": "\u662F\u5426\u8FDE\u540C {n} \u4E2A\u6267\u884C\u4F1A\u8BDD\u4E00\u540C\u5F52\u6863\uFF1F",
  "detail.move.archiveWithSession": "\u8FDE\u540C\u4F1A\u8BDD\u5F52\u6863",
  "detail.move.archiveUnsupported": "\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u4F1A\u8BDD\u5F52\u6863",
  "detail.move.archiveResult": "\u5361\u7247\u5DF2\u5F52\u6863\uFF1B\u6267\u884C\u4F1A\u8BDD\u5F52\u6863\u6210\u529F {n} \u4E2A\u3002\u5931\u8D25\u4F1A\u8BDD\u5982\u4E0B\uFF08\u5982\u6709\uFF09\uFF1A",
  "detail.move.archiveRetry": "\u5F52\u6863 / \u91CD\u8BD5\u5F52\u6863\u6267\u884C\u4F1A\u8BDD",
  "detail.move.archiveCardOnly": "\u4EC5\u5F52\u6863\u5361\u7247",
  "detail.move.confirm": "\u786E\u8BA4",
  "detail.blocked.unmark": "\u2713 \u89E3\u9664\u53D7\u963B",
  "detail.blocked.mark": "\u26D4 \u6807\u8BB0\u53D7\u963B",
  "detail.release.title": "\u91CA\u653E {id} \u7684\u8BA4\u9886\uFF1A\u4EFB\u52A1\u56DE\u5230\u5F85\u529E\uFF08\u6301\u6709\u4F1A\u8BDD\u53EF\u80FD\u4ECD\u5728\u5DE5\u4F5C\uFF0C\u786E\u8BA4\u5B83\u5DF2\u505C\u6B62\u540E\u518D\u91CA\u653E\uFF09",
  "detail.release.button": "\u{1F513} \u91CA\u653E\u8BA4\u9886",
  "detail.comments.title": "\u8BC4\u8BBA",
  "detail.comments.empty": "\u6682\u65E0\u8BC4\u8BBA \u2014 agent \u4EA4\u63A5\u65F6\u4F1A\u5728\u8FD9\u91CC\u6C47\u62A5\u6539\u52A8\u4E0E\u9A8C\u8BC1\u7ED3\u679C",
  "detail.comments.user": "\u7528\u6237",
  "detail.composer.placeholder": "\u4EE5\u7528\u6237\u8EAB\u4EFD\u7559\u8A00\uFF08agent \u5F00\u5DE5\u524D\u4F1A\u8BFB\uFF09\u2026",
  "detail.composer.send": "\u53D1\u8868",
  "detail.exec.title": "\u6267\u884C\u8BB0\u5F55",
  "detail.exec.prunedTitle": "\u66F4\u65E9\u7684 {n} \u6761\u6267\u884C\u8BB0\u5F55\u5DF2\u6309\u4FDD\u7559\u4E0A\u9650\u6E05\u7406",
  "detail.exec.pruned": "+{n} \u5DF2\u6E05\u7406",
  "detail.exec.trigger.manual": "\u624B\u52A8",
  "detail.exec.trigger.scheduled": "\u5B9A\u65F6",
  "detail.exec.openTitle": "\u70B9\u51FB\u6253\u5F00\u8BE5\u6267\u884C\u4F1A\u8BDD\uFF1A{id}",
  "detail.danger.delete": "\u{1F5D1} \u5220\u9664\uFF08\u6807\u8BB0\u5F85\u6E05\u9664\uFF09",
  "detail.danger.purgeConfirm": "\u7269\u7406\u6E05\u9664\u4E0D\u53EF\u6062\u590D",
  "detail.danger.purgeGo": "\u786E\u8BA4\u6E05\u9664",
  "detail.danger.purge": "\u{1F525} \u7269\u7406\u6E05\u9664\uFF08\u9700\u786E\u8BA4\uFF09",
  // ── task form modal (TaskFormModal) ───────────────────────────────
  "form.title.create": "\u65B0\u5EFA\u4EFB\u52A1",
  "form.title.edit": "\u7F16\u8F91\u4EFB\u52A1",
  "form.subtitle.create": "\u63A8\u5165\u770B\u677F\uFF0C\u9879\u76EE\u5185\u4F1A\u8BDD\u53EF\u8BA4\u9886\u6267\u884C",
  "form.subtitle.edit": "\u8C03\u6574\u4EFB\u52A1\u5185\u5BB9\u4E0E\u6267\u884C\u914D\u7F6E",
  "form.field.title": "\u6807\u9898",
  "form.field.titlePlaceholder": "\u4E00\u53E5\u8BDD\u8BF4\u6E05\u8981\u505A\u4EC0\u4E48",
  "form.field.project": "\u9879\u76EE",
  "form.field.model": "\u6A21\u578B\uFF08\u9ED8\u8BA4 = \u4F1A\u8BDD\u9ED8\u8BA4\u6A21\u578B\uFF09",
  "form.field.modelDefault": "\u9ED8\u8BA4\u6A21\u578B",
  "form.model.option": "{name}\uFF08{provider}\uFF09",
  "form.field.effort": "\u601D\u8003\u5F3A\u5EA6\uFF08Reasoning Effort\uFF09",
  "form.field.effortTitle": "\u8BBE\u7F6E\u6A21\u578B\u7684\u601D\u8003\u5F3A\u5EA6\uFF08\u5982 low/medium/high\uFF09\uFF1B\u9ED8\u8BA4 = \u8DDF\u968F\u6A21\u578B/\u63D0\u4F9B\u5546\u9ED8\u8BA4",
  "form.effort.follow": "\u8DDF\u968F\u6A21\u578B\u9ED8\u8BA4",
  "form.effort.low": "\u4F4E (low)",
  "form.effort.medium": "\u4E2D (medium)",
  "form.effort.high": "\u9AD8 (high)",
  "form.effort.none": "\u5173\u95ED\u601D\u8003 (none)",
  "form.field.preset": "\u6267\u884C\u6A21\u5F0F\uFF08preset\uFF09",
  "form.field.presetTitle": "\u6267\u884C\u4F1A\u8BDD\u6309\u8BE5 preset \u7EC4\u5408\uFF08\u51B3\u5B9A\u5DE5\u5177\u96C6\u4E0E\u4EBA\u8BBE\uFF09\uFF1B\u9ED8\u8BA4 = \u90E8\u7F72\u9ED8\u8BA4 preset",
  "form.preset.follow": "\u8DDF\u968F\u90E8\u7F72\u9ED8\u8BA4",
  "form.preset.defaultTag": "\uFF08\u90E8\u7F72\u9ED8\u8BA4\uFF09",
  "form.field.urgency": "\u7D27\u6025\u5EA6",
  "form.urgency.urgent": "\u7D27\u6025",
  "form.urgency.normal": "\u4E00\u822C",
  "form.urgency.relaxed": "\u4E0D\u6025",
  "form.field.description": "\u63CF\u8FF0",
  "form.field.descriptionOptional": "\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
  "form.desc.placeholder": "\u9700\u6C42\u7EC6\u8282\u3001\u80CC\u666F\u8BF4\u660E\u3001\u9A8C\u6536\u6807\u51C6\u2026",
  "form.field.prompt": "\u6267\u884C Prompt\uFF08\u5B9E\u9645 Prompt = \u6807\u9898+\u4EFB\u52A1\u63CF\u8FF0+Prompt\uFF09",
  "form.field.promptOptional": "\u6267\u884C Prompt\uFF08\u53EF\u9009\uFF1B\u5B9E\u9645 Prompt = \u6807\u9898+\u4EFB\u52A1\u63CF\u8FF0+Prompt\uFF09",
  "form.prompt.placeholder": "\u8FFD\u52A0\u5728\u300C\u6807\u9898+\u4EFB\u52A1\u63CF\u8FF0\u300D\u4E4B\u540E\u53D1\u7ED9\u6267\u884C\u4F1A\u8BDD\u7684\u8865\u5145\u6307\u4EE4\u3002\u652F\u6301\u6A21\u677F\u53D8\u91CF\uFF1A{{lastExecution}}\uFF08\u4E0A\u6B21\u6267\u884C\u7ED3\u679C\uFF09\u3001{{lastComments}}\uFF08\u6700\u8FD1 3 \u6761\u8BC4\u8BBA\uFF09",
  "form.field.mode": "\u6267\u884C\u65B9\u5F0F",
  "form.mode.claim": "\u{1F91D} \u8BA4\u9886\u5236",
  "form.mode.claimHint": "\u9879\u76EE\u5185\u4F1A\u8BDD\u8BA4\u9886",
  "form.mode.once": "\u23F0 \u5B9A\u65F6\u6267\u884C",
  "form.mode.onceHint": "\u6307\u5B9A\u65F6\u95F4\u53EA\u8DD1\u4E00\u6B21",
  "form.mode.periodic": "\u{1F501} \u5B9A\u671F\u6267\u884C",
  "form.mode.periodicHint": "\u6309 cron \u5230\u70B9\u91CD\u590D\u5F00\u8DD1",
  "form.field.runAt": "\u89E6\u53D1\u65F6\u95F4",
  "form.mode.scheduled": "\u23F0 \u5B9A\u65F6\u6267\u884C",
  "form.mode.scheduledHint": "\u5230\u70B9\u81EA\u52A8\u5F00\u8DD1",
  "form.field.cron": "Cron \u8868\u8FBE\u5F0F",
  "form.cron.placeholder": "\u5206 \u65F6 \u65E5 \u6708 \u5468",
  "form.cron.daily": "\u6BCF\u5929 09:00",
  "form.cron.hourly": "\u6BCF\u5C0F\u65F6",
  "form.cron.every10min": "\u6BCF 10 \u5206\u949F",
  "form.cron.weekly": "\u6BCF\u5468\u4E00 09:00",
  "form.cron.next": "\u4E0B\u6B21 {time}",
  "form.field.periodicCompletion": "\u5B9A\u671F\u4EFB\u52A1\u5B8C\u6210\u540E",
  "form.periodicCompletion.rearm": "\u5B8C\u6210\u540E\u79FB\u56DE\u5F85\u529E",
  "form.periodicCompletion.rearmHint": "\u5BBF\u4E3B\u81EA\u52A8\u590D\u4F4D\u672C\u5361\uFF0C\u4E0B\u4E00\u6B21 cron \u7EE7\u7EED\u6267\u884C",
  "form.periodicCompletion.spawn": "\u5B8C\u6210\u540E\u65B0\u5EFA\u5F85\u529E\uFF08\u9ED8\u8BA4\uFF09",
  "form.periodicCompletion.spawnHint": "\u672C\u8F6E\u4FDD\u7559\u5F85\u9A8C\u6536\uFF0C\u5BBF\u4E3B\u65B0\u5EFA\u4E0B\u4E00\u8F6E\u5F85\u529E\u5361",
  "form.field.isolation": "\u6267\u884C\u9694\u79BB",
  "form.field.reuseSession": "\u590D\u7528\u4F1A\u8BDD",
  "form.session.new": "\u65B0\u5EFA\u4F1A\u8BDD",
  "form.session.fresh": "\u6BCF\u6B21\u65B0\u5EFA\u4F1A\u8BDD",
  "form.session.reuse": "\u9996\u6B21\u65B0\u5EFA\u4F1A\u8BDD\uFF0C\u540E\u7EED\u590D\u7528",
  "form.session.unavailable": "\u4F1A\u8BDD\u5217\u8868\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u6253\u5F00\u8868\u5355",
  "form.session.missing": "\u6240\u9009\u4F1A\u8BDD\u4E0D\u5728\u5F53\u524D\u9879\u76EE\u4E2D\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9",
  "form.iso.locked": "\u4EFB\u52A1\u5DF2\u6709\u6267\u884C\u8BB0\u5F55\uFF0C\u9694\u79BB\u65B9\u5F0F\u5DF2\u9501\u5B9A",
  "form.iso.lockedShort": "\u5DF2\u9501\u5B9A\uFF08\u6267\u884C\u5F00\u59CB\u540E\u4E0D\u53EF\u66F4\u6539\uFF09",
  "form.iso.nonGit": "\u5F53\u524D\u9879\u76EE\u975E git \u4ED3\u5E93",
  "form.iso.worktree": "\u{1F33F} Worktree \u9694\u79BB",
  "form.iso.worktreeTitle": "\u6BCF\u6B21\u6267\u884C\u5728\u72EC\u7ACB worktree \u5206\u652F\u4E0A\u8FDB\u884C",
  "form.iso.worktreeHint": "\u72EC\u7ACB\u5206\u652F task/\u6807\u9898+ID\uFF0C\u4E92\u4E0D\u6C61\u67D3",
  "form.iso.none": "\u{1F4C1} \u539F\u76EE\u5F55\u6267\u884C",
  "form.iso.noneTitle": "\u76F4\u63A5\u5728\u9879\u76EE\u76EE\u5F55\u6267\u884C\uFF08\u4E0D\u4F7F\u7528 git\uFF09",
  "form.iso.noneHintNonGit": "\u5F53\u524D\u9879\u76EE\u975E git \u4ED3\u5E93\uFF0C\u5C06\u5728\u539F\u76EE\u5F55\u6267\u884C",
  "form.iso.noneHint": "\u4E0D\u4F7F\u7528 git\uFF0C\u76F4\u63A5\u5728\u9879\u76EE\u76EE\u5F55\u5DE5\u4F5C",
  "form.iso.nonGitNote": "\u5F53\u524D\u9879\u76EE\u975E git \u4ED3\u5E93\uFF0C\u5C06\u5728\u539F\u76EE\u5F55\u6267\u884C\uFF08\u4EFB\u52A1\u4ECD\u6309\u9ED8\u8BA4\u914D\u7F6E\u521B\u5EFA\uFF0C\u8FD0\u884C\u65F6\u81EA\u52A8\u964D\u7EA7\uFF09",
  "form.iso.mirrorNote": "\u591A\u4ED3\u5E93\u5DE5\u4F5C\u533A\uFF1AWorktree \u9694\u79BB\u5C06\u81EA\u52A8\u6574\u533A\u955C\u50CF {n} \u4E2A\u4ED3\u5E93\u2014\u2014\u6BCF\u4ED3\u5E93\u72EC\u7ACB\u4EFB\u52A1\u5206\u652F\uFF0C\u9A8C\u6536\u6309\u4ED3\u5E93\u5408\u5E76",
  "form.field.checklist": "\u9A8C\u6536\u6E05\u5355\uFF08DoD\uFF09",
  "form.field.checklistOptional": "\u9A8C\u6536\u6E05\u5355\uFF08DoD\uFF0C\u53EF\u9009\uFF09",
  "form.check.itemPlaceholder": "\u9A8C\u6536\u9879 {n}\uFF08\u5B8C\u6210\u6807\u51C6\uFF09",
  "form.check.removeTitle": "\u5220\u9664\u8BE5\u9A8C\u6536\u9879",
  "form.check.add": "\uFF0B \u6DFB\u52A0\u9A8C\u6536\u9879",
  "form.check.checkedTitle": "\u52FE\u9009\u72B6\u6001\u968F\u4FDD\u5B58\u4FDD\u7559\uFF08\u5F53\u524D\u52FE\u9009\u4EBA\uFF1A{who}\uFF09",
  "form.check.notCheckedYet": "\u672A\u52FE\u9009",
  "form.check.hintCreate": "\u5171 {n} \u9879\uFF0C\u6267\u884C\u4F1A\u8BDD\u6309\u6E05\u5355\u5E72\u6D3B\u5E76\u9010\u9879\u52FE\u9009\uFF0C\u672A\u5B8C\u6210\u9879\u9A8C\u6536\u65F6\u9AD8\u4EAE",
  "form.check.hintEdit": "\u5DF2\u52FE\u9009 {checked}/{total}\uFF08\u4FDD\u5B58\u5C06\u6574\u4F53\u8986\u76D6\u6E05\u5355\uFF0C\u52FE\u9009\u72B6\u6001\u4FDD\u7559\uFF09",
  "form.hint.needTitle": "\u8BF7\u586B\u5199\u6807\u9898",
  "form.hint.needProject": "\u8BF7\u9009\u62E9\u9879\u76EE",
  "form.hint.cronBad": "Cron \u8868\u8FBE\u5F0F\u65E0\u6548\uFF08\u5206 \u65F6 \u65E5 \u6708 \u5468\uFF09",
  "form.hint.runAtBad": "\u8BF7\u9009\u62E9\u672A\u6765\u7684\u89E6\u53D1\u65F6\u95F4",
  "form.hint.nextRun": "\u4E0B\u6B21\u8FD0\u884C {time}",
  "form.hint.onceAt": "\u5C06\u4E8E {time} \u89E6\u53D1\u4E00\u6B21",
  "form.hint.saveVersion": "\u4FDD\u5B58\u540E\u7248\u672C v{v} \u2192 v{next}",
  "form.hint.createClaim": "\u521B\u5EFA\u540E\u9879\u76EE\u5185\u4F1A\u8BDD\u53EF\u8BA4\u9886\u6267\u884C",
  "form.action.runBlockedTitle": "\u4EFB\u52A1\u6B63\u5728\u6267\u884C\u4E2D\uFF0C\u4E0D\u80FD\u91CD\u590D\u53D1\u8D77",
  "form.action.runBusyTitle": "\u6B63\u5728\u63D0\u4EA4\u2026",
  "form.action.runTitle": "\u4FDD\u5B58\u540E\u7ACB\u5373\u53D1\u8D77\u6267\u884C\uFF08\u65B0\u4F1A\u8BDD\uFF09",
  "form.action.run": "\u26A1 \u7ACB\u5373\u6267\u884C",
  "form.action.save": "\u4FDD\u5B58\u4FEE\u6539",
  "form.action.create": "\u521B\u5EFA\u4EFB\u52A1",
  // ── template manager (TemplateManager) ────────────────────────────
  "tpl.aria": "\u7BA1\u7406\u6A21\u677F",
  "tpl.title": "\u4EFB\u52A1\u6A21\u677F",
  "tpl.subtitle": "\u65B0\u5EFA\u4EFB\u52A1 \u25BC \u4E0B\u62C9\u7684\u6A21\u677F\uFF1A\u6539\u540D / \u5206\u7C7B / \u5220\u9664 / \u76F4\u63A5\u4F7F\u7528\uFF1B\u4EFB\u52A1\u8BE6\u60C5\u9875\u300C\u5B58\u4E3A\u6A21\u677F\u300D\u53EF\u65B0\u589E",
  "tpl.empty": "\u6682\u65E0\u6A21\u677F \u2014 \u5728\u4EFB\u52A1\u8BE6\u60C5\u9875\u70B9\u300C\u5B58\u4E3A\u6A21\u677F\u300D\u628A\u5E38\u7528\u914D\u7F6E\u6C89\u6DC0\u4E0B\u6765",
  "tpl.name.aria": "\u6A21\u677F\u540D {name}",
  "tpl.category.aria": "\u6A21\u677F\u7C7B\u522B {name}",
  "tpl.category.placeholder": "\u8F93\u5165\u6216\u9009\u62E9\u7C7B\u522B\u2026",
  "tpl.category.default": "\u5176\u4ED6",
  "tpl.builtin": "\u5185\u7F6E",
  "tpl.custom": "\u81EA\u5EFA",
  "tpl.meta.checklist": " \xB7 \u6E05\u5355 {n} \u9879",
  "tpl.rename.title": "\u4FDD\u5B58\u6539\u540D\u4E0E\u7C7B\u522B",
  "tpl.rename.button": "\u6539\u540D",
  "tpl.use.title": "\u7528\u6B64\u6A21\u677F\u6253\u5F00\u65B0\u5EFA\u8868\u5355",
  "tpl.use.button": "\u7528\u6B64\u65B0\u5EFA",
  "tpl.delete.title": "\u5220\u9664\u8BE5\u6A21\u677F",
  "tpl.updated": "\u6A21\u677F\u5DF2\u66F4\u65B0",
  "tpl.foot.hint": "\u6A21\u677F\u968F\u53F0\u8D26\u4E00\u540C\u4FDD\u5B58\u5728\u5F53\u524D\u6570\u636E\u76EE\u5F55\uFF0C\u5347\u7EA7\u4E0D\u4E22",
  // ── import modal (ImportModal) ────────────────────────────────────
  "imp.aria": "\u5BFC\u5165\u53F0\u8D26",
  "imp.title": "\u5BFC\u5165\u53F0\u8D26",
  "imp.subtitle": "\u9009\u62E9\u5BFC\u51FA\u7684 JSON \u5907\u4EFD\u6587\u4EF6\uFF1A\u5148\u9884\u89C8\u3001\u518D\u5408\u5E76\u6216\u6574\u518C\u66FF\u6362",
  "imp.parseError": "\u6587\u4EF6\u4E0D\u662F\u5408\u6CD5 JSON",
  "imp.note": "\u2B07 JSON \u5BFC\u51FA\u53EF\u6062\u590D\u53F0\u8D26\uFF1B\u56FE\u7247\u9644\u4EF6\u9700\u540C\u65F6\u5907\u4EFD\u8BBE\u7F6E\u9875\u6240\u793A\u6570\u636E\u76EE\u5F55\u4E0B\u7684 dsh-taskboard-assets \u6587\u4EF6\u5939\u3002\u5BFC\u5165\u6587\u4EF6\u7684 schemaVersion \u5FC5\u987B\u4E0E\u5F53\u524D\u7248\u672C\u4E00\u81F4\u3002",
  "imp.previewing": "\u9884\u89C8\u4E2D\u2026",
  "imp.stat.create": "\u65B0\u589E",
  "imp.stat.overwrite": "\u8986\u76D6\uFF08\u540C id\uFF09",
  "imp.stat.invalid": "\u65E0\u6548\uFF08\u8DF3\u8FC7\uFF09",
  "imp.sec.create": "\u65B0\u589E\u4EFB\u52A1",
  "imp.sec.overwrite": "\u8986\u76D6\u4EFB\u52A1\uFF08\u6574\u5361\u66FF\u6362\uFF0C\u542B\u6267\u884C\u5386\u53F2\u4E0E\u8BC4\u8BBA\uFF09",
  "imp.sec.invalid": "\u65E0\u6548\u6761\u76EE\uFF08\u4E0D\u4F1A\u5BFC\u5165\uFF09",
  "imp.noId": "\uFF08\u65E0 id\uFF09",
  "imp.mode.merge": "\u2295 \u5408\u5E76",
  "imp.mode.mergeHint": "\u65B0\u589E + \u6309 id \u8986\u76D6\uFF0C\u5176\u4F59\u4E0D\u52A8",
  "imp.mode.replace": "\u{1F4A3} \u6574\u518C\u66FF\u6362",
  "imp.mode.replaceHint": "\u6E05\u7A7A\u5F53\u524D\u53F0\u8D26\uFF0C\u4EE5\u5BFC\u5165\u6587\u4EF6\u4E3A\u51C6\uFF08\u5148\u81EA\u52A8\u5907\u4EFD\uFF09",
  "imp.result.replace": "\u6574\u518C\u66FF\u6362\u5B8C\u6210\uFF1A\u5BFC\u5165 {n} \u5F20\uFF08\u539F {total} \u5F20\u5DF2\u6574\u518C\u5907\u4EFD\uFF09",
  "imp.result.merge": "\u5408\u5E76\u5B8C\u6210\uFF1A\u65B0\u589E {n} \u5F20\u3001\u8986\u76D6 {m} \u5F20",
  "imp.foot.replaceConfirm": "\u26A0 \u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u6267\u884C\u6574\u518C\u66FF\u6362\uFF08\u4E0D\u53EF\u64A4\u9500\uFF0C\u5DF2\u81EA\u52A8\u5907\u4EFD\uFF09",
  "imp.foot.replaceNeedConfirm": "\u6574\u518C\u66FF\u6362\u9700\u8981\u4E8C\u6B21\u786E\u8BA4",
  "imp.foot.mergeHint": "\u5408\u5E76\u53EA\u5199\u5165\u9884\u89C8\u4E2D\u5217\u51FA\u7684\u4EFB\u52A1",
  "imp.action.run": "\u6267\u884C\u5BFC\u5165",
  "imp.action.confirmReplace": "\u786E\u8BA4\u6574\u518C\u66FF\u6362",
  // ── board settings modal (SettingsModal) ──────────────────────────
  "set.aria": "\u770B\u677F\u8BBE\u7F6E",
  "set.title": "\u770B\u677F\u8BBE\u7F6E",
  "set.subtitle": "\u65B0\u5EFA\u4EFB\u52A1\u3001\u8C03\u5EA6\u3001\u4F1A\u8BDD\u540C\u6B65\u4E0E\u672C\u5730\u6570\u636E\u5B58\u50A8",
  "set.agent.heading": "\u9ED8\u8BA4\u6A21\u578B\u4E0E Agent preset",
  "set.agent.hint": "\u4EC5\u7528\u4E8E\u65B0\u5EFA\u4EFB\u52A1\uFF1A\u4EFB\u52A1\u6216\u6A21\u677F\u7684\u663E\u5F0F\u9009\u62E9\u4F18\u5148\uFF1B\u4FEE\u6539\u8BBE\u7F6E\u4E0D\u4F1A\u6539\u5199\u5DF2\u6709\u4EFB\u52A1\u3002\u63A8\u7406\u5F3A\u5EA6\u968F\u6240\u9009\u6A21\u578B\u4FDD\u5B58\uFF0C\u5207\u6362\u6A21\u578B\u65F6\u91CD\u7F6E\u3002",
  "set.agent.model": "\u9ED8\u8BA4\u6A21\u578B",
  "set.agent.effort": "\u9ED8\u8BA4\u63A8\u7406\u5F3A\u5EA6",
  "set.agent.preset": "\u9ED8\u8BA4 Agent preset",
  "set.iso.heading": "\u9ED8\u8BA4\u6267\u884C\u9694\u79BB",
  "set.iso.noneHint": "\u4E0D\u4F7F\u7528 git\uFF0C\u76F4\u63A5\u5728\u9879\u76EE\u76EE\u5F55\u5DE5\u4F5C\uFF08\u51FA\u5382\u9ED8\u8BA4\uFF09",
  "set.iso.worktreeHint": "\u6BCF\u6B21\u6267\u884C\u5728\u72EC\u7ACB worktree \u5206\u652F\u4E0A\u8FDB\u884C\uFF08task/\u6807\u9898+ID\uFF09\uFF0C\u4E92\u4E0D\u6C61\u67D3\uFF1B\u591A\u4ED3\u5E93\u5DE5\u4F5C\u533A\u81EA\u52A8\u6574\u533A\u955C\u50CF\uFF08\u6BCF\u4ED3\u5E93\u72EC\u7ACB\u5206\u652F\uFF09",
  "set.iso.current": "\u5F53\u524D\u4FDD\u5B58\u7684\u9ED8\u8BA4\uFF1A{current}\u3002\u4EC5\u5F71\u54CD\u4E4B\u540E\u65B0\u5EFA\u7684\u4EFB\u52A1\uFF1B\u5DF2\u6709\u4EFB\u52A1\u4FDD\u6301\u521B\u5EFA\u65F6\u7684\u9009\u62E9\uFF0C\u975E git \u9879\u76EE\u8FD0\u884C\u65F6\u4ECD\u81EA\u52A8\u964D\u7EA7\u539F\u76EE\u5F55\u3002",
  "set.sync.heading": "\u81EA\u52A8\u540C\u6B65\u5DE5\u4F5C\u533A\u4F1A\u8BDD",
  "set.sync.off.name": "\u{1F6AB} \u5173\u95ED\u540C\u6B65",
  "set.sync.off.title": "\u4EC5\u7BA1\u7406\u5728\u4EFB\u52A1\u770B\u677F\u4E2D\u521B\u5EFA\u548C\u89E6\u53D1\u7684\u4EFB\u52A1",
  "set.sync.off.hint": "\u4EC5\u7BA1\u7406\u770B\u677F\u4EFB\u52A1\uFF08\u51FA\u5382\u9ED8\u8BA4\uFF09",
  "set.sync.on.name": "\u{1F504} \u81EA\u52A8\u7EB3\u5165\u4F1A\u8BDD",
  "set.sync.on.title": "\u5404\u5DE5\u4F5C\u533A\u76F4\u63A5\u65B0\u5EFA\u7684\u4F1A\u8BDD\u4E5F\u4F1A\u5728\u770B\u677F\u5C55\u793A\uFF0C\u8FD0\u884C\u4E2D\u8FDB\u5165\u300C\u8FDB\u884C\u4E2D\u300D\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u8FDB\u5165\u300C\u5F85\u9A8C\u6536\u300D",
  "set.sync.on.hint": "\u8DDF\u8E2A\u8FD0\u884C\u5E76\u5728\u5B8C\u6210\u540E\u8FDB\u5165\u5F85\u9A8C\u6536",
  "set.sync.stateOn": "\u5DF2\u5F00\u542F\uFF1A\u5DE5\u4F5C\u533A\u76F4\u63A5\u65B0\u5EFA\u5E76\u6267\u884C\u7684\u4F1A\u8BDD\u5C06\u81EA\u52A8\u5728\u770B\u677F\u751F\u6210\u4EFB\u52A1\u5361\u7247\uFF0C\u5E76\u5728\u5B8C\u6210\u540E\u6D41\u8F6C\u81F3\u300C\u5F85\u9A8C\u6536\u300D\u5217\u3002",
  "set.sync.stateOff": "\u5DF2\u5173\u95ED\uFF1A\u4EC5\u5728\u770B\u677F\u5185\u90E8\u521B\u5EFA\u4E0E\u89E6\u53D1\u6267\u884C\u7684\u4EFB\u52A1\u4F1A\u51FA\u73B0\u5728\u770B\u677F\u4E0A\u3002",
  "set.foot.dirty": "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539",
  "set.foot.clean": "\u4E0E\u770B\u677F\u5F53\u524D\u8BBE\u7F6E\u4E00\u81F4",
  "set.action.save": "\u4FDD\u5B58\u8BBE\u7F6E",
  "set.storage.heading": "\u6570\u636E\u5B58\u50A8\u4F4D\u7F6E",
  "set.storage.hint": "\u4EFB\u52A1\u53F0\u8D26\u3001\u6A21\u677F\u548C\u56FE\u7247\u9644\u4EF6\u7EDF\u4E00\u5B58\u653E\u5728\u6B64\u76EE\u5F55\u3002\u4FEE\u6539\u8DEF\u5F84\u4F1A\u5148\u5B8C\u6574\u590D\u5236\u5E76\u6821\u9A8C\uFF0C\u518D\u5207\u6362\u5230\u65B0\u4F4D\u7F6E\u3002",
  "set.storage.loading": "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u8DEF\u5F84\u2026",
  "set.storage.current": "\u5F53\u524D\u8DEF\u5F84\uFF1A{path}",
  "set.storage.assets": "\u56FE\u7247\u9644\u4EF6\uFF1A{count} \u4E2A\uFF0C{size} MiB",
  "set.storage.default": "\u6062\u590D\u9ED8\u8BA4\u8DEF\u5F84",
  "set.storage.check": "\u68C0\u67E5\u8DEF\u5F84",
  "set.storage.migrate": "\u8FC1\u79FB\u6570\u636E",
  "set.storage.migrating": "\u8FC1\u79FB\u4E2D\u2026",
  "set.storage.confirm": "\u786E\u8BA4\u8FC1\u79FB\u5168\u90E8\u4EFB\u52A1\u53F0\u8D26\u3001\u6A21\u677F\u548C\u56FE\u7247\u9644\u4EF6\uFF1F\n\n\u539F\u8DEF\u5F84\uFF1A{from}\n\u65B0\u8DEF\u5F84\uFF1A{to}\n\n\u8FC1\u79FB\u671F\u95F4\u5199\u64CD\u4F5C\u4F1A\u77ED\u6682\u6392\u961F\u3002",
  "set.storage.migrated": "\u8FC1\u79FB\u6210\u529F\uFF0C\u6570\u636E\u5DF2\u8FC1\u79FB\u5230 {path}",
  "set.storage.warnings": "\u8FC1\u79FB\u5B8C\u6210\uFF0C\u4F46\u90E8\u5206\u65E7\u6570\u636E\u672A\u80FD\u6E05\u7406\uFF1A{warnings}",
  // ── execution permission (PR #14) ─────────────────────────────────
  "form.field.permission": "\u6267\u884C\u6743\u9650",
  "form.perm.write": "\u53EF\u5199\u5165\u5DE5\u4F5C\u533A",
  "form.perm.readOnly": "\u4EC5\u53EF\u67E5\u770B",
  "form.perm.fullAccess": "\u5B8C\u5168\u6743\u9650",
  "form.perm.defaultTag": "\uFF08\u9ED8\u8BA4\uFF09",
  "set.perm.heading": "\u9ED8\u8BA4\u6267\u884C\u6743\u9650",
  "set.perm.writeName": "\u{1F4C1} \u53EF\u5199\u5165\u5DE5\u4F5C\u533A\uFF08\u51FA\u5382\u9ED8\u8BA4\uFF09",
  "set.perm.writeHint": "\u53EF\u8BFB\u5199\u5DE5\u4F5C\u533A\u53CA\u4E34\u65F6\u76EE\u5F55\uFF0C\u5199\u64CD\u4F5C\u65E0\u9700\u4E8C\u6B21\u786E\u8BA4",
  "set.perm.readOnlyName": "\u{1F512} \u4EC5\u53EF\u67E5\u770B",
  "set.perm.readOnlyHint": "\u4EC5\u5141\u8BB8\u53EA\u8BFB\u67E5\u770B\u4E0E\u68C0\u7D22\uFF0C\u7981\u6B62\u4FEE\u6539\u6587\u4EF6\u6216\u7834\u574F\u6027\u547D\u4EE4",
  "set.perm.fullName": "\u26A1 \u5B8C\u5168\u6743\u9650",
  "set.perm.fullHint": "\u5B8C\u5168\u65E0\u9650\u5236\u6743\u9650\uFF0C\u53EF\u8BBF\u95EE\u5168\u76D8\u53CA\u6267\u884C\u7CFB\u7EDF\u5916\u90E8\u547D\u4EE4",
  "set.perm.current": "\u5F53\u524D\u4FDD\u5B58\u7684\u9ED8\u8BA4\uFF1A{current}\u3002\u65B0\u5EFA\u4EFB\u52A1\u65F6\u9884\u8BBE\u7684\u6267\u884C\u6743\u9650\u3002",
  "set.schedule.heading": "\u5B9A\u65F6\u8C03\u5EA6",
  "set.schedule.hint": "\u7ACB\u5373\u751F\u6548\u4E8E\u540E\u7EED\u8C03\u5EA6\u548C\u6267\u884C\u3002\u79BB\u7EBF\u9519\u8FC7\u7A97\u53E3\u53EA\u7528\u4E8E\u4E3B\u673A\u672A\u8FD0\u884C\u65F6\u7684\u5386\u53F2\u89E6\u53D1\uFF1B\u6392\u961F\u4FDD\u8D28\u671F\u4E3A 0 \u65F6\uFF0C\u5DF2\u5165\u961F\u4EFB\u52A1\u4F1A\u8DE8\u91CD\u542F\u4FDD\u7559\u3002",
  "set.schedule.concurrent": "\u6700\u5927\u5E76\u53D1\u6267\u884C\u6570\uFF081\u2013100\uFF09",
  "set.schedule.missedAfter": "\u79BB\u7EBF\u9519\u8FC7\u8D85\u65F6\u540E\u4E0D\u8865\u4EFB\u52A1\uFF08\u5206\u949F\uFF0C1\u20131440\uFF09",
  "board.queue.chip": "\u6392\u961F{n}",
  "queue.panel.title": "\u6267\u884C\u961F\u5217",
  "queue.depth": "\u6392\u961F\u6570",
  "queue.wait": "\u6700\u4E45\u7B49\u5F85",
  "queue.clear": "\u6E05\u7A7A\u961F\u5217",
  "queue.confirm": "\u518D\u6B21\u786E\u8BA4\u6E05\u7A7A",
  "queue.cleared": "\u5DF2\u6E05\u7A7A {n} \u4E2A\u6392\u961F\u4EFB\u52A1\u3002",
  "set.schedule.queueMaxAge": "\u6392\u961F\u4FDD\u8D28\u671F\uFF08\u5206\u949F\uFF0C0=\u6C38\u4E0D\u4E22\u5F03\uFF0C\u6700\u5927 10080\uFF09",
  "set.schedule.dispatchInterval": "\u5B9A\u65F6\u4F1A\u8BDD\u542F\u52A8\u95F4\u9694\uFF08\u6BEB\u79D2\uFF0C\u9ED8\u8BA4 1000\uFF1B0=\u4E0D\u8282\u6D41\uFF0C\u6700\u5927 60000\uFF09",
  "set.schedule.invalid": "\u8BF7\u8F93\u5165\u8303\u56F4\u5185\u7684\u6574\u6570\u540E\u518D\u4FDD\u5B58\u3002",
  "set.completedLimit.heading": "\u5DF2\u5B8C\u6210\u4EFB\u52A1\u5C55\u793A",
  "set.completedLimit.hint": "\u9650\u5236\u770B\u677F\u300C\u5DF2\u5B8C\u6210\u300D\u5217\u6E32\u67D3\u7684\u6700\u5927\u5361\u7247\u6570\u91CF\uFF0C\u907F\u514D\u5386\u53F2\u4EFB\u52A1\u8FC7\u591A\u5BFC\u81F4\u5361\u987F\u3002\u8D85\u51FA\u90E8\u5206\u6298\u53E0\u9690\u85CF\uFF0C\u53EF\u5728\u5217\u5E95\u5C55\u5F00\u67E5\u770B\uFF0C\u5168\u5C40\u641C\u7D22\u65F6\u81EA\u52A8\u5C55\u793A\u5168\u90E8\uFF08\u8303\u56F4 10\u2013500\uFF0C\u9ED8\u8BA4 50\uFF09\u3002",
  "set.completedLimit.label": "\u5DF2\u5B8C\u6210\u4EFB\u52A1\u5C55\u793A\u4E0A\u9650\uFF0810\u2013500\uFF09",
  "board.done.folded": "\u5DF2\u6298\u53E0\u8F83\u65E9\u7684 {n} \u6761\u5DF2\u5B8C\u6210\u4EFB\u52A1",
  "board.done.expandAll": "\u5C55\u5F00\u5168\u90E8",
  "board.done.collapse": "\u6536\u8D77",
  "board.done.showing": "\uFF08\u5C55\u793A\u6700\u8FD1 {n} \u6761\uFF09",
  "board.column.collapseDone": "\u6536\u8D77\u300C\u5DF2\u5B8C\u6210\u300D\u5217",
  "board.column.expandDone": "\u5C55\u5F00\u300C\u5DF2\u5B8C\u6210\u300D\u5217",
  "board.workspace.expand": "\u5C55\u5F00 {name} \u7684\u4EFB\u52A1",
  "board.workspace.collapse": "\u6536\u8D77 {name} \u7684\u4EFB\u52A1",
  "board.workspace.unassigned": "\u672A\u5206\u914D\u5DE5\u4F5C\u533A",
  "card.badge.permReadOnly": "\u{1F512} \u4EC5\u67E5\u770B",
  "card.badge.permReadOnlyTitle": "\u6743\u9650\uFF1A\u4EC5\u53EF\u67E5\u770B",
  "card.badge.permFull": "\u26A1 \u5168\u6743\u9650",
  "card.badge.permFullTitle": "\u6743\u9650\uFF1A\u5B8C\u5168\u6743\u9650",
  "detail.chip.permReadOnly": "\u4EC5\u53EF\u67E5\u770B",
  "detail.chip.permFull": "\u5B8C\u5168\u6743\u9650",
  "detail.chip.permWrite": "\u53EF\u5199\u5165\u5DE5\u4F5C\u533A",
  "tpl.meta.permReadOnly": "\u4EC5\u67E5\u770B",
  "tpl.meta.permFull": "\u5168\u6743\u9650",
  // ── markdown lightbox (PR #14) ────────────────────────────────────
  "md.imageAlt": "\u56FE\u7247 {n}",
  "md.imageTitle": "\u70B9\u51FB\u67E5\u770B\u5927\u56FE ({alt})",
  "md.lightboxAlt": "\u5927\u56FE\u9884\u89C8",
  "md.closePreview": "\u5173\u95ED\u9884\u89C8",
  "image.add": "\u63D2\u5165\u56FE\u7247",
  "image.uploading": "\u6B63\u5728\u4E0A\u4F20\u2026",
  "image.hint": "\u652F\u6301\u9009\u62E9\u3001\u7C98\u8D34\u6216\u62D6\u5165 PNG/JPEG/GIF/WebP\uFF0C\u5355\u5F20\u4E0D\u8D85\u8FC7 5 MB",
  "image.defaultAlt": "\u56FE\u7247",
  // ── slash completion popup (PR #14) ───────────────────────────────
  "slash.aria": "\u5FEB\u6377\u547D\u4EE4\u4E0E\u6280\u80FD",
  "slash.title": "\u5FEB\u6377\u547D\u4EE4\u4E0E\u6280\u80FD\u8865\u5168",
  "slash.hint": "\u2191\u2193 \u9009\u62E9 \xB7 Enter / Tab \u786E\u8BA4 \xB7 Esc \u5173\u95ED",
  "slash.badge.command": "\u26A1 \u547D\u4EE4",
  "slash.badge.skill": "\u{1F9E9} \u6280\u80FD",
  "slash.tipA": "\u{1F4A1} \u8F93\u5165",
  "slash.tipB": "\u53EF\u5FEB\u901F\u8865\u5168 Slash \u547D\u4EE4\u4E0E Agent \u6280\u80FD",
  "slash.cmd.goal.desc": "\u81EA\u4E3B\u5B8C\u6210\u957F\u671F\u76EE\u6807\u4EFB\u52A1\uFF0C\u6301\u7EED\u6DF1\u5EA6\u63A8\u8FDB",
  "slash.cmd.goal.hint": "<\u76EE\u6807\u63CF\u8FF0>",
  "slash.cmd.schedule.desc": "\u8BBE\u7F6E\u4E00\u6B21\u6027\u5B9A\u65F6\u6216\u5468\u671F\u6027 Cron \u8C03\u5EA6",
  "slash.cmd.schedule.hint": "<\u65F6\u95F4/\u8868\u8FBE\u5F0F>",
  "slash.cmd.plan.desc": "\u5728\u884C\u52A8\u524D\u5236\u5B9A\u5206\u6B65\u5B9E\u65BD\u8BA1\u5212\u5E76\u7531\u7528\u6237\u786E\u8BA4",
  "slash.cmd.browser.desc": "\u542F\u52A8\u7F51\u9875\u6D4F\u89C8\u5668\u4EA4\u4E92\u4E0E\u5B9E\u65F6\u9875\u9762\u68C0\u7D22",
  "slash.cmd.grill-me.desc": "\u901A\u8FC7\u591A\u8F6E\u5355\u9898\u8BBF\u8C08\u6DF1\u5165\u5BF9\u9F50\u9700\u6C42\u4E0E\u8BBE\u8BA1\u610F\u56FE",
  "slash.cmd.teamwork-preview.desc": "\u591A\u667A\u80FD\u4F53\u534F\u4F5C\u4E0E\u56E2\u961F\u5DE5\u4F5C\u6D41\u9884\u89C8",
  "slash.cmd.learn.desc": "\u6C89\u6DC0\u89E3\u51B3\u7ECF\u9A8C\u4E0E\u65B0\u89C4\u5219\u5230\u77E5\u8BC6\u5E93",
  "slash.cmd.review.desc": "\u591A\u7EF4\u5EA6\u4EE3\u7801\u5BA1\u67E5\uFF08\u6B63\u786E\u6027\u3001\u67B6\u6784\u4E0E\u5B89\u5168\uFF09",
  "slash.cmd.security.desc": "\u5B89\u5168\u52A0\u56FA\u4E0E\u4EE3\u7801\u6F0F\u6D1E\u626B\u63CF",
  "slash.cmd.permission.desc": "\u5207\u6362\u5F53\u524D\u4F1A\u8BDD\u6743\u9650\u7EA7\u522B (read-only / workspace-write / full-access)",
  "slash.cmd.permission.hint": "<preset>",
  "slash.skill.frontend-ui-engineering": "\u6784\u5EFA\u751F\u4EA7\u7EA7\u3001\u53EF\u8BBF\u95EE\u7684\u9AD8\u54C1\u8D28\u524D\u7AEF\u754C\u9762\u4E0E\u7EC4\u4EF6",
  "slash.skill.api-and-interface-design": "\u8BBE\u8BA1\u7A33\u5B9A\u5951\u7EA6\u3001\u6E05\u6670\u8FB9\u754C\u7684 REST / RPC \u63A5\u53E3",
  "slash.skill.test-driven-development": "\u6D4B\u8BD5\u9A71\u52A8\u5F00\u53D1\uFF08TDD\uFF09\uFF0C\u7F16\u5199\u5355\u5143\u4E0E\u96C6\u6210\u6D4B\u8BD5",
  "slash.skill.debugging-and-error-recovery": "\u7CFB\u7EDF\u5316\u5B9A\u4F4D Bug \u6839\u56E0\u5E76\u6062\u590D\u9519\u8BEF",
  "slash.skill.performance-optimization": "\u524D\u540E\u7AEF\u6027\u80FD\u8C03\u4F18\u3001\u51CF\u5C11\u6E32\u67D3\u5F00\u9500\u4E0E\u67E5\u8BE2\u4F18\u5316",
  "slash.skill.ci-cd-and-automation": "\u81EA\u52A8\u5316\u6784\u5EFA\u3001CI/CD \u6D41\u6C34\u7EBF\u4E0E\u8D28\u91CF\u95E8\u7981",
  "slash.skill.code-review-and-quality": "\u591A\u8F74\u5411\u4EE3\u7801\u5BA1\u67E5\u4E0E\u91CD\u6784\u6307\u5BFC",
  "slash.skill.code-simplification": "\u7CBE\u7B80\u590D\u6742\u903B\u8F91\uFF0C\u63D0\u5347\u53EF\u8BFB\u6027\u4E0E\u53EF\u7EF4\u62A4\u6027",
  "slash.skill.context-engineering": "\u4F18\u5316\u4E0A\u4E0B\u6587\u7ED3\u6784\u4E0E\u63D0\u793A\u8BCD\u5DE5\u7A0B",
  "slash.skill.doubt-driven-development": "\u4EE5\u6000\u7591\u9A71\u52A8\u7684\u5BF9\u6297\u5F0F\u5BA1\u67E5\uFF0C\u786E\u4FDD\u6838\u5FC3\u903B\u8F91\u6B63\u786E",
  "slash.skill.git-workflow-and-versioning": "Git \u5DE5\u4F5C\u6D41\u3001\u5206\u652F\u7BA1\u7406\u3001\u8BED\u4E49\u5316\u7248\u672C\u4E0E\u53D8\u66F4\u65E5\u5FD7",
  "slash.skill.idea-refine": "\u901A\u8FC7\u53D1\u6563\u4E0E\u6536\u655B\u601D\u7EF4\u7EC6\u5316\u65B9\u6848\u4E0E\u5047\u8BBE\u68C0\u9A8C",
  "slash.skill.incremental-implementation": "\u5C0F\u6B65\u5FEB\u8DD1\u3001\u589E\u91CF\u4EA4\u4ED8\u591A\u6587\u4EF6\u53D8\u66F4",
  "slash.skill.interview-me": "\u6DF1\u5EA6\u8BBF\u8C08\u6316\u6398\u771F\u5B9E\u610F\u56FE",
  "slash.skill.memory-leak-debugging": "\u6392\u67E5\u8BCA\u65AD JavaScript/Node.js \u5185\u5B58\u6CC4\u6F0F",
  "slash.skill.observability-and-instrumentation": "\u6DFB\u52A0\u65E5\u5FD7\u3001\u6307\u6807\u6253\u70B9\u4E0E\u94FE\u8DEF\u8FFD\u8E2A",
  "slash.skill.planning-and-task-breakdown": "\u5C06\u590D\u6742\u9700\u6C42\u62C6\u89E3\u4E3A\u6709\u5E8F\u53EF\u6267\u884C\u4EFB\u52A1",
  "slash.skill.security-and-hardening": "\u9632\u5FA1\u5B89\u5168\u6F0F\u6D1E\u3001\u8F93\u5165\u8FC7\u6EE4\u4E0E\u9274\u6743\u52A0\u56FA",
  "slash.skill.shipping-and-launch": "\u751F\u4EA7\u53D1\u5E03\u524D\u68C0\u67E5\u6E05\u5355\u4E0E\u56DE\u6EDA\u7B56\u7565",
  "slash.skill.source-driven-development": "\u57FA\u4E8E\u6743\u5A01\u5B98\u65B9\u6587\u6863\u4E0E\u6E90\u7801\u8FDB\u884C\u8BBE\u8BA1\u5B9E\u73B0",
  "slash.skill.spec-driven-development": "\u5728\u7F16\u7801\u524D\u5236\u5B9A\u6E05\u6670\u7684\u6280\u672F\u89C4\u8303",
  "slash.skill.using-agent-skills": "\u53D1\u73B0\u5E76\u52A8\u6001\u8C03\u7528\u667A\u80FD\u4F53\u5404\u9879\u4E13\u4E1A\u6280\u80FD",
  // ── host-generated system comments (0.6.4; localized at render) ────
  "sys.execFailed": "[\u7CFB\u7EDF] \u6267\u884C\u5931\u8D25\uFF1A{error}\uFF1B\u4EFB\u52A1\u5DF2\u9000\u56DE\u5F85\u529E\u3002",
  "sys.endedWithComment": "[\u7CFB\u7EDF] \u6267\u884C\u4F1A\u8BDD\u5DF2\u7ED3\u675F\u5E76\u7559\u6709\u8BC4\u8BBA\uFF0C\u4F46\u672A\u79FB\u81F3\u5F85\u9A8C\u6536\uFF1B\u7CFB\u7EDF\u81EA\u52A8\u79FB\u5165\u5F85\u9A8C\u6536\u3002",
  "sys.endedNoHandoff": "[\u7CFB\u7EDF] \u6267\u884C\u4F1A\u8BDD\u5DF2\u7ED3\u675F\uFF0C\u4F46\u672A\u6309\u534F\u8BAE\u4EA4\u63A5\uFF08\u65E0\u8BC4\u8BBA\u3001\u672A\u79FB\u81F3\u5F85\u9A8C\u6536\uFF09\uFF1B\u7CFB\u7EDF\u81EA\u52A8\u79FB\u5165\u5F85\u9A8C\u6536\uFF0C\u8BF7\u5BA1\u67E5\u540E\u9000\u56DE\u6216\u9A8C\u6536\u3002",
  "sys.sessionError": "[\u7CFB\u7EDF] \u4F1A\u8BDD\u6267\u884C\u5F02\u5E38\uFF1A{error}\uFF1B\u4EFB\u52A1\u5DF2\u9000\u56DE\u5F85\u529E\u3002",
  "sys.sessionDone": "[\u7CFB\u7EDF] \u4F1A\u8BDD\u6267\u884C\u5B8C\u6BD5\uFF0C\u5DF2\u81EA\u52A8\u8FDB\u5165\u5F85\u9A8C\u6536\u3002",
  "sys.cronDead": "[\u7CFB\u7EDF] \u5B9A\u65F6\u8868\u8FBE\u5F0F {cron} \u5728 4 \u5E74\u5185\u6CA1\u6709\u53EF\u89E6\u53D1\u65F6\u95F4\uFF0C\u5DF2\u505C\u7528\u5B9A\u65F6\uFF1B\u8BF7\u4FEE\u6B63 cron \u540E\u91CD\u65B0\u5F00\u542F\u3002",
  "sys.periodicHandoff": "[\u7CFB\u7EDF] \u5B9A\u671F\u4EFB\u52A1\u672C\u8F6E\u6267\u884C\u5B8C\u6BD5\uFF0C\u5B9A\u65F6\u5DF2\u7531\u65B0\u5F85\u529E\u5361 {nextTaskId} \u627F\u63A5\uFF0C\u8BF7\u5BA1\u67E5\u672C\u5361\u540E\u9A8C\u6536\u3002",
  "sys.spawnedFrom": "[\u7CFB\u7EDF] \u5B9A\u671F\u4EFB\u52A1\u4E0A\u4E00\u8F6E\u6267\u884C\u5B8C\u6BD5\uFF08\u6267\u884C {executionId}\uFF09\uFF0C\u672C\u5361\u627F\u63A5\u5B9A\u65F6\u7EE7\u7EED\u4E0B\u4E00\u8F6E\uFF1B\u4E0A\u4E00\u8F6E\u6210\u679C\u89C1 {sourceId} \u7684\u5F85\u9A8C\u6536\u3002",
  "sys.runAtMissed": "[\u7CFB\u7EDF] \u5B9A\u65F6\u6267\u884C\u9519\u8FC7\u89E6\u53D1\u65F6\u95F4\uFF08\u4E3B\u673A\u5F53\u65F6\u672A\u8FD0\u884C\uFF09\uFF0C\u672C\u6B21\u4E0D\u518D\u8865\u8DD1\uFF1B\u53EF\u624B\u52A8\u6267\u884C\u6216\u4FEE\u6539\u5B9A\u65F6\u3002",
  "sys.mergeSingle": "[\u7CFB\u7EDF] \u5206\u652F {branch} \u5DF2\u5408\u5E76\u5230\u4E3B\u5DE5\u4F5C\u533A\uFF08--no-ff\uFF09\u3002",
  "sys.mergeMulti": "[\u7CFB\u7EDF] \u5206\u652F\u5DF2\u6309\u4ED3\u5E93\u5408\u5E76\uFF08--no-ff\uFF09\uFF1A{summary}",
  // ── needs-human & review-desk keys ──
  "card.badge.needsHuman": "\u9700\u4EBA\u5DE5\u4ECB\u5165",
  "card.badge.needsHumanTitle": "\u8BE5\u4EFB\u52A1\u9700\u8981\u4EBA\u7C7B\u64CD\u4F5C\u3001\u51B3\u7B56\u6216\u63D0\u4F9B\u8F93\u5165",
  "card.deliv.changed": "\u4FEE\u6539\u6587\u4EF6",
  "card.deliv.filesUnit": "\u4E2A\u6587\u4EF6",
  "card.deliv.gitFilesChanged": "\u4E2A\u6587\u4EF6\u53D8\u66F4 (Git)",
  "card.deliv.noFilesRecorded": "\u672A\u767B\u8BB0\u6539\u52A8\u6587\u4EF6",
  "card.deliv.acceptance": "\u9A8C\u6536\u6838\u5BF9",
  "card.deliv.checklistProgress": "Checklist {done}/{total}",
  "card.deliv.uncheckedWarn": "\u6709\u672A\u52FE\u9009",
  "card.deliv.checksCount": "\u5DF2\u81EA\u9A8C {n} \u9879",
  "card.deliv.noVerificationWarn": "\u7F3A\u5C11\u81EA\u9A8C/\u9A8C\u6536\u8BB0\u5F55",
  "detail.chip.needsHuman": "\u9700\u4EBA\u7C7B\u64CD\u4F5C/\u5F85\u63D0\u4F9B\u4FE1\u606F",
  "detail.deliv.title": "\u4EA4\u4ED8\u5BA1\u67E5\u4E0E\u9A8C\u6536\u6838\u5BF9\u53F0",
  "detail.deliv.summaryLabel": "\u4EA4\u4ED8\u6210\u679C\u6458\u8981",
  "detail.deliv.missingReport": "\u672A\u63D0\u4EA4\u7ED3\u6784\u5316\u4EA4\u4ED8\u62A5\u544A",
  "detail.deliv.missingHint": "Agent \u5B8C\u6210\u540E\u672A\u63D0\u4EA4\u81EA\u9A8C\u8BC1\u636E\u4E0E\u6539\u52A8\u6E05\u5355\u3002\u8BF7\u6838\u5BF9\u5B9E\u9645\u4EE3\u7801\u53D8\u66F4\u6216\u5728\u4F1A\u8BDD\u4E2D\u7D22\u8981\u81EA\u9A8C\u8BC1\u636E\u540E\u518D\u786E\u8BA4\u5B8C\u6210\u3002",
  "detail.deliv.copyPath": "\u590D\u5236\u8DEF\u5F84",
  "detail.deliv.copy": "\u590D\u5236",
  "detail.deliv.copied": "\u5DF2\u590D\u5236",
  "detail.needsHuman.mark": "\u{1F64B} \u6807\u4E3A\u9700\u4EBA\u4ECB\u5165",
  "detail.needsHuman.unmark": "\u2713 \u89E3\u9664\u9700\u4EBA\u4ECB\u5165",
  "detail.needsHuman.hint": "\u6807\u8BB0\u8BE5\u4EFB\u52A1\u662F\u5426\u6B63\u5728\u5361\u5728\u7B49\u5F85\u4EBA\u7C7B\u8F93\u5165\u3001\u626B\u7801\u3001\u63D0\u4F9B\u51ED\u636E\u6216\u51B3\u7B56",
  "board.filter.needsHuman": "\u5F85\u6211\u5904\u7406",
  "board.filter.needsHumanTitle": "\u4EC5\u5C55\u793A\u9700\u8981\u4EBA\u7C7B\u64CD\u4F5C\u6216\u63D0\u4F9B\u4FE1\u606F\u7684\u4EFB\u52A1"
};

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/i18n/en.ts
var en = {
  "ext.requestInterval": "Minimum request interval (milliseconds, 0 off, maximum 10000)",
  "ext.removeMapping": "Remove project mapping {n}",
  "ext.lastAttempt": "Last sync attempt",
  "set.nav.label": "Settings categories",
  "set.nav.general": "General",
  "set.nav.external": "External sync",
  "ext.usernamePassword": "Username and password",
  "ext.username": "ZenTao login username",
  "ext.reuseLogin": "Sync tasks assigned to this login account",
  "ext.assigneeAccount": "Task assignee account (ZenTao account)",
  "ext.password": "ZenTao login password",
  "ext.heading": "External task sync",
  "ext.hint": "Select a provider, authentication and item types. Import one-way into Backlog or Todo without automatic execution. Connection tests use the current form; task sync uses saved settings.",
  "ext.url": "API base URL (ZenTao: without /api.php/v1)",
  "ext.provider": "Task provider",
  "ext.authMode": "Authentication",
  "ext.itemTypes": "Work item types",
  "ext.type.bug": "Bug",
  "ext.type.story": "Story",
  "ext.type.task": "Task",
  "ext.projectId": "External project ID",
  "ext.apiUser": "API username (not assignee account)",
  "ext.apiPassword": "API password",
  "ext.companyId": "Company ID (required for TAPD project discovery)",
  "ext.terminalStatuses": "Terminal states (raw values, comma-separated)",
  "ext.urgentPriorities": "Urgent priority labels (comma-separated)",
  "ext.relaxedPriorities": "Low priority labels (comma-separated)",
  "ext.manualAccount": "Specify the assignee explicitly: ZenTao account or TAPD member nickname. API credentials do not identify the assignee.",
  "ext.discoverProjects": "Sync project/product list",
  "ext.projectsFound": "Found {count} projects; select one in the project ID field",
  "ext.discoverAccount": "Identify current account",
  "ext.account": "Sync account (exact assignee account)",
  "ext.token": "API Token",
  "ext.tokenSaved": "Saved; leave blank to keep",
  "ext.since": "Earliest creation date (blank for all)",
  "ext.interval": "Auto-sync interval (minutes; 0 off, minimum 5)",
  "ext.importStatus": "Import into",
  "ext.scopeType": "Mapping scope",
  "ext.mappingMode": "Project mapping mode",
  "ext.syncUnmappedProjects": "Sync unlinked projects (unlinked and newly discovered entries are included; new cards have no local project).",
  "ext.syncUnmappedExecutions": "Sync unlinked executions/iterations (unlinked and newly discovered entries are included; new cards have no local project).",
  "ext.syncUnmappedHint": "Unlinked and newly discovered entries are synchronized too. New cards have no local project.",
  "ext.unmappedMappingsFound": "Loaded {count} entries; entries without a local project will also be imported.",
  "ext.linkProject": "Projects",
  "ext.linkExecution": "Executions/iterations",
  "ext.syncScope": "Sync scope",
  "ext.discoverMappings": "Sync project/execution list",
  "ext.loadMappings": "Sync the list, then choose the local project for each entry.",
  "ext.mappingsFound": "Loaded {count} entries. Choose a local project for each; unlinked entries are excluded.",
  "ext.unlinked": "Not linked",
  "ext.scopeUnavailable": "This entry is not readable. Refresh the list or unlink it.",
  "ext.remapRequired": "Reassociate projects or executions/iterations. Existing tasks are retained; old automatic sync is paused.",
  "ext.chooseScope": "Choose a name and ID",
  "ext.syncListFirst": "Sync the list or enter an ID manually",
  "ext.noScopes": "No items found; enter an ID manually",
  "ext.enterScopeId": "Enter ID manually",
  "ext.productScope": "Product (Bugs / Stories)",
  "ext.executionScope": "Execution (Tasks)",
  "ext.executionId": "Execution ID",
  "ext.scopeHint": "Bugs/stories use product mappings; tasks use execution mappings. Sync the list and choose by name and ID, or enter an ID manually. The item types above control actual imports.",
  "ext.importBacklog": "Backlog",
  "ext.importTodo": "Todo",
  "ext.product": "Product ID",
  "ext.workspace": "Local project",
  "ext.addMapping": "Add mapping",
  "ext.save": "Save configuration",
  "ext.unsavedChanges": "You have unsaved changes. Save configuration before syncing tasks. Connection tests and scope discovery still use the current form.",
  "ext.test": "Test connection",
  "ext.sync": "Sync now",
  "ext.clearIgnored": "Clear all import exclusions",
  "ext.busy": "Working\u2026",
  "ext.cancel": "Stop sync",
  "ext.success": "Operation succeeded",
  "ext.result": "Created {created} \xB7 Updated {updated} \xB7 Unchanged {unchanged} \xB7 Conflicts {conflicts} \xB7 Ignored {ignored}",
  "ext.source": "External source",
  "ext.status": "External status",
  "ext.synced": "Source change synced at",
  "ext.conflict": "External update for {field}; choose content after execution finishes",
  "ext.accept": "Use external content",
  "ext.keep": "Keep local content",
  "ext.field.title": "Title",
  "ext.field.description": "Description",
  "ext.field.urgency": "Priority",
  // ── shared vocabulary ──────────────────────────────────────────────
  "shared.close": "Close",
  "shared.cancel": "Cancel",
  "shared.loading": "Loading\u2026",
  "shared.blocked": "Blocked",
  "shared.permission": "Permission",
  "shared.confirmDelete": "Delete",
  "shared.current": " (current: {name})",
  "shared.entry.aria": "Agent task board",
  "shared.entry.label": "Task board",
  "shared.stats.title": "To do {todo} | In progress {doing} | In review {review} (todo | in progress | in review)",
  "shared.duplicate.suffix": " (copy)",
  // ── status / urgency / outcome enums (labels.ts) ──────────────────
  "status.column.backlog": "Backlog",
  "status.column.todo": "To do",
  "status.column.in_progress": "In progress",
  "status.column.in_review": "In review",
  "status.column.done": "Done",
  "status.column.canceled": "Canceled",
  "status.column.archived": "Archived",
  "status.pill.backlog": "Planned",
  "status.pill.todo": "To do",
  "status.pill.in_progress": "In progress",
  "status.pill.in_review": "In review",
  "status.pill.done": "Done",
  "status.pill.canceled": "Canceled",
  "status.pill.archived": "Archived",
  "status.move.backlog": "Backlog",
  "status.move.todo": "To do",
  "status.move.in_progress": "In progress",
  "status.move.in_review": "In review",
  "status.move.done": "Done",
  "status.move.canceled": "Canceled",
  "status.move.archived": "Archived",
  "urgency.urgent": "Urgent",
  "urgency.normal": "Normal",
  "urgency.relaxed": "Relaxed",
  "outcome.running": "Running",
  "outcome.succeeded": "Succeeded",
  "outcome.failed": "Failed",
  "outcome.cancelled": "Canceled",
  // ── board toolbar & columns (TaskBoard) ───────────────────────────
  "board.title": "Agent Task Board",
  "board.count.tasks": "{n} tasks \xB7 rev {rev}",
  "board.action.newTask": "+ New Task \u25BC",
  "board.action.blankTask": "Blank task",
  "board.action.manageTemplates": "\u2317 Manage templates\u2026",
  "board.search.placeholder": "Search title / ID\u2026",
  "board.filter.allProjects": "All projects",
  "board.sort.title": "Sort within columns",
  "board.sort.default": "Default order",
  "board.sort.updated": "Recently updated",
  "board.sort.urgency": "By urgency",
  "board.sort.created": "Creation time",
  "board.sort.byTitle": "By title",
  "board.action.backToBoard": "Back to board",
  "board.action.otherTasks": "Other tasks",
  "board.action.settingsTitle": "Board settings: default execution isolation for new tasks, etc.",
  "board.action.settings": "\u{1F6E0} Settings",
  "board.action.diagTitle": "Health diagnostics: orphan worktrees, ledger basics",
  "board.action.diag": "\u2699 Diagnostics",
  "board.action.importTitle": "Import the ledger from a JSON backup (preview, then merge or replace)",
  "board.action.import": "\u2B06 Import",
  "board.action.exportTitle": "Export the ledger: full JSON backup or task-list CSV",
  "board.action.export": "\u2B07 Export \u25BC",
  "board.export.jsonTitle": "Full ledger backup (execution history and board settings included); import it to restore",
  "board.export.json": "Full ledger (JSON)",
  "board.export.csvTitle": "Task-list spreadsheet (opens directly in Excel; BOM added for CJK text)",
  "board.export.csv": "Task list (CSV)",
  "board.drag.forbidden": 'Cannot drag from "{from}" to "{to}"',
  "board.empty": "No tasks",
  "board.secondary.empty": "No canceled / archived / deleted tasks",
  "board.group.trashed": "Deleted",
  "board.batch.trashArchived": "Batch delete",
  "board.batch.trashArchivedTip": "Enter selection mode, then batch-mark picked cards for purge",
  "board.batch.purgeTrashed": "Batch purge",
  "board.batch.purgeTrashedTip": "Enter selection mode, then physically purge picked cards; irreversible",
  "board.batch.confirm": "Confirm",
  "board.batch.confirmTip": "Confirm the batch operation on the selected cards",
  "board.batch.confirmCancelTip": "Cancel this batch operation",
  "board.batch.cancel": "Cancel",
  "board.batch.noneSelected": "Select cards first",
  "board.batch.selectAll": "Select all / none",
  // ── diagnostics panel (TaskBoard) ─────────────────────────────────
  "diag.title": "Health diagnostics",
  "diag.subtitle": "Ledger basics and orphan-worktree cleanup",
  "diag.revision": "Ledger revision",
  "diag.tasks": "Total tasks",
  "diag.running": "Running",
  "diag.orphans": "Orphan worktrees",
  "diag.orphans.heading": "Orphan worktrees (no owning task, directory still present)",
  "diag.orphans.none": "None \u2014 every project\u2019s .dsh-worktrees directory is clean",
  "diag.orphans.cleanup": "Clean up",
  "diag.orphans.hint": "Note: orphan directories with uncommitted changes are refused; handle their contents manually first. Remove a live task\u2019s worktree from its task detail pane.",
  "diag.gitignore.heading": "gitignore suggestions",
  "diag.gitignore.none": "Nothing to do \u2014 every git project already ignores .dsh-worktrees",
  "diag.gitignore.suggestA": "suggests adding one line to .gitignore:",
  "diag.gitignore.suggestB": "(no automatic edits)",
  // ── task card (TaskCard) ──────────────────────────────────────────
  "card.drag.running": "This task is being executed by a session ({title}) and cannot be dragged",
  "card.badge.stale": "\u23F1 Claim stale",
  "card.badge.modelTitle": "Pinned model: {model}",
  "card.badge.modelEffort": " \xB7 reasoning effort: {effort}",
  "card.badge.checklistReview": "In review: checklist has unchecked items",
  "card.badge.checklist": "Acceptance checklist progress",
  "card.badge.pendingPurge": "Pending purge",
  "card.session.jumpTitle": "Click to jump to the session: {id}",
  "card.session.badge": "Session: {id}",
  "card.session.tagTitle": "Associated session: {id} (click to jump)",
  "card.session.tagTitleWithTitle": "Associated session: {title} ({id}, click to jump)",
  "card.session.missing": "The session has been deleted ({id}) and cannot be opened",
  "card.session.archived": "The session is archived ({id}) and hidden from the session list",
  "card.session.unavailable": "Session navigation unavailable; session id: {id}",
  "card.reject.placeholder": "Reason for sending back (optional; the agent reads it before starting)\u2026",
  "card.reject.confirm": "Send back to todo",
  "card.action.doneTitle": "Accept and complete: move to Done",
  "card.action.done": "\u2713 Done",
  "card.action.rejectTitle": "Send back to todo, optionally with a reason",
  "card.action.reject": "\u2717 Send back",
  // ── alert modal ───────────────────────────────────────────────────
  "alert.ok": "Got it",
  // ── diff view (TaskDetail) ────────────────────────────────────────
  "diff.commit": "Commit {hash}",
  "diff.file": "File {path}",
  "diff.truncated": "\u26A0 Content truncated (too long)",
  "diff.failed": "Failed to fetch (see the error bar at the top of the board; the object may be gone with a removed worktree)",
  // ── checklist block (TaskDetail) ──────────────────────────────────
  "checklist.title": "Acceptance checklist (DoD)",
  "checklist.unchecked": " \xB7 {n} unchecked",
  "checklist.allDone": " \xB7 all done",
  "checklist.byUser": "\u{1F464} User",
  "checklist.uncheckedItem": "Unchecked",
  "checklist.evidence": "Evidence: {note}",
  // ── execution report block (TaskDetail) ───────────────────────────
  "report.title": "Execution report",
  "report.submitted": "Submitted by the execution session \xB7 {time}",
  "report.changedFiles": "Changed files",
  "report.checks": "Self-verification",
  "report.artifacts": "Artifacts",
  "report.risk": "Remaining risks",
  // ── isolation block (TaskDetail) ──────────────────────────────────
  "iso.title": "Execution isolation",
  "iso.none": "\u{1F4C1} Run in the original directory",
  "iso.worktreeTitle": "Execution isolation \xB7 Worktree",
  "iso.branch": "\u{1F33F} Branch",
  "iso.baseline": "Baseline {base} \u2192 {head}",
  "iso.changed": "{n} files changed",
  "iso.commit.openTitle": "Click to expand this commit\u2019s diff",
  "iso.commits.more": "\u2026 {n} commits in total",
  "iso.nocommit": "This execution produced no commits (changes may be uncommitted \u2014 see the warning below)",
  "iso.dirty.toggle": "\u26A0 {n} uncommitted changes (have the agent commit before merging, or handle them manually)",
  "iso.dirty.expand": " \u25BC view files",
  "iso.dirty.collapse": " \u25B2",
  "iso.dirty.openTitle": "Click to view the uncommitted diff of this file",
  "iso.dirty.more": "\u2026 {n} in total (full list in the task ledger)",
  "iso.hint.running": "Running \u2014 merge or clean up after it ends",
  "iso.merge.confirm": "Merge the branch into the main worktree with --no-ff?",
  "iso.merge.go": "Merge",
  "iso.merge.title": "git merge --no-ff the task branch into the main worktree (requires a clean main worktree; conflicts are reported as-is)",
  "iso.merge.button": "\u21E5 Merge into main worktree",
  "iso.merge.failed": "Merge failed: {error}",
  "iso.merge.noop": "The branch has no commits ahead of the main worktree \u2014 nothing to merge (send it back to continue running, or clean it up)",
  "iso.merge.done": "Merged per repo (--no-ff): {summary}",
  "iso.merge.partial": "Some repos failed to merge: {summary}\n{error}",
  "iso.repo.root": "Root repo",
  "iso.remove.wt": "\u{1F5D1} Remove worktree",
  "iso.remove.wtTitle": "git worktree remove (refused when uncommitted changes exist)",
  "iso.remove.wtb": "\u{1F5D1} Remove worktree + branch",
  "iso.remove.wtbTitle": "Remove the worktree and delete the task branch (refused when uncommitted changes exist)",
  "iso.remove.confirmWt": "Remove the worktree directory?",
  "iso.remove.confirmWtb": "Remove the worktree and delete the branch?",
  "iso.remove.failed": "Removal failed: {error}",
  "iso.remove.branchFailed": "Worktree removed, but branch deletion failed: {error}",
  "iso.hint.keep": "Branch and worktree kept \u2014 send back to continue editing",
  // ── detail pane (TaskDetail) ──────────────────────────────────────
  "detail.session.jumpTitle": "Jump to the corresponding session: {id}",
  "detail.session.jump": "\u{1F916} Jump to session \u2197",
  "detail.action.edit": "\u270E Edit",
  "detail.action.duplicateTitle": "Duplicate this task\u2019s full configuration as a new card (todo column)",
  "detail.action.duplicate": "\u29C9 Duplicate",
  "detail.action.saveTplTitle": "Save this task\u2019s configuration (checklist included) as a template for new tasks",
  "detail.action.saveTplDone": "Saved as a template (available in the New Task \u25BC menu; rename it in template management)",
  "detail.action.saveTpl": "\u2317 Save as template",
  "detail.action.reuseTitle": 'Reuse-run: keep the existing worktree and branch (last run\u2019s changes and commits stay in place) and continue on top of them; the default "Run" resets to a fresh baseline',
  "detail.action.reuse": "\u21BB Reuse-run",
  "detail.action.runTitleModel": "Run in a new session ({model})",
  "detail.action.runTitleDefault": "Run in a new session (default model)",
  "detail.action.run": "\u25B6 Run",
  "detail.action.stopConfirm": "Stop this execution session?",
  "detail.action.stop": "Stop",
  "detail.action.stopTitle": "Stop execution session {id} (the task returns to todo)",
  "detail.action.stopExec": "\u25A0 Stop execution",
  "detail.chip.nextRun": "{cron} \xB7 next {time}",
  "detail.chip.queuedRun": "Queued \xB7 due {time}",
  "detail.chip.checklist": "Checklist {done}/{total}",
  "detail.chip.isolated": "Worktree isolation",
  "detail.chip.holderTitle": "Click to jump to the session: {id}",
  "detail.chip.holderStale": "Claim stale \xB7 ",
  "detail.chip.holderBy": "Held by ",
  "detail.chip.holderSuffix": " \u2197",
  "detail.chip.trashed": "Deleted, pending purge",
  "detail.sub.line": "Updated {time} \xB7 last change by {who}",
  "detail.updatedBy.system": "\u2699\uFE0F System",
  "detail.updatedBy.user": "\u{1F464} User",
  "detail.field.description": "Description",
  "detail.field.prompt": "Execution prompt",
  "detail.move.to": "Move to \u2192 {status}",
  "detail.move.confirmDoneUnchecked": "{n} checklist items are still unchecked \u2014 confirm done?",
  "detail.move.confirmDone": "Confirm done?",
  "detail.move.confirmArchive": "Confirm archive this task?",
  "detail.move.confirmArchiveSessionWithId": "Archive execution session {id} together?",
  "detail.move.confirmArchiveSessionCount": "Archive {n} execution sessions together?",
  "detail.move.archiveWithSession": "With session",
  "detail.move.archiveUnsupported": "Session archiving is unavailable on this host",
  "detail.move.archiveResult": "Card archived; {n} execution sessions archived. Failed sessions, if any:",
  "detail.move.archiveRetry": "Archive / retry execution sessions",
  "detail.move.archiveCardOnly": "Card only",
  "detail.move.confirm": "Confirm",
  "detail.blocked.unmark": "\u2713 Unblock",
  "detail.blocked.mark": "\u26D4 Mark blocked",
  "detail.release.title": "Release {id}\u2019s claim: the task returns to todo (the holding session may still be working \u2014 make sure it has stopped first)",
  "detail.release.button": "\u{1F513} Release claim",
  "detail.comments.title": "Comments",
  "detail.comments.empty": "No comments yet \u2014 the agent reports changes and verification here at handoff",
  "detail.comments.user": "User",
  "detail.composer.placeholder": "Leave a comment as the user (the agent reads it before starting)\u2026",
  "detail.composer.send": "Post",
  "detail.exec.title": "Executions",
  "detail.exec.prunedTitle": "{n} older execution records were pruned at the retention cap",
  "detail.exec.pruned": "+{n} pruned",
  "detail.exec.trigger.manual": "Manual",
  "detail.exec.trigger.scheduled": "Scheduled",
  "detail.exec.openTitle": "Click to open the execution session: {id}",
  "detail.danger.delete": "\u{1F5D1} Delete (mark for purge)",
  "detail.danger.purgeConfirm": "Physical purge is irreversible",
  "detail.danger.purgeGo": "Purge",
  "detail.danger.purge": "\u{1F525} Purge physically (confirm required)",
  // ── task form modal (TaskFormModal) ───────────────────────────────
  "form.title.create": "New task",
  "form.title.edit": "Edit task",
  "form.subtitle.create": "Push onto the board; sessions in the project can claim and run it",
  "form.subtitle.edit": "Adjust the task content and execution configuration",
  "form.field.title": "Title",
  "form.field.titlePlaceholder": "One line: what should be done",
  "form.field.project": "Project",
  "form.field.model": "Model (default = session default model)",
  "form.field.modelDefault": "Default model",
  "form.model.option": "{name} ({provider})",
  "form.field.effort": "Reasoning effort",
  "form.field.effortTitle": "Set the model\u2019s reasoning effort (e.g. low/medium/high); default = follow the model/provider default",
  "form.effort.follow": "Follow model default",
  "form.effort.low": "Low (low)",
  "form.effort.medium": "Medium (medium)",
  "form.effort.high": "High (high)",
  "form.effort.none": "Off (none)",
  "form.field.preset": "Execution preset",
  "form.field.presetTitle": "The execution session is composed from this preset (tool set and persona); default = the deployment default preset",
  "form.preset.follow": "Follow deployment default",
  "form.preset.defaultTag": " (deployment default)",
  "form.field.urgency": "Urgency",
  "form.urgency.urgent": "Urgent",
  "form.urgency.normal": "Normal",
  "form.urgency.relaxed": "Relaxed",
  "form.field.description": "Description",
  "form.field.descriptionOptional": "Description (optional)",
  "form.desc.placeholder": "Requirement details, background, acceptance criteria\u2026",
  "form.field.prompt": "Execution prompt (the actual prompt = title + description + prompt)",
  "form.field.promptOptional": "Execution prompt (optional; the actual prompt = title + description + prompt)",
  "form.prompt.placeholder": 'Extra instructions appended after "title + task description" and sent to the execution session. Template variables: {{lastExecution}} (last execution result), {{lastComments}} (latest 3 comments)',
  "form.field.mode": "Execution mode",
  "form.mode.claim": "\u{1F91D} Claim-based",
  "form.mode.claimHint": "Sessions in the project claim it",
  "form.mode.once": "\u23F0 One-shot",
  "form.mode.onceHint": "Runs once at a set time",
  "form.mode.periodic": "\u{1F501} Periodic",
  "form.mode.periodicHint": "Repeats on a cron schedule",
  "form.field.runAt": "Trigger time",
  "form.mode.scheduled": "\u23F0 Scheduled",
  "form.mode.scheduledHint": "Starts automatically on schedule",
  "form.field.cron": "Cron expression",
  "form.cron.placeholder": "min hour day month weekday",
  "form.cron.daily": "Daily 09:00",
  "form.cron.hourly": "Hourly",
  "form.cron.every10min": "Every 10 minutes",
  "form.cron.weekly": "Mondays 09:00",
  "form.cron.next": "Next {time}",
  "form.field.periodicCompletion": "After periodic completion",
  "form.periodicCompletion.rearm": "Return to todo",
  "form.periodicCompletion.rearmHint": "The host re-arms this card for the next cron window",
  "form.periodicCompletion.spawn": "Create a new todo (default)",
  "form.periodicCompletion.spawnHint": "Keeps this round in review and creates the next todo card",
  "form.field.isolation": "Execution isolation",
  "form.field.reuseSession": "Reuse session",
  "form.session.new": "New session",
  "form.session.fresh": "New session every time",
  "form.session.reuse": "Create first, then reuse",
  "form.session.unavailable": "Could not load sessions; reopen this form to retry",
  "form.session.missing": "Selected session is unavailable in this project",
  "form.iso.locked": "The task has execution history; isolation is locked",
  "form.iso.lockedShort": "Locked (cannot change once execution has started)",
  "form.iso.nonGit": "This project is not a git repository",
  "form.iso.worktree": "\u{1F33F} Worktree isolation",
  "form.iso.worktreeTitle": "Each execution runs on its own worktree branch",
  "form.iso.worktreeHint": "Isolated branch task/title+ID, no cross-contamination",
  "form.iso.none": "\u{1F4C1} Run in the project directory",
  "form.iso.noneTitle": "Run directly in the project directory (no git)",
  "form.iso.noneHintNonGit": "Not a git repository; will run in the project directory",
  "form.iso.noneHint": "No git; works directly in the project directory",
  "form.iso.nonGitNote": "This project is not a git repository; the task will run in its directory (still created with the default configuration; the runtime degrades automatically)",
  "form.iso.mirrorNote": "Multi-repo workspace: worktree isolation automatically mirrors all {n} repos \u2014 one task branch each, merged per repo at acceptance",
  "form.field.checklist": "Acceptance checklist (DoD)",
  "form.field.checklistOptional": "Acceptance checklist (DoD, optional)",
  "form.check.itemPlaceholder": "Checklist item {n} (definition of done)",
  "form.check.removeTitle": "Remove this checklist item",
  "form.check.add": "\uFF0B Add checklist item",
  "form.check.checkedTitle": "Checked state is preserved on save (currently checked by: {who})",
  "form.check.notCheckedYet": "not checked yet",
  "form.check.hintCreate": "{n} items; the execution session works through them and checks each off; unfinished items are highlighted at review",
  "form.check.hintEdit": "{checked}/{total} checked (saving replaces the whole list; checked state is preserved)",
  "form.hint.needTitle": "Enter a title",
  "form.hint.needProject": "Select a project",
  "form.hint.cronBad": "Invalid cron expression (min hour day month weekday)",
  "form.hint.runAtBad": "Pick a future trigger time",
  "form.hint.nextRun": "Next run {time}",
  "form.hint.onceAt": "Fires once at {time}",
  "form.hint.saveVersion": "On save: v{v} \u2192 v{next}",
  "form.hint.createClaim": "After creation, sessions in the project can claim and run it",
  "form.action.runBlockedTitle": "The task is running; cannot start another",
  "form.action.runBusyTitle": "Submitting\u2026",
  "form.action.runTitle": "Save, then immediately start an execution (new session)",
  "form.action.run": "\u26A1 Run now",
  "form.action.save": "Save changes",
  "form.action.create": "Create task",
  // ── template manager (TemplateManager) ────────────────────────────
  "tpl.aria": "Manage templates",
  "tpl.title": "Task templates",
  "tpl.subtitle": 'Templates from the New Task \u25BC menu: rename / categorize / delete / use directly; "Save as template" in the task detail pane adds new ones',
  "tpl.empty": 'No templates yet \u2014 click "Save as template" in a task detail pane to capture a common configuration',
  "tpl.name.aria": "Template name {name}",
  "tpl.category.aria": "Template category {name}",
  "tpl.category.placeholder": "Type or choose a category\u2026",
  "tpl.category.default": "Others",
  "tpl.builtin": "Built-in",
  "tpl.custom": "Custom",
  "tpl.meta.checklist": " \xB7 {n} checklist items",
  "tpl.rename.title": "Save name & category",
  "tpl.rename.button": "Rename",
  "tpl.use.title": "Open the new-task form with this template",
  "tpl.use.button": "Use",
  "tpl.delete.title": "Delete this template",
  "tpl.updated": "Template updated",
  "tpl.foot.hint": "Templates are stored with the ledger in the active data directory and survive upgrades",
  // ── import modal (ImportModal) ────────────────────────────────────
  "imp.aria": "Import ledger",
  "imp.title": "Import ledger",
  "imp.subtitle": "Pick an exported JSON backup: preview first, then merge or replace everything",
  "imp.parseError": "The file is not valid JSON",
  "imp.note": "The \u2B07 JSON export restores the ledger. Back up the dsh-taskboard-assets folder in the data directory shown in Settings as well. The file\u2019s schemaVersion must match the current version.",
  "imp.previewing": "Previewing\u2026",
  "imp.stat.create": "New",
  "imp.stat.overwrite": "Overwrite (same id)",
  "imp.stat.invalid": "Invalid (skipped)",
  "imp.sec.create": "New tasks",
  "imp.sec.overwrite": "Overwritten tasks (whole-card replacement, execution history and comments included)",
  "imp.sec.invalid": "Invalid entries (not imported)",
  "imp.noId": "(no id)",
  "imp.mode.merge": "\u2295 Merge",
  "imp.mode.mergeHint": "Adds new + overwrites by id; everything else untouched",
  "imp.mode.replace": "\u{1F4A3} Replace all",
  "imp.mode.replaceHint": "Clears the current ledger and adopts the imported file (automatic backup first)",
  "imp.result.replace": "Replace complete: imported {n} tasks ({total} former tasks backed up)",
  "imp.result.merge": "Merge complete: {n} added, {m} overwritten",
  "imp.foot.replaceConfirm": "\u26A0 Click again to confirm the full replacement (irreversible; a backup has been taken)",
  "imp.foot.replaceNeedConfirm": "Full replacement requires a second confirmation",
  "imp.foot.mergeHint": "Merge writes only the tasks listed in the preview",
  "imp.action.run": "Import",
  "imp.action.confirmReplace": "Confirm replace",
  // ── board settings modal (SettingsModal) ──────────────────────────
  "set.aria": "Board settings",
  "set.title": "Board settings",
  "set.subtitle": "New-task defaults, scheduling, session sync, and local data storage",
  "set.agent.heading": "Default model and Agent preset",
  "set.agent.hint": "New tasks only: explicit task or template choices take priority. Existing tasks are unchanged. Reasoning effort is saved with the model and resets when switching models.",
  "set.agent.model": "Default model",
  "set.agent.effort": "Default reasoning effort",
  "set.agent.preset": "Default Agent preset",
  "set.iso.heading": "Default execution isolation",
  "set.iso.noneHint": "No git; works directly in the project directory (factory default)",
  "set.iso.worktreeHint": "Each execution runs on its own worktree branch (task/title+ID), isolated from the others; multi-repo workspaces are mirrored whole (one branch per repo)",
  "set.iso.current": "Currently saved default: {current}. Affects only tasks created hereafter; existing tasks keep their creation-time choice, and non-git projects still degrade to the project directory at run time.",
  "set.sync.heading": "Auto-sync workspace sessions",
  "set.sync.off.name": "\u{1F6AB} Sync off",
  "set.sync.off.title": "Manage only tasks created and triggered in the task board",
  "set.sync.off.hint": "Board tasks only (factory default)",
  "set.sync.on.name": "\u{1F504} Auto-include sessions",
  "set.sync.on.title": "Sessions created directly in workspaces also appear on the board: In progress while running, In review automatically when done",
  "set.sync.on.hint": "Tracks runs and enters review on completion",
  "set.sync.stateOn": 'On: sessions created and run directly in workspaces automatically become board cards and flow to the "In review" column when done.',
  "set.sync.stateOff": "Off: only tasks created and triggered inside the board appear on the board.",
  "set.foot.dirty": "Unsaved changes",
  "set.foot.clean": "Matches the current board settings",
  "set.action.save": "Save settings",
  "set.storage.heading": "Data storage location",
  "set.storage.hint": "The task ledger, templates, and image attachments live together in this directory. Changing it copies and verifies everything before switching.",
  "set.storage.loading": "Loading the current path\u2026",
  "set.storage.current": "Current path: {path}",
  "set.storage.assets": "Image attachments: {count}, {size} MiB",
  "set.storage.default": "Restore default path",
  "set.storage.check": "Check path",
  "set.storage.migrate": "Migrate data",
  "set.storage.migrating": "Migrating\u2026",
  "set.storage.confirm": "Migrate the complete task ledger, templates, and image attachments?\n\nFrom: {from}\nTo: {to}\n\nWrites queue briefly during migration.",
  "set.storage.migrated": "Migration succeeded \u2014 data now lives in {path}",
  "set.storage.warnings": "Migration finished, but some old files could not be removed: {warnings}",
  // ── execution permission (PR #14) ─────────────────────────────────
  "form.field.permission": "Execution permission",
  "form.perm.write": "Workspace write",
  "form.perm.readOnly": "Read-only",
  "form.perm.fullAccess": "Full access",
  "form.perm.defaultTag": " (default)",
  "set.perm.heading": "Default execution permission",
  "set.perm.writeName": "\u{1F4C1} Workspace write (factory default)",
  "set.perm.writeHint": "Read-write access to the workspace and temp directories; writes need no extra confirmation",
  "set.perm.readOnlyName": "\u{1F512} Read-only",
  "set.perm.readOnlyHint": "Read-only viewing and search only; no file changes or destructive commands",
  "set.perm.fullName": "\u26A1 Full access",
  "set.perm.fullHint": "Unrestricted: whole-disk access and external system commands",
  "set.perm.current": "Currently saved default: {current}. The execution permission preset applied to new tasks.",
  "set.schedule.heading": "Scheduled execution",
  "set.schedule.hint": "Takes effect for subsequent scheduler and execution checks. The offline window only classifies historical triggers while the host was down; a queue shelf life of 0 retains queued work across restarts.",
  "set.schedule.concurrent": "Maximum concurrent executions (1\u2013100)",
  "set.schedule.missedAfter": "Offline missed window, minutes (1\u20131440)",
  "board.queue.chip": "Queued {n}",
  "queue.panel.title": "Execution queue",
  "queue.depth": "Queued",
  "queue.wait": "Longest wait",
  "queue.clear": "Clear queue",
  "queue.confirm": "Confirm clear",
  "queue.cleared": "Cleared {n} queued task(s).",
  "set.schedule.queueMaxAge": "Queue shelf life, minutes (0 = retain indefinitely; max 10080)",
  "set.schedule.dispatchInterval": "Scheduled-session start interval, ms (default 1000; 0 = no throttle; max 60000)",
  "set.schedule.invalid": "Enter whole numbers within the allowed ranges before saving.",
  "set.completedLimit.heading": "Completed Tasks Display",
  "set.completedLimit.hint": 'Limits the maximum number of cards rendered in the "Done" column to prevent lag from accumulated tasks. Older tasks are folded and can be expanded at the column footer, and all matching tasks remain visible during search (range 10\u2013500, default 50).',
  "set.completedLimit.label": "Completed tasks display limit (10\u2013500)",
  "board.done.folded": "{n} older completed tasks folded",
  "board.done.expandAll": "Expand all",
  "board.done.collapse": "Collapse",
  "board.done.showing": "(showing latest {n})",
  "board.column.collapseDone": 'Collapse "Done" column',
  "board.column.expandDone": 'Expand "Done" column',
  "board.workspace.expand": "Expand tasks for {name}",
  "board.workspace.collapse": "Collapse tasks for {name}",
  "board.workspace.unassigned": "Unassigned workspace",
  "card.badge.permReadOnly": "\u{1F512} Read-only",
  "card.badge.permReadOnlyTitle": "Permission: read-only",
  "card.badge.permFull": "\u26A1 Full access",
  "card.badge.permFullTitle": "Permission: full access",
  "detail.chip.permReadOnly": "Read-only",
  "detail.chip.permFull": "Full access",
  "detail.chip.permWrite": "Workspace write",
  "tpl.meta.permReadOnly": "read-only",
  "tpl.meta.permFull": "full access",
  // ── markdown lightbox (PR #14) ────────────────────────────────────
  "md.imageAlt": "Image {n}",
  "md.imageTitle": "Click to view full size ({alt})",
  "md.lightboxAlt": "Full-size preview",
  "md.closePreview": "Close preview",
  "image.add": "Insert image",
  "image.uploading": "Uploading\u2026",
  "image.hint": "Choose, paste, or drop PNG/JPEG/GIF/WebP images up to 5 MB each",
  "image.defaultAlt": "Image",
  // ── slash completion popup (PR #14) ───────────────────────────────
  "slash.aria": "Quick commands and skills",
  "slash.title": "Quick command and skill completion",
  "slash.hint": "\u2191\u2193 navigate \xB7 Enter / Tab pick \xB7 Esc close",
  "slash.badge.command": "\u26A1 command",
  "slash.badge.skill": "\u{1F9E9} skill",
  "slash.tipA": "\u{1F4A1} Type",
  "slash.tipB": "to autocomplete slash commands and agent skills",
  "slash.cmd.goal.desc": "Autonomously drive long-horizon goals to completion",
  "slash.cmd.goal.hint": "<goal description>",
  "slash.cmd.schedule.desc": "Set one-off or recurring cron schedules",
  "slash.cmd.schedule.hint": "<time or expression>",
  "slash.cmd.plan.desc": "Draft a step-by-step plan and get user confirmation before acting",
  "slash.cmd.browser.desc": "Launch a browser for page interaction and live search",
  "slash.cmd.grill-me.desc": "Align requirements and design intent through one-question-at-a-time interviews",
  "slash.cmd.teamwork-preview.desc": "Multi-agent collaboration and team workflow preview",
  "slash.cmd.learn.desc": "Capture solutions and new rules into the knowledge base",
  "slash.cmd.review.desc": "Multi-axis code review (correctness, architecture, security)",
  "slash.cmd.security.desc": "Security hardening and vulnerability scanning",
  "slash.cmd.permission.desc": "Switch the session permission level (read-only / workspace-write / full-access)",
  "slash.cmd.permission.hint": "<preset>",
  "slash.skill.frontend-ui-engineering": "Build production-grade, accessible frontend interfaces and components",
  "slash.skill.api-and-interface-design": "Design stable, well-bounded REST / RPC interfaces",
  "slash.skill.test-driven-development": "Test-driven development (TDD): unit and integration tests",
  "slash.skill.debugging-and-error-recovery": "Systematically locate bug root causes and recover",
  "slash.skill.performance-optimization": "Frontend/backend performance tuning and query optimization",
  "slash.skill.ci-cd-and-automation": "Build automation, CI/CD pipelines and quality gates",
  "slash.skill.code-review-and-quality": "Multi-axis code review and refactoring guidance",
  "slash.skill.code-simplification": "Simplify complex logic for readability and maintainability",
  "slash.skill.context-engineering": "Optimize context structure and prompt engineering",
  "slash.skill.doubt-driven-development": "Adversarial, doubt-driven review of core logic",
  "slash.skill.git-workflow-and-versioning": "Git workflow, branching, semantic versioning and changelogs",
  "slash.skill.idea-refine": "Refine ideas and test hypotheses via divergent-convergent thinking",
  "slash.skill.incremental-implementation": "Deliver multi-file changes in small, incremental steps",
  "slash.skill.interview-me": "Deep interviews to surface true intent",
  "slash.skill.memory-leak-debugging": "Diagnose JavaScript/Node.js memory leaks",
  "slash.skill.observability-and-instrumentation": "Add logging, metrics and distributed tracing",
  "slash.skill.planning-and-task-breakdown": "Break complex requirements into ordered, executable tasks",
  "slash.skill.security-and-hardening": "Harden against vulnerabilities; input filtering and auth hardening",
  "slash.skill.shipping-and-launch": "Pre-launch checklists and rollback strategies",
  "slash.skill.source-driven-development": "Design from authoritative docs and source code",
  "slash.skill.spec-driven-development": "Write clear technical specs before coding",
  "slash.skill.using-agent-skills": "Discover and invoke agent skills dynamically",
  // ── host-generated system comments (0.6.4; localized at render) ────
  "sys.execFailed": "[System] Execution failed: {error}; the task was returned to todo.",
  "sys.endedWithComment": "[System] The execution session ended with comments but was not moved to in review; the system moved it to in review automatically.",
  "sys.endedNoHandoff": "[System] The execution session ended without a protocol handoff (no comments, not moved to in review); the system moved it to in review automatically \u2014 review it, then send back or accept.",
  "sys.sessionError": "[System] Session execution error: {error}; the task was returned to todo.",
  "sys.sessionDone": "[System] The session finished; automatically moved to in review.",
  "sys.cronDead": "[System] The cron expression {cron} has no trigger time within 4 years; scheduling disabled \u2014 fix the cron and re-enable.",
  "sys.periodicHandoff": "[System] Periodic run finished; the schedule now continues on the new todo card {nextTaskId}. Review this card, then accept.",
  "sys.spawnedFrom": "[System] The previous periodic run finished (execution {executionId}); this card carries the schedule onward. See {sourceId} for the finished round.",
  "sys.runAtMissed": "[System] The one-shot trigger time was missed (host was down); it will not re-fire. Run manually or reschedule.",
  "sys.mergeSingle": "[System] Branch {branch} merged into the main worktree (--no-ff).",
  "sys.mergeMulti": "[System] Branches merged per repo (--no-ff): {summary}",
  // ── needs-human & review-desk keys ──
  "card.badge.needsHuman": "Needs Human",
  "card.badge.needsHumanTitle": "This task is waiting for human action, decision, or input",
  "card.deliv.changed": "Changed",
  "card.deliv.filesUnit": "files",
  "card.deliv.gitFilesChanged": "files changed (Git)",
  "card.deliv.noFilesRecorded": "No changed files recorded",
  "card.deliv.acceptance": "Acceptance",
  "card.deliv.checklistProgress": "Checklist {done}/{total}",
  "card.deliv.uncheckedWarn": "unchecked items",
  "card.deliv.checksCount": "{n} checks verified",
  "card.deliv.noVerificationWarn": "No verification records",
  "detail.chip.needsHuman": "Waiting for Human Action",
  "detail.deliv.title": "Delivery Review & Verification Desk",
  "detail.deliv.summaryLabel": "Delivery Summary",
  "detail.deliv.missingReport": "No execution report submitted",
  "detail.deliv.missingHint": "The agent finished without submitting structured verification evidence or changed files. Please verify changes or prompt the agent for details before accepting.",
  "detail.deliv.copyPath": "Copy path",
  "detail.deliv.copy": "Copy",
  "detail.deliv.copied": "Copied",
  "detail.needsHuman.mark": "\u{1F64B} Mark Needs Human",
  "detail.needsHuman.unmark": "\u2713 Clear Needs Human",
  "detail.needsHuman.hint": "Toggle whether this task is blocked waiting for human input, auth, credentials or decision",
  "board.filter.needsHuman": "Waiting for Me",
  "board.filter.needsHumanTitle": "Show only tasks waiting for human intervention or input"
};

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/i18n/runtime.ts
var DICTS = { zh, en };
var service;
var unsubscribeService;
var snapshot = { active: detectFallbackLocale(), revision: 0 };
var listeners = /* @__PURE__ */ new Set();
var langObserver;
var retryTimer;
function clearLateAttach() {
  if (retryTimer !== void 0) {
    clearInterval(retryTimer);
    retryTimer = void 0;
  }
  try {
    langObserver?.disconnect();
  } catch {
  }
  langObserver = void 0;
}
function isLocaleId(value) {
  return value === "zh" || value === "en";
}
function detectFallbackLocale() {
  try {
    if (typeof document !== "undefined") {
      const lang = document.documentElement.lang;
      if (typeof lang === "string" && lang.length > 0) {
        const lower = lang.toLowerCase();
        if (lower.startsWith("zh")) return "zh";
        if (lower.startsWith("en")) return "en";
      }
    }
  } catch {
  }
  try {
    if (typeof navigator !== "undefined") {
      const lang = navigator.language ?? "en";
      return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
    }
  } catch {
  }
  return "en";
}
function asLocaleService(value) {
  const face = value;
  if (face === null || face === void 0 || typeof face.getSnapshot !== "function" || typeof face.subscribe !== "function") return void 0;
  return face;
}
function startLateAttach(retryGetLocale) {
  clearLateAttach();
  try {
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      langObserver = new MutationObserver(() => {
        if (service !== void 0) return;
        const next = detectFallbackLocale();
        if (next !== snapshot.active) publish({ active: next, revision: snapshot.revision + 1 });
      });
      langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    }
  } catch {
  }
  if (retryGetLocale === void 0) return;
  let tries = 0;
  retryTimer = setInterval(() => {
    tries += 1;
    let face;
    try {
      face = asLocaleService(retryGetLocale());
    } catch {
      face = void 0;
    }
    if (face !== void 0) {
      initI18n(face);
      return;
    }
    if (tries >= 8) clearLateAttach();
  }, 250);
}
function publish(next) {
  if (next.active === snapshot.active && next.revision === snapshot.revision) return;
  snapshot = next;
  for (const fn of listeners) fn();
}
function initI18n(localeService, retryGetLocale) {
  const face = asLocaleService(localeService);
  if (face === void 0) {
    publish({ active: detectFallbackLocale(), revision: 0 });
    startLateAttach(retryGetLocale);
    return;
  }
  clearLateAttach();
  service = face;
  const sync = () => {
    try {
      const s = face.getSnapshot();
      const active = isLocaleId(s.active) ? s.active : detectFallbackLocale();
      publish({ active, revision: s.revision });
    } catch {
    }
  };
  sync();
  unsubscribeService = face.subscribe(sync);
}
function disposeI18n() {
  clearLateAttach();
  try {
    unsubscribeService?.();
  } catch {
  }
  unsubscribeService = void 0;
  service = void 0;
  publish({ active: detectFallbackLocale(), revision: 0 });
}
var localeStore = {
  getSnapshot() {
    return snapshot;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }
};
var PLACEHOLDER = /\{(\w+)\}/g;
var translate = (key, params) => {
  const template = DICTS[snapshot.active][key] ?? DICTS.en[key] ?? key;
  if (params === void 0) return template;
  return template.replace(PLACEHOLDER, (match, name2) => {
    const value = params[name2];
    return value === void 0 ? match : String(value);
  });
};
function useT() {
  (0, import_react.useSyncExternalStore)(localeStore.subscribe, localeStore.getSnapshot);
  return translate;
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/controller.ts
var VIEW_KEY = "dsh-taskboard-view-v1";
function loadView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw === null) return { urgencies: [], sortBy: "default", doneCollapsed: false };
    const parsed = JSON.parse(raw);
    const sortBy = parsed.sortBy === "updated" || parsed.sortBy === "urgency" || parsed.sortBy === "created" || parsed.sortBy === "title" ? parsed.sortBy : "default";
    return {
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : void 0,
      urgencies: Array.isArray(parsed.urgencies) ? parsed.urgencies.filter((u) => u === "urgent" || u === "normal" || u === "relaxed") : [],
      sortBy,
      doneCollapsed: parsed.doneCollapsed === true,
      collapsedWorkspaceGroups: Array.isArray(parsed.collapsedWorkspaceGroups) ? parsed.collapsedWorkspaceGroups.filter((key) => typeof key === "string") : []
    };
  } catch {
    return { urgencies: [], sortBy: "default", doneCollapsed: false };
  }
}
function initialState() {
  const view = loadView();
  return {
    boardOpen: false,
    ledger: emptyLedger(),
    workspaces: [],
    filters: { workspaceId: view.workspaceId, urgencies: view.urgencies },
    search: "",
    sortBy: view.sortBy,
    doneCollapsed: view.doneCollapsed,
    collapsedWorkspaceGroups: view.collapsedWorkspaceGroups ?? [],
    composerOpen: false,
    secondaryOpen: false,
    diagOpen: false,
    queueOpen: false,
    templates: [],
    tplManagerOpen: false,
    importOpen: false,
    settingsOpen: false
  };
}
var BoardController = class {
  /** @param client - the route client. */
  constructor(client) {
    this.client = client;
  }
  client;
  state = initialState();
  subscribers = /* @__PURE__ */ new Set();
  disposed = false;
  /** External close bridge (official panel mode); undefined in legacy mode. */
  closeRequester;
  disposeStream;
  refreshInFlight;
  /** Newest change-frame revision seen on the SSE stream (S16 refresh chase). */
  seenRevision;
  sessionJumper;
  sessionTitles;
  /** Composer catalog faces, installed formally by the client entry (T13). */
  catalogFaces = {};
  /** Current snapshot (render input). */
  getSnapshot() {
    return this.state;
  }
  /** Subscribe; returns unsubscribe. */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
  emit() {
    if (this.disposed) return;
    for (const fn of this.subscribers) fn();
  }
  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }
  /** Start subscriptions; call once after construction. */
  start() {
    void this.refresh();
    this.disposeStream = this.client.stream(
      (change) => {
        this.seenRevision = change.revision;
        void this.refresh();
      },
      () => {
        void this.refresh();
      }
    );
  }
  /** Full refetch (state + workspaces + open detail). */
  async refresh() {
    if (this.refreshInFlight !== void 0) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      try {
        for (let round = 0; round < 3; round++) {
          const [ledgerResult, workspacesResult] = await Promise.allSettled([
            Promise.resolve().then(() => this.client.state({ excludeDone: this.state.doneCollapsed })),
            Promise.resolve().then(() => this.client.workspaces())
          ]);
          const patch = {};
          const errors = [];
          let resetWorkspaceFilter = false;
          if (ledgerResult.status === "fulfilled") {
            const ledger = ledgerResult.value;
            let selected;
            if (this.state.selectedId !== void 0) {
              selected = ledger.tasks.find((t) => t.id === this.state.selectedId);
            }
            Object.assign(patch, {
              archiveSessionsSupported: ledger.capabilities?.archiveSessions === true,
              ledger,
              doneCount: typeof ledger.doneCount === "number" ? ledger.doneCount : ledger.tasks.filter((t) => t.status === "done" && t.trashedAt === void 0).length,
              queue: ledger.queue,
              selectedId: selected === void 0 ? void 0 : this.state.selectedId
            });
          } else {
            errors.push(`state: ${ledgerResult.reason instanceof Error ? ledgerResult.reason.message : String(ledgerResult.reason)}`);
          }
          if (workspacesResult.status === "fulfilled") {
            const workspaces = workspacesResult.value;
            patch.workspaces = workspaces;
            const currentId = this.state.filters.workspaceId;
            if (currentId !== void 0 && !workspaces.some((ws) => ws.id === currentId)) {
              patch.filters = { ...this.state.filters, workspaceId: void 0 };
              resetWorkspaceFilter = true;
            }
          } else {
            errors.push(`workspaces: ${workspacesResult.reason instanceof Error ? workspacesResult.reason.message : String(workspacesResult.reason)}`);
          }
          patch.error = errors.length > 0 ? errors.join("; ") : void 0;
          this.setState(patch);
          if (resetWorkspaceFilter) this.persistView();
          if (ledgerResult.status !== "fulfilled" || this.seenRevision === void 0 || ledgerResult.value.revision >= this.seenRevision) break;
        }
      } catch (error) {
        this.setState({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        this.refreshInFlight = void 0;
      }
    })();
    return this.refreshInFlight;
  }
  /** Stop everything. */
  dispose() {
    this.disposed = true;
    this.disposeStream?.();
    this.subscribers.clear();
  }
  // ------------------------------------------------------------------ view
  /** Open the board (sidebar entry). */
  openBoard() {
    this.setState({ boardOpen: true });
  }
  /**
   * Close the board. Official panel mode routes through the installed
   * close requester (layout.selectPanel(null) — the host owns visibility);
   * legacy mode flips the local boardOpen state as before.
   */
  closeBoard() {
    if (this.closeRequester !== void 0) {
      this.closeRequester();
      return;
    }
    this.setState({ boardOpen: false });
  }
  /**
   * Install (or clear) the external close bridge. Set by the official
   * panel mount; the legacy mount leaves it unset.
   * @param fn - the close bridge, or undefined to restore legacy behavior.
   */
  installCloseRequester(fn) {
    this.closeRequester = fn;
  }
  /** Toggle the board. */
  toggleBoard() {
    this.setState({ boardOpen: !this.state.boardOpen });
  }
  /** Set the project filter (persisted). */
  setWorkspaceFilter(workspaceId) {
    this.setState({ filters: { ...this.state.filters, workspaceId } });
    this.persistView();
  }
  /** Toggle one urgency chip (persisted). */
  toggleUrgency(urgency) {
    const set = new Set(this.state.filters.urgencies);
    if (set.has(urgency)) set.delete(urgency);
    else set.add(urgency);
    this.setState({ filters: { ...this.state.filters, urgencies: [...set] } });
    this.persistView();
  }
  /** Set the free-text search (transient — not persisted). */
  setSearch(search) {
    this.setState({ search });
  }
  /** Set the column sort order (persisted). */
  setSortBy(sortBy) {
    this.setState({ sortBy });
    this.persistView();
  }
  /** Set the completed (done) column collapsed state (persisted). */
  setDoneCollapsed(collapsed) {
    const prev = this.state.doneCollapsed;
    this.setState({ doneCollapsed: collapsed });
    this.persistView();
    if (prev && !collapsed) {
      void this.refresh();
    }
  }
  isWorkspaceGroupCollapsed(column, workspaceId) {
    return this.state.collapsedWorkspaceGroups.includes(JSON.stringify([column, workspaceId ?? null]));
  }
  toggleWorkspaceGroup(column, workspaceId) {
    const key = JSON.stringify([column, workspaceId ?? null]);
    const groups = this.state.collapsedWorkspaceGroups;
    this.setState({ collapsedWorkspaceGroups: groups.includes(key) ? groups.filter((item) => item !== key) : [...groups, key] });
    this.persistView();
  }
  /** Write the current view state to localStorage (best effort). */
  persistView() {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({
        workspaceId: this.state.filters.workspaceId,
        urgencies: this.state.filters.urgencies,
        sortBy: this.state.sortBy,
        doneCollapsed: this.state.doneCollapsed,
        collapsedWorkspaceGroups: this.state.collapsedWorkspaceGroups
      }));
    } catch {
    }
  }
  /** Select a task (open detail). */
  select(id) {
    this.setState({ selectedId: id });
  }
  /** Show/hide the task form (create mode when opening); always blank (no template prefill). */
  setComposer(open) {
    this.setState({ composerOpen: open, editingId: void 0, templatePrefill: void 0 });
  }
  /** Open the create form prefilled from a chosen template (0.4.0). */
  newFromTemplate(spec) {
    this.setState({ composerOpen: true, editingId: void 0, templatePrefill: spec });
  }
  /** Open the form modal editing an existing task (clears any template prefill). */
  openEditor(id) {
    this.setState({ composerOpen: true, editingId: id, templatePrefill: void 0 });
  }
  /** Close the form modal whatever its mode. */
  closeForm() {
    this.setState({ composerOpen: false, editingId: void 0, templatePrefill: void 0 });
  }
  /** Toggle the secondary tab. */
  toggleSecondary() {
    this.setState({ secondaryOpen: !this.state.secondaryOpen });
  }
  /** Whether a workspace passed git detection (form toggle enablement). */
  gitAvailable(workspaceId) {
    if (workspaceId === void 0) return true;
    return this.state.workspaces.find((w) => w.id === workspaceId)?.gitAvailable === true;
  }
  /** How many repos a task mirror of this workspace would cover (0.6.3 mirror badge). */
  repoCount(workspaceId) {
    if (workspaceId === void 0) return 1;
    return this.state.workspaces.find((w) => w.id === workspaceId)?.repoCount ?? 1;
  }
  /**
   * Install the session-jump bridge (built from the runtime sessions service
   * by the client entry). Without it openSession reports 'unavailable'.
   * @param jumper - the jump function from createSessionJumper.
   */
  installSessionJumper(jumper) {
    this.sessionJumper = jumper;
  }
  installSessionTitles(reader) {
    this.sessionTitles = reader;
  }
  /** Get the display title of a session if known. */
  getSessionTitle(sessionId) {
    if (sessionId === void 0) return void 0;
    const titles = this.sessionTitles?.() ?? {};
    return titles[sessionId]?.displayTitle ?? titles[sessionId]?.title;
  }
  /** T13: formal installers for the composer catalog faces (was a monkeypatch from the client entry). */
  installModelCatalog(fn) {
    this.catalogFaces.models = fn;
  }
  /** T13: formal installer for the preset roster face. */
  installPresetRoster(fn) {
    this.catalogFaces.presets = fn;
  }
  /** The installed model catalog face, when the runtime provides one. */
  get modelCatalog() {
    return this.catalogFaces.models;
  }
  /** The installed preset roster face, when the runtime provides one. */
  get presetCatalog() {
    return this.catalogFaces.presets;
  }
  /**
   * Fetch model catalog: prefers installed runtime face, falls back to Taskboard client API (0.5.5).
   */
  /** Sessions owned by a project, for the scheduled-run session picker. */
  async fetchProjectSessions(workspaceId) {
    const sessions = (await this.client.projectSessions(workspaceId)).sessions;
    const titles = this.sessionTitles?.() ?? {};
    return sessions.map((session) => ({ ...session, title: titles[session.id]?.displayTitle ?? titles[session.id]?.title }));
  }
  async fetchModelCatalog() {
    if (this.catalogFaces.models !== void 0) {
      try {
        const list = await this.catalogFaces.models();
        if (list !== void 0 && list.length > 0) return list;
      } catch {
      }
    }
    try {
      const res = await this.client.modelCatalog();
      return res.models ?? [];
    } catch {
      return [];
    }
  }
  /**
   * Fetch preset roster: prefers installed runtime face, falls back to Taskboard client API (0.5.5).
   */
  async fetchPresetCatalog() {
    if (this.catalogFaces.presets !== void 0) {
      try {
        const roster = await this.catalogFaces.presets();
        if (roster !== void 0 && roster.presets !== void 0 && roster.presets.length > 0) return roster;
      } catch {
      }
    }
    try {
      const res = await this.client.modelCatalog();
      return {
        presets: res.presets ?? [],
        ...res.defaultPresetId !== void 0 ? { defaultId: res.defaultPresetId } : {}
      };
    } catch {
      return { presets: [] };
    }
  }
  /**
   * Jump to an execution's session (open it in the GUI). On success the board
   * closes so the conversation shows; a deleted-or-archived session reports
   * 'missing' for the caller to prompt about.
   * @param sessionId - the execution's session id.
   * @returns the jump outcome.
   */
  async openSession(sessionId) {
    if (this.sessionJumper === void 0) return "unavailable";
    let result;
    try {
      result = await this.sessionJumper(sessionId);
    } catch {
      return "unavailable";
    }
    if (result === "opened") this.closeBoard();
    return result;
  }
  // ---------------------------------------------------------------- writes
  /** Create a task (composer submit); returns the new task id, undefined on failure. */
  async create(body) {
    try {
      const summary = await this.client.create(body);
      this.setState({ composerOpen: false, error: void 0 });
      await this.refresh();
      return summary.id;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  }
  /** Edit task fields (form modal submit; the GUI is the owner surface). */
  async update(id, ifVersion, body) {
    try {
      await this.client.update(id, { ifVersion, ...body });
      this.setState({ composerOpen: false, editingId: void 0, error: void 0 });
      await this.refresh();
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Retry session archiving without repeating the task's terminal transition. */
  async retryArchiveSessions(id) {
    try {
      if (this.client.archiveSessions === void 0) return;
      const result = await this.client.archiveSessions(id);
      this.setState({ sessionArchive: { taskId: id, result } });
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** Move a task (user surface: done allowed). */
  async move(id, ifVersion, status, options) {
    try {
      const result = await this.client.move(id, {
        ifVersion,
        status,
        ...options?.archiveSessions !== void 0 ? { archiveSessions: options.archiveSessions } : {}
      });
      if (result.sessionArchive !== void 0) this.setState({ sessionArchive: { taskId: id, result: result.sessionArchive } });
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /**
   * Quick-reject (card ✗ button): move back to todo with an optional user
   * comment, committed atomically host-side. Returns whether the task moved.
   * @param id - task id.
   * @param ifVersion - optimistic version (captured at click time).
   * @param comment - optional comment text; blank = move only.
   */
  async reject(id, ifVersion, comment) {
    const body = comment !== void 0 && comment.trim().length > 0 ? comment.trim() : void 0;
    try {
      await this.client.reject(id, body === void 0 ? { ifVersion } : { ifVersion, body });
      await this.refresh();
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Toggle the blocked marker. */
  async toggleBlocked(task) {
    try {
      await this.client.update(task.id, { ifVersion: task.version, blocked: !task.blocked });
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /**
   * Toggle one checklist item as the USER (0.4.0): flips the item, records
   * `checkedBy: 'user'`, keeps other items as they are (one update call).
   */
  async toggleChecklistItem(task, itemId) {
    const items = (task.checklist ?? []).map((item) => item.id === itemId ? item.checked ? { id: item.id, text: item.text, checked: false } : { id: item.id, text: item.text, checked: true, checkedBy: "user", checkedAt: Date.now(), ...item.note !== void 0 ? { note: item.note } : {} } : item);
    try {
      await this.client.update(task.id, { ifVersion: task.version, checklist: items });
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** Diff view (0.4.0): one execution's commit or changed path; `repo` picks a mirror repo (0.6.3). */
  async fetchDiff(taskId, query) {
    try {
      return await this.client.diff(taskId, query);
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  }
  /**
   * Append a user comment. Returns whether it landed — the composer keeps its
   * text on failure (T13: it used to clear unconditionally and lose the draft).
   */
  async comment(id, body) {
    try {
      await this.client.comment(id, body);
      await this.refresh();
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Upload an image without putting its bytes in the ledger or agent context. */
  async uploadImage(file) {
    try {
      return await this.client.uploadImage(file);
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  }
  /** Trigger a manual run (fresh in-project session, pinned model); `reuse` = 续跑. */
  async run(id, reuse = false) {
    try {
      await this.client.run(id, reuse ? { reuse: true } : {});
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** Cancel the running execution (stops the agent session; task returns to todo). */
  async cancel(id) {
    try {
      await this.client.cancel(id);
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /**
   * ⇥ 合并 (detail page): merge the task branch into the main worktree.
   * @returns the outcome; `noop` means the branch had no new commits (nothing
   * merged); multi-repo tasks (0.6.3) additionally carry per-repo `results`.
   */
  async mergeBranch(id) {
    try {
      const value = await this.client.mergeBranch(id);
      await this.refresh();
      return value.noop === true ? { ok: true, noop: true } : value.results !== void 0 ? { ok: true, results: value.results } : { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * 🗑 删除 worktree (detail page), optionally deleting the task branch too.
   * @returns the outcome; failures carry the git message for an alert.
   */
  async removeWorktree(id, deleteBranch) {
    try {
      const value = await this.client.worktreeRemove(id, { deleteBranch });
      await this.refresh();
      return value.branchError !== void 0 ? { ok: true, branchError: value.branchError } : { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /** Open the ⚙ diagnostics panel and fetch a fresh snapshot. */
  openDiagnostics() {
    this.setState({ diagOpen: true });
    void this.client.diagnostics().then((diagnostics) => this.setState({ diagnostics })).catch((error) => this.setState({ error: error instanceof Error ? error.message : String(error) }));
  }
  /** Close the ⚙ diagnostics panel. */
  closeDiagnostics() {
    this.setState({ diagOpen: false });
  }
  /** Open the execution-queue popup (in-progress column chip). */
  openQueuePanel() {
    this.setState({ queueOpen: true });
    void this.refresh();
  }
  /** Close the execution-queue popup. */
  closeQueuePanel() {
    this.setState({ queueOpen: false });
  }
  /**
   * Drop every durable queue entry (board queue panel, double-confirm gated).
   * @returns the clear result, or undefined on failure.
   */
  async clearQueue() {
    try {
      const value = await this.client.clearQueue();
      await this.refresh();
      return value;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  }
  /** Open the board-settings modal (0.5.0). */
  openSettings() {
    this.setState({ settingsOpen: true });
    void this.client.storage().then((storage) => this.setState({ storage, error: void 0 })).catch((error) => this.setState({ error: error instanceof Error ? error.message : String(error) }));
  }
  /** Close the board-settings modal. */
  closeSettings() {
    this.setState({ settingsOpen: false, storageNotice: void 0 });
  }
  /**
   * Replace board settings (0.5.0). The host broadcasts a settings-updated
   * frame; refresh() pulls ledger.settings so every open view follows.
   * @returns whether the write succeeded.
   */
  async updateSettings(body) {
    try {
      await this.client.updateSettings(body);
      await this.refresh();
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Validate a candidate host directory without changing the active store. */
  async checkStorage(directory) {
    try {
      const storage = await this.client.checkStorage(directory);
      this.setState({ storage, error: void 0 });
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Atomically migrate all three stores and refresh the displayed location. */
  async migrateStorage(directory) {
    try {
      const storage = await this.client.migrateStorage(directory);
      this.setState({ storage, storageNotice: { path: storage.currentDirectory, warnings: storage.warnings }, error: void 0 });
      await this.refresh();
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Clear the settled migration notice (next user edit in the storage section). */
  dismissStorageNotice() {
    if (this.state.storageNotice !== void 0) this.setState({ storageNotice: void 0 });
  }
  /** Clean one orphan worktree (⚙ panel); refreshes the diagnostics payload. */
  async cleanupOrphan(workspaceId, taskId) {
    try {
      await this.client.worktreeCleanup(workspaceId, taskId);
      const diagnostics = await this.client.diagnostics();
      this.setState({ diagnostics, error: void 0 });
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** Soft-delete (agent parity) then optional purge. */
  async remove(id, ifVersion, purge) {
    try {
      await this.client.remove(id, purge ? { purge: true } : { ifVersion });
      if (purge) this.setState({ selectedId: void 0 });
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** Duplicate a task into a fresh todo card (same project/urgency/prompt/execution/model/isolation/checklist). */
  async duplicate(task) {
    try {
      await this.client.create({
        // Keep the suffix under the host's 200-char title cap (review P1).
        title: task.title.slice(0, 196) + translate("shared.duplicate.suffix"),
        workspaceId: task.workspaceId,
        urgency: task.urgency,
        description: task.description.length > 0 ? task.description : void 0,
        prompt: task.prompt.length > 0 ? task.prompt : void 0,
        execution: task.execution.mode === "scheduled" && task.execution.cron !== void 0 ? { mode: "scheduled", cron: task.execution.cron } : task.execution.mode === "scheduled" && task.execution.runAt !== void 0 && task.execution.runAt > Date.now() ? { mode: "scheduled", runAt: new Date(task.execution.runAt).toISOString() } : { mode: "claim" },
        model: task.model,
        isolation: task.isolation,
        ...task.presetId !== void 0 ? { presetId: task.presetId } : {},
        ...task.permission !== void 0 ? { permission: task.permission } : {},
        ...task.checklist !== void 0 && task.checklist.length > 0 ? { checklist: task.checklist.map((i) => i.text) } : {}
      });
      await this.refresh();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  // ------------------------------------------------ templates (0.4.0)
  /** Load the template list (best effort; errors surface). */
  async loadTemplates() {
    try {
      const value = await this.client.templates();
      this.setState({ templates: value.templates, error: void 0 });
      return value.templates;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
  /** Open the + 新建任务 dropdown's template list fresh (called on menu open). */
  prepareTemplateMenu() {
    if (this.state.templates.length === 0) void this.loadTemplates();
  }
  /** Open the template manager modal. */
  openTemplateManager() {
    this.setState({ tplManagerOpen: true });
    void this.loadTemplates();
  }
  /** Close the template manager modal. */
  closeTemplateManager() {
    this.setState({ tplManagerOpen: false });
  }
  /** Create or replace a template; refreshes the list. */
  async upsertTemplate(body) {
    try {
      await this.client.templateUpsert(body);
      await this.loadTemplates();
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
  /** Delete a template by id; refreshes the list. */
  async deleteTemplate(id) {
    try {
      await this.client.templateDelete(id);
      await this.loadTemplates();
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** 存为模板 from a task card: carries every configurable field incl. checklist texts. */
  async saveAsTemplate(task) {
    return this.upsertTemplate({
      name: task.title.slice(0, 60),
      task: {
        title: task.title,
        description: task.description.length > 0 ? task.description : void 0,
        prompt: task.prompt.length > 0 ? task.prompt : void 0,
        urgency: task.urgency,
        execution: task.execution.mode === "scheduled" && task.execution.cron !== void 0 ? { mode: "scheduled", cron: task.execution.cron } : task.execution.mode === "scheduled" && task.execution.runAt !== void 0 ? { mode: "scheduled", runAt: new Date(task.execution.runAt).toISOString() } : { mode: "claim" },
        model: task.model,
        isolation: task.isolation,
        ...task.presetId !== void 0 ? { presetId: task.presetId } : {},
        ...task.permission !== void 0 ? { permission: task.permission } : {},
        ...task.checklist !== void 0 && task.checklist.length > 0 ? { checklist: task.checklist.map((i) => i.text) } : {}
      }
    });
  }
  /** Load prompt completions (skills + slash commands) from host (0.5.5). */
  async fetchPromptCompletions() {
    try {
      return await this.client.promptCompletions();
    } catch {
      return void 0;
    }
  }
  // ------------------------------------------------ import (0.4.0)
  /** Open the import modal. */
  openImport() {
    this.setState({ importOpen: true });
  }
  /** Close the import modal. */
  closeImport() {
    this.setState({ importOpen: false });
  }
  /** Dry-run an import file: classify its tasks against the live ledger. */
  async importPreview(file) {
    try {
      const value = await this.client.importPreview(file);
      return value.plan;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  }
  /** Commit an import; refreshes the ledger afterwards. */
  async importCommit(mode, ledger) {
    try {
      const value = await this.client.importCommit(mode, ledger);
      await this.refresh();
      return value;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      return void 0;
    }
  }
  /** Download the whole ledger as a JSON backup file. */
  exportJson() {
    const stamp = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name2 = `dsh-taskboard-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`;
    const body = JSON.stringify(this.state.ledger, null, 2);
    this.download(name2, body, "application/json");
  }
  /** Download the task list as a CSV (BOM-prefixed for Excel + Chinese text). */
  exportCsv() {
    const esc = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["id", "title", "status", "urgency", "blocked", "project", "claimedBy", "mode", "cron", "nextRunAt", "model", "createdAt", "updatedAt", "comments", "executions"];
    const rows = this.state.ledger.tasks.map((t) => [
      t.id,
      t.title,
      t.status,
      t.urgency,
      t.blocked ? "yes" : "no",
      t.workspaceId,
      t.claimedBy ?? "",
      t.execution.mode,
      t.execution.cron ?? "",
      t.execution.nextRunAt !== void 0 ? new Date(t.execution.nextRunAt).toISOString() : "",
      t.model !== void 0 ? `${t.model.provider}/${t.model.model}` : "",
      new Date(t.createdAt).toISOString(),
      new Date(t.updatedAt).toISOString(),
      t.comments.length,
      t.executions.length
    ].map(esc).join(","));
    const stamp = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name2 = `dsh-taskboard-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.csv`;
    this.download(name2, `\uFEFF${[header.join(","), ...rows].join("\r\n")}`, "text/csv");
  }
  /** Trigger a browser download (no-op when the DOM is unavailable). */
  download(filename, body, type) {
    try {
      const blob = new Blob([body], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5e3);
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    }
  }
};

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/styles.ts
var STYLES = `
.dsh-atb-external-mapping { display: flex; gap: 8px; margin: 12px 0; align-items: flex-end; }
.dsh-atb-external-options { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 9px 0; font-size: 12px; }
.dsh-atb-external .dsh-atb-external-options > label { flex: 0 0 auto; margin: 0; white-space: nowrap; }
.dsh-atb-external-scope-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; overflow-wrap: anywhere; font-size: 12px; }
.dsh-atb-external .dsh-atb-external-mapping > label { flex: 1; margin: 0; }
.dsh-atb-external .dsh-atb-external-remove { flex: 0 0 36px; width: 36px; height: 36px; box-sizing: border-box; padding: 0; display: inline-flex; align-items: center; justify-content: center; align-self: flex-end; color: var(--dsw-text-secondary, #71717a); }
.dsh-atb-external .dsh-atb-external-remove:hover:not(:disabled) { color: #dc2626; border-color: #fca5a5; background: rgba(239,68,68,.08); }
.dsh-atb-external .dsh-atb-external-remove:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
.dsh-atb-external-mapping input, .dsh-atb-external-mapping select { height: 36px; }
@media (max-width: 600px) {
  .dsh-atb-external-mapping { flex-wrap: wrap; }
  .dsh-atb-external .dsh-atb-external-mapping > .dsh-atb-external-scope { flex: 0 0 100%; }
}
.dsh-atb-external label { display: flex; flex-direction: column; gap: 5px; margin: 9px 0; min-width: 0; font-size: 12px; }
.dsh-atb-external input, .dsh-atb-external select { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid var(--dsw-border, #d4d4d8); border-radius: 6px; background: var(--dsw-bg, transparent); color: inherit; font: inherit; }
.dsh-atb-external button { padding: 7px 10px; border: 1px solid var(--dsw-border, #d4d4d8); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dsh-atb-external button:disabled { opacity: .5; cursor: default; }
.dsh-atb-external fieldset > div > label { flex: 1; }
.dsh-atb-entry {
  display: flex; align-items: center; gap: 8px; position: relative;
  width: calc(100% - 8px); margin: 2px 4px; padding: 6px 10px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-text-secondary, inherit); font: inherit; font-size: 13px;
  cursor: pointer; text-align: left;
}
.dsh-atb-entry:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); color: var(--dsw-text-primary, inherit); }
.dsh-atb-entry[data-active="true"] { background: var(--dsw-active, rgba(128,128,128,.18)); color: var(--dsw-text-primary, inherit); font-weight: 500; }
.dsh-atb-entry svg { flex: none; }
.dsh-atb-entry-stats {
  margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; line-height: 1; color: var(--dsw-text-secondary, gray);
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: help;
}
.dsh-atb-entry-sep { opacity: .5; }
.dsh-atb-roll[data-stat="todo"] { color: #3e63dd; }
.dsh-atb-roll[data-stat="in_progress"] { color: #d9822b; }
.dsh-atb-roll[data-stat="in_review"] { color: #8e4ec6; }
.dsh-atb-roll {
  position: relative; display: inline-block; overflow: hidden;
  height: 12px; min-width: 1ch; text-align: center; vertical-align: middle;
}
.dsh-atb-rn { display: block; height: 12px; line-height: 12px; text-align: center; }
.dsh-atb-rn-next { position: absolute; left: 0; right: 0; top: 100%; }
.dsh-atb-roll[data-dir="down"] .dsh-atb-rn-next { top: auto; bottom: 100%; }
.dsh-atb-roll .dsh-atb-rn { transition: transform .3s cubic-bezier(.25, .1, .25, 1); }
.dsh-atb-roll[data-anim="1"][data-dir="up"] .dsh-atb-rn { transform: translateY(-100%); }
.dsh-atb-roll[data-anim="1"][data-dir="down"] .dsh-atb-rn { transform: translateY(100%); }
@media (prefers-reduced-motion: reduce) {
  .dsh-atb-roll .dsh-atb-rn { transition: none; }
}

.dsh-atb-panel-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.dsh-atb-pglyph { display: inline-flex; align-items: center; }
.dsh-atb-picon { position: relative; display: inline-flex; }
button[class*="panelRow"]:has(.dsh-atb-pglyph) { position: relative; }
.dsh-atb-pstats {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; line-height: 1; color: var(--dsw-text-secondary, gray);
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: help;
}
.dsh-atb-psep { opacity: .5; }
.dsh-atb-pstats [data-stat="todo"] { color: #3e63dd; }
.dsh-atb-pstats [data-stat="in_progress"] { color: #d9822b; }
.dsh-atb-pstats [data-stat="in_review"] { color: #8e4ec6; }
.dsh-atb-pbadge {
  position: absolute; top: -5px; right: -8px;
  min-width: 13px; height: 13px; padding: 0 3px;
  border-radius: 7px; background: #3e63dd; color: #fff;
  font-size: 9px; line-height: 13px; text-align: center;
  font-variant-numeric: tabular-nums; pointer-events: none;
}

[data-sidebar-collapsed] [data-dsh-atb-entry],
[class*="_collapsed"] [data-dsh-atb-entry] {
  width: 36px; height: 36px; min-width: 36px;
  margin: 0 0 12px; padding: 0;
  justify-content: center; gap: 0; text-align: center;
}
[data-sidebar-collapsed] [data-dsh-atb-entry] .dsh-atb-entry-label,
[data-sidebar-collapsed] [data-dsh-atb-entry] .dsh-atb-entry-stats,
[class*="_collapsed"] [data-dsh-atb-entry] .dsh-atb-entry-label,
[class*="_collapsed"] [data-dsh-atb-entry] .dsh-atb-entry-stats { display: none; }
[data-sidebar-collapsed] [data-dsh-atb-entry] svg,
[class*="_collapsed"] [data-dsh-atb-entry] svg { width: 16px; height: 16px; }

.dsh-atb-search { width: 130px; }
.dsh-atb-badge[data-kind="stale"] { background: rgba(217,130,43,.15); color: #d9822b; }

html[data-dsh-atb-active] [data-pane="conversation"] > *:not([data-dsh-atb-view]),
html[data-dsh-atb-active] [class*="centerCol"] > *:not([data-dsh-atb-view]),
html[data-dsh-atb-active] .dshDesktopConversationSurface > *:not([data-dsh-atb-view]) { display: none !important; }
.dsh-atb-view { display: none; }
html[data-dsh-atb-active] .dsh-atb-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.dsh-atb-board { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px 16px; gap: 10px; box-sizing: border-box; }
.dsh-atb-view[data-dsh-atb-windows] > .dsh-atb-board {
  padding-top: max(12px, calc(env(titlebar-area-y, 0px) + env(titlebar-area-height, 36px) + 8px - var(--dsh-atb-viewport-top, 0px)));
}
.dsh-atb-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
html[data-dsh-atb-active] body[data-dsh-sidebar-collapsed] .dsh-atb-toolbar { padding-right: 62px; }
.dsh-atb-title { font-size: 15px; font-weight: 600; margin: 0; }
.dsh-atb-count { font-size: 12px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-ver {
  font-size: 11px; color: var(--dsw-text-secondary, gray);
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
  text-decoration: none;
  padding: 1px 9px; border-radius: 999px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.1));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.22));
  transition: border-color .12s ease, color .12s ease;
}
.dsh-atb-ver:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.6)); color: inherit; }
.dsh-atb-spacer { flex: 1; }
.dsh-atb-select, .dsh-atb-input {
  font: inherit; font-size: 12.5px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-border, var(--dsw-alias-border-l2, rgba(128,128,128,.35)));
  background: var(--dsw-alias-bg-module-platform, var(--dsw-bg-elevated, var(--dsw-bg, transparent)));
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, inherit));
  color-scheme: light dark;
}
.dsh-atb-select option,
.dsh-atb-modal-body select option {
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-module-platform, #252830));
  color: var(--dsw-alias-label-primary, var(--dsw-text-primary, #e6e8eb));
}
body[data-ds-dark-theme] .dsh-atb-board,
body[data-ds-dark-theme] .dsh-atb-modal,
body[data-ds-dark-theme] .dsh-atb-select,
body[data-ds-dark-theme] .dsh-atb-input,
body[data-ds-dark-theme] .dsh-atb-modal-body select,
body[data-ds-dark-theme] .dsh-atb-modal-body input,
body[data-ds-dark-theme] .dsh-atb-modal-body textarea {
  color-scheme: dark;
}
body[data-ds-dark-theme] .dsh-atb-select option,
body[data-ds-dark-theme] .dsh-atb-modal-body select option {
  background: #252830;
  color: #e6e8eb;
}
@media (prefers-color-scheme: dark) {
  .dsh-atb-select,
  .dsh-atb-input,
  .dsh-atb-modal-body select,
  .dsh-atb-modal-body input,
  .dsh-atb-modal-body textarea {
    color-scheme: dark;
  }
  .dsh-atb-select option,
  .dsh-atb-modal-body select option {
    background: #252830;
    color: #e6e8eb;
  }
}
.dsh-atb-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; padding: 3px 9px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  background: transparent; color: var(--dsw-text-secondary, inherit);
}
.dsh-atb-chip[data-on="true"] { color: #fff; border-color: transparent; }
.dsh-atb-chip[data-urgency="urgent"][data-on="true"] { background: #e5484d; }
.dsh-atb-chip[data-urgency="normal"][data-on="true"] { background: #8e4ec6; }
.dsh-atb-chip[data-urgency="relaxed"][data-on="true"] { background: #3e63dd; }
.dsh-atb-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dsh-atb-dot[data-urgency="urgent"] { background: #e5484d; }
.dsh-atb-dot[data-urgency="normal"] { background: #8e4ec6; }
.dsh-atb-dot[data-urgency="relaxed"] { background: #3e63dd; }
.dsh-atb-dot[data-status="backlog"] { background: #8a8f98; }
.dsh-atb-dot[data-status="todo"] { background: #3e63dd; }
.dsh-atb-dot[data-status="in_progress"] { background: #d9822b; }
.dsh-atb-dot[data-status="in_review"] { background: #8e4ec6; }
.dsh-atb-dot[data-status="done"] { background: #2ea043; }
.dsh-atb-dot[data-status="canceled"], .dsh-atb-dot[data-status="archived"] { background: #8a8f98; }
.dsh-atb-dot[data-status="trashed"] { background: #e5484d; }

.dsh-atb-btn {
  font: inherit; font-size: 12.5px; padding: 5px 11px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.08)); color: inherit;
}
.dsh-atb-btn:hover { background: var(--dsw-hover, rgba(128,128,128,.18)); }
.dsh-atb-btn:disabled { opacity: .45; cursor: default; }
.dsh-atb-btn[data-primary="true"] { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #1f2328)); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff); }
.dsh-atb-btn[data-danger="true"] { color: var(--dsw-alias-state-error-primary, #e5484d); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 45%, transparent); }

.dsh-atb-columns { display: flex; gap: 10px; flex: 1; min-height: 0; overflow-x: auto; }

.dsh-atb-detailpanel {
  display: flex; flex-direction: column;
  flex: none; max-height: 55%; min-height: 180px; overflow: hidden;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.25)); border-radius: 12px;
  background: var(--dsw-bg-panel, var(--dsw-bg-elevated, rgba(128,128,128,.05)));
  padding: 10px 12px; box-shadow: 0 -4px 18px rgba(0,0,0,.12);
}
.dsh-atb-detailpanel .dsh-atb-detail { flex: 1; min-height: 0; }
.dsh-atb-column { display: flex; flex-direction: column; flex: 1 1 0; min-width: 200px; min-height: 0; border-radius: 10px; background: var(--dsw-bg-inset, rgba(128,128,128,.07)); padding: 8px; gap: 8px; transition: flex-basis .15s ease, min-width .15s ease, max-width .15s ease; }
.dsh-atb-column[data-collapsed="true"] {
  flex: 0 0 42px;
  min-width: 42px;
  max-width: 42px;
  padding: 8px 4px;
  cursor: pointer;
  align-items: center;
  user-select: none;
}
.dsh-atb-column[data-collapsed="true"]:hover {
  background: var(--dsw-bg-hover, rgba(128,128,128,.12));
}
.dsh-atb-colhead { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 2px 4px; }
.dsh-atb-colcount { font-size: 11px; font-weight: 400; color: var(--dsw-text-secondary, gray); }
.dsh-atb-colfoldbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--dsw-text-secondary, gray);
  padding: 2px;
  border-radius: 4px;
  margin-left: auto;
  line-height: 1;
}
.dsh-atb-colfoldbtn:hover {
  color: var(--dsw-text-primary, currentColor);
  background: var(--dsw-hover, rgba(128,128,128,.15));
}
.dsh-atb-col-collapsed-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding-top: 4px;
}
.dsh-atb-col-collapsed-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.dsh-atb-col-collapsed-text {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-text-secondary, inherit);
}
.dsh-atb-colhead .dsh-atb-btn { margin-left: auto; padding: 1px 8px; font-size: 11px; }
.dsh-atb-colhead .dsh-atb-btn + .dsh-atb-btn { margin-left: 0; }
.dsh-atb-colhead .dsh-atb-selectall { flex: none; margin: 0 2px 0 6px; cursor: pointer; }
.dsh-atb-selrow { display: flex; align-items: flex-start; gap: 4px; }
.dsh-atb-selrow .dsh-atb-card, .dsh-atb-selrow > div { flex: 1; min-width: 0; }
.dsh-atb-selbox { flex: none; margin: 4px 0 0 0; cursor: pointer; }
.dsh-atb-cards { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; flex: 1; padding: 2px; }
.dsh-atb-ws-group { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-ws-group + .dsh-atb-ws-group { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--dsw-border, rgba(128,128,128,.2)); }
.dsh-atb-ws-group-head {
  border: none; width: 100%; box-sizing: border-box; font-family: inherit; text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: 6px;
  font-size: 11.5px; font-weight: 600; color: var(--dsw-text-secondary, inherit);
  /* Sticky project header: the column head above never scrolls (it
     lives outside the scroller), but the project row used to ride up with its
     cards \u2014 on a long column the project name left the screen first. Pin it to
     the top of the card scroller so the group you are reading stays labelled.
     The fill must be OPAQUE: three stacked layers reproduce exactly what sits
     behind the row (board base + column inset + hover tint), so cards passing
     underneath never bleed through the label. */
  position: sticky; top: 0; z-index: 2;
  background:
    linear-gradient(var(--dsw-bg-hover, rgba(128,128,128,.08)), var(--dsw-bg-hover, rgba(128,128,128,.08))),
    linear-gradient(var(--dsw-bg-inset, rgba(128,128,128,.07)), var(--dsw-bg-inset, rgba(128,128,128,.07))),
    var(--dsw-alias-bg-base, #fff);
  user-select: none;
}
.dsh-atb-ws-group-icon { display: inline-flex; align-items: center; justify-content: center; opacity: .8; line-height: 1; }
.dsh-atb-ws-group-head:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3e63dd); outline-offset: -2px; }
.dsh-atb-ws-group-chevron { flex-shrink: 0; }
.dsh-atb-ws-group-head[aria-expanded="true"] .dsh-atb-ws-group-chevron { transform: rotate(90deg); }
.dsh-atb-ws-group-cards[hidden] { display: none; }
.dsh-atb-ws-group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-ws-group-count {
  font-size: 10px; font-weight: 500; padding: 0.5px 5px; border-radius: 10px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.14)); color: var(--dsw-text-secondary, gray);
}
.dsh-atb-ws-group-cards { display: flex; flex-direction: column; gap: 8px; }

.dsh-atb-card {
  position: relative; border-radius: 9px; padding: 8px 10px 8px 13px; cursor: pointer;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.1));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.25));
  font-size: 13px; text-align: left; color: inherit; width: 100%; box-sizing: border-box;
}
.dsh-atb-card:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.55)); }
.dsh-atb-card[draggable="true"] { cursor: grab; }
.dsh-atb-card[data-dragging] { opacity: .45; }
.dsh-atb-column[data-dragover] { outline: 2px dashed var(--dsw-border-strong, rgba(128,128,128,.55)); outline-offset: -2px; background: var(--dsw-bg-hover, rgba(128,128,128,.12)); }
.dsh-atb-card::before {
  content: ""; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 3.5px; border-radius: 3px;
}
.dsh-atb-card[data-urgency="urgent"]::before { background: #e5484d; }
.dsh-atb-card[data-urgency="normal"]::before { background: #8e4ec6; }
.dsh-atb-card[data-urgency="relaxed"]::before { background: #3e63dd; }
.dsh-atb-card-title { font-weight: 550; line-height: 1.35; word-break: break-word; }
.dsh-atb-card-meta { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 11px; color: var(--dsw-text-secondary, gray); flex-wrap: wrap; }
.dsh-atb-badge { font-size: 10.5px; padding: 1px 6px; border-radius: 5px; background: rgba(128,128,128,.18); }
.dsh-atb-badge[data-kind="blocked"] { background: rgba(229,72,77,.18); color: #e5484d; }
.dsh-atb-badge[data-kind="scheduled"] { background: rgba(62,99,221,.16); color: #3e63dd; }
.dsh-atb-badge[data-kind="trashed"] { background: rgba(229,72,77,.14); color: #e5484d; text-decoration: line-through; }
.dsh-atb-badge[data-kind="done"] { background: rgba(46,160,67,.16); color: #2ea043; }
.dsh-atb-badge[data-kind="running"] { background: rgba(229,152,42,.16); color: #e69842; }
.dsh-atb-badge[data-kind="session"] {
  background: rgba(142, 78, 198, 0.12);
  color: var(--dsw-alias-state-business-primary, #7c3aed);
  border: 1px solid rgba(142, 78, 198, 0.25);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all .15s ease;
}
.dsh-atb-badge[data-kind="session"]:hover {
  background: rgba(142, 78, 198, 0.22);
  border-color: rgba(142, 78, 198, 0.45);
}
.dsh-atb-card-session {
  font: inherit; font-size: 10.5px; line-height: 1; padding: 2px 6px; border-radius: 5px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.3));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.14));
  color: var(--dsw-text-secondary, inherit);
  cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
  transition: all .15s ease;
}
.dsh-atb-card-session:hover {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  background: var(--dsw-hover, rgba(128,128,128,.24));
  color: var(--dsw-alias-label-primary, inherit);
}

.dsh-atb-quick { display: flex; gap: 6px; margin-top: 7px; }
.dsh-atb-quickbtn {
  flex: 1; font-size: 11.5px; padding: 3px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.3));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.12)); color: inherit;
}
.dsh-atb-quickbtn:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.6)); }
.dsh-atb-quickbtn[data-act="done"] { background: rgba(46,160,67,.14); color: #2ea043; border-color: rgba(46,160,67,.4); }
.dsh-atb-quickbtn[data-act="done"]:hover { background: rgba(46,160,67,.22); }
.dsh-atb-quickbtn[data-act="reject"] { background: rgba(229,152,42,.12); color: #d9822b; border-color: rgba(229,152,42,.4); }
.dsh-atb-quickbtn[data-act="reject"]:hover { background: rgba(229,152,42,.2); }
.dsh-atb-quick-reject { display: flex; gap: 6px; margin-top: 7px; align-items: stretch; }
.dsh-atb-quick-note { flex: 1; min-width: 0; font-size: 11.5px; padding: 3px 8px; }

.dsh-atb-error { font-size: 12px; color: #e5484d; padding: 4px 8px; border-radius: 6px; background: rgba(229,72,77,.1); }
.dsh-atb-empty { font-size: 12px; color: var(--dsw-text-secondary, gray); padding: 10px 4px; }
.dsh-atb-done-foldbar {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 8px 10px; margin-top: 4px; border-radius: 8px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.08));
  border: 1px dashed var(--dsw-border, rgba(128,128,128,.3)); text-align: center;
}
.dsh-atb-done-foldtip { font-size: 11px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-done-foldbtn { font-size: 11.5px; padding: 2px 10px; }

.dsh-atb-detail {
  display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; flex: 1;
  padding: 2px; position: relative;
}
.dsh-atb-detail::before {
  content: ""; position: sticky; top: 0; height: 3px; border-radius: 3px; flex: none;
}
.dsh-atb-detail[data-urgency="urgent"]::before { background: linear-gradient(90deg, #e5484d, rgba(229,72,77,.15)); }
.dsh-atb-detail[data-urgency="normal"]::before { background: linear-gradient(90deg, #8e4ec6, rgba(142,78,198,.15)); }
.dsh-atb-detail[data-urgency="relaxed"]::before { background: linear-gradient(90deg, #3e63dd, rgba(62,99,221,.15)); }

.dsh-atb-detail-head { display: flex; align-items: flex-start; gap: 10px; }
.dsh-atb-detail-titlewrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-detail-titlebar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-atb-detail-titlebar h3 { margin: 0; font-size: 15.5px; line-height: 1.35; word-break: break-word; }
.dsh-atb-detail-close {
  flex: none; width: 26px; height: 26px; border-radius: 7px; border: none; cursor: pointer;
  background: transparent; color: var(--dsw-text-secondary, gray); font-size: 13px; line-height: 1;
}
.dsh-atb-detail-close:hover { background: var(--dsw-hover, rgba(128,128,128,.18)); color: inherit; }
.dsh-atb-detail-topbtns { display: flex; align-items: center; gap: 6px; flex: none; }
.dsh-atb-detail-edit {
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.07)); color: var(--dsw-text-secondary, inherit);
}
.dsh-atb-detail-edit:hover { border-color: var(--dsw-alias-brand-primary, #1f2328); color: var(--dsw-alias-label-primary, inherit); }
.dsh-atb-detail-session {
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.1));
  color: var(--dsw-alias-label-primary, inherit);
  display: inline-flex; align-items: center; gap: 4px;
}
.dsh-atb-detail-session:hover {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  background: var(--dsw-hover, rgba(128,128,128,.22));
}

.dsh-atb-statuspill {
  flex: none; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; letter-spacing: .02em;
}
.dsh-atb-statuspill[data-status="backlog"] { background: rgba(128,128,128,.18); color: var(--dsw-text-secondary, #888); }
.dsh-atb-statuspill[data-status="todo"] { background: rgba(62,99,221,.15); color: #3e63dd; }
.dsh-atb-statuspill[data-status="in_progress"] { background: rgba(230,152,66,.16); color: #d9822b; }
.dsh-atb-statuspill[data-status="in_review"] { background: rgba(142,78,198,.16); color: #8e4ec6; }
.dsh-atb-statuspill[data-status="done"] { background: rgba(46,160,67,.16); color: #2ea043; }
.dsh-atb-statuspill[data-status="canceled"], .dsh-atb-statuspill[data-status="archived"] { background: rgba(128,128,128,.14); color: var(--dsw-text-secondary, #888); }

.dsh-atb-detail-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-chip2 {
  display: inline-flex; align-items: center; gap: 4px; font-size: 11px; line-height: 1;
  padding: 3px 8px; border-radius: 6px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.09)); color: var(--dsw-text-secondary, #999);
}
button.dsh-atb-chip2.dsh-atb-chip-btn {
  font: inherit; border: 1px solid var(--dsw-border, rgba(128,128,128,.25)); cursor: pointer;
}
button.dsh-atb-chip2.dsh-atb-chip-btn:hover {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-hover, rgba(128,128,128,.2));
}
.dsh-atb-chip2-icon { font-size: 10.5px; opacity: .85; }
.dsh-atb-chip2[data-tone="urgent"] { background: rgba(229,72,77,.15); color: #e5484d; }
.dsh-atb-chip2[data-tone="normal"] { background: rgba(142,78,198,.14); color: #a06ce0; }
.dsh-atb-chip2[data-tone="relaxed"] { background: rgba(62,99,221,.13); color: #6d92e8; }
.dsh-atb-detail-sub { font-size: 11.5px; color: var(--dsw-text-secondary, gray); }

.dsh-atb-fieldcard {
  border: 1px solid var(--dsw-border, rgba(128,128,128,.22)); border-radius: 10px;
  padding: 9px 11px; display: flex; flex-direction: column; gap: 5px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.06));
}
.dsh-atb-fieldcard-label {
  font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  color: var(--dsw-text-secondary, gray);
}
.dsh-atb-fieldcard[data-kind="prompt"] .dsh-atb-fieldcard-label { color: #8e63c8; }
.dsh-atb-promptbox {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
  background: var(--dsw-bg-inset, rgba(128,128,128,.08)); border-radius: 7px; padding: 8px 10px;
  border: 1px dashed var(--dsw-border, rgba(128,128,128,.25));
}
.dsh-atb-desc { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.55; }

.dsh-atb-detail-actions { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-detail-run {
  font: inherit; font-size: 12px; font-weight: 600; padding: 4px 11px; border-radius: 7px; cursor: pointer;
  border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #1f2328)); color: var(--dsw-alias-label-primary-foreground, #fff);
  transition: filter .12s ease;
}
.dsh-atb-detail-run:hover { filter: brightness(1.1); }
.dsh-atb-detail-run[data-danger="true"] { background: rgba(229,72,77,.92); }
.dsh-atb-movebtns { display: flex; gap: 6px; flex-wrap: wrap; }
.dsh-atb-movebtn {
  font: inherit; font-size: 12px; padding: 4px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg-elevated, rgba(128,128,128,.07)); color: var(--dsw-text-secondary, inherit);
  transition: border-color .12s ease, color .12s ease;
}
.dsh-atb-movebtn:hover { border-color: var(--dsw-border-strong, rgba(128,128,128,.6)); color: inherit; }
.dsh-atb-movebtn[data-to="done"] { border-color: rgba(46,160,67,.55); color: #2ea043; }
.dsh-atb-movebtn[data-to="done"]:hover { background: rgba(46,160,67,.12); }
.dsh-atb-movebtn[data-to="canceled"], .dsh-atb-movebtn[data-to="archived"] { opacity: .75; }
.dsh-atb-movebtn[data-to="blocked"] { border-color: rgba(229,72,77,.45); }
.dsh-atb-movebtn[data-to="blocked"]:hover { background: rgba(229,72,77,.1); }
.dsh-atb-confirm { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-confirm-label { font-size: 11.5px; color: var(--dsw-text-secondary, gray); }

.dsh-atb-section { font-size: 13px; display: flex; flex-direction: column; gap: 7px; }
.dsh-atb-section h4 {
  margin: 0; font-size: 11px; color: var(--dsw-text-secondary, gray);
  text-transform: uppercase; letter-spacing: .05em; display: flex; align-items: center; gap: 6px;
}
.dsh-atb-count2 {
  font-size: 10px; font-weight: 600; padding: 0 6px; border-radius: 999px; line-height: 16px;
  background: var(--dsw-bg-inset, rgba(128,128,128,.14)); color: var(--dsw-text-secondary, gray);
}
.dsh-atb-empty2 { font-size: 12px; color: var(--dsw-text-secondary, gray); padding: 8px 0; }

.dsh-atb-commentlist { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-bubble { display: flex; gap: 8px; }
.dsh-atb-bubble-avatar {
  flex: none; width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; background: var(--dsw-bg-inset, rgba(128,128,128,.12));
}
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-avatar { background: rgba(142,78,198,.15); }
.dsh-atb-bubble-main {
  flex: 1; min-width: 0; border-radius: 10px; padding: 6px 10px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.08));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.18));
}
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-main { border-color: rgba(142,78,198,.3); background: rgba(142,78,198,.07); }
.dsh-atb-bubble-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
.dsh-atb-bubble-meta b { font-size: 11.5px; font-weight: 600; color: var(--dsw-text-primary, inherit); }
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-meta b { color: #a06ce0; }
.dsh-atb-bubble-meta span { font-size: 10.5px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-bubble-body { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }

.dsh-atb-markdown-body { white-space: pre-wrap; word-break: break-word; }
.dsh-atb-detail-img-wrap {
  display: inline-flex; flex-direction: column; gap: 4px; max-width: min(100%, 520px); margin: 6px 8px 6px 0;
  vertical-align: top;
}
.dsh-atb-detail-img {
  display: block; max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 8px; cursor: zoom-in;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.22)); background: var(--dsw-bg-inset, rgba(128,128,128,.08));
}
.dsh-atb-detail-img-caption { font-size: 10.5px; color: var(--dsw-text-secondary, gray); overflow-wrap: anywhere; }
.dsh-atb-lightbox-backdrop {
  position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 28px;
  background: rgba(0,0,0,.76); backdrop-filter: blur(3px);
}
.dsh-atb-lightbox-content { position: relative; max-width: 96vw; max-height: 92vh; }
.dsh-atb-lightbox-img { display: block; max-width: 96vw; max-height: 92vh; object-fit: contain; border-radius: 10px; }
.dsh-atb-lightbox-close {
  position: absolute; top: -14px; right: -14px; width: 30px; height: 30px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.38); background: rgba(20,20,20,.9); color: #fff;
}

.dsh-atb-composer { display: flex; gap: 7px; align-items: flex-end; margin-top: 2px; }
.dsh-atb-composer-input {
  flex: 1; font: inherit; font-size: 12.5px; line-height: 1.5; padding: 7px 10px; border-radius: 9px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.32));
  background: var(--dsw-bg, transparent); color: inherit; resize: vertical; min-height: 38px;
}
.dsh-atb-composer-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #1f2328); }
.dsh-atb-composer-send {
  flex: none; font: inherit; font-size: 12.5px; padding: 7px 14px; border-radius: 9px; cursor: pointer;
  border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #1f2328)); color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dsh-atb-composer-send:disabled { opacity: .4; cursor: default; }
.dsh-atb-image-actions { display: flex; align-items: center; gap: 8px; padding: 5px 1px 0; }
.dsh-atb-image-add {
  flex: none; font: inherit; font-size: 11.5px; line-height: 1.4; padding: 4px 8px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.3)); background: var(--dsw-bg-elevated, rgba(128,128,128,.08)); color: inherit;
}
.dsh-atb-image-add:hover:not(:disabled) { background: var(--dsw-bg-hover, rgba(128,128,128,.14)); }
.dsh-atb-image-add:disabled { opacity: .45; cursor: default; }
.dsh-atb-image-hint { font-size: 10.5px; color: var(--dsw-text-secondary, gray); }

.dsh-atb-execlist { display: flex; flex-direction: column; gap: 5px; }
.dsh-atb-exec-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px;
  padding: 5px 9px; border-radius: 8px;
  background: var(--dsw-bg-elevated, rgba(128,128,128,.07));
  border: 1px solid var(--dsw-border, rgba(128,128,128,.16));
}
.dsh-atb-exec-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: rgba(128,128,128,.5); }
.dsh-atb-exec-dot[data-outcome="succeeded"] { background: #2ea043; box-shadow: 0 0 0 3px rgba(46,160,67,.15); }
.dsh-atb-exec-dot[data-outcome="failed"] { background: #e5484d; box-shadow: 0 0 0 3px rgba(229,72,77,.15); }
.dsh-atb-exec-dot[data-outcome="running"] { background: #d9822b; box-shadow: 0 0 0 3px rgba(217,130,43,.18); animation: dsh-atb-pulse 1.6s ease-in-out infinite; }
@keyframes dsh-atb-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.dsh-atb-exec-trigger { font-size: 11px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-exec-outcome { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 5px; }
.dsh-atb-exec-outcome[data-outcome="succeeded"] { background: rgba(46,160,67,.15); color: #2ea043; }
.dsh-atb-exec-outcome[data-outcome="failed"] { background: rgba(229,72,77,.14); color: #e5484d; }
.dsh-atb-exec-outcome[data-outcome="running"] { background: rgba(217,130,43,.15); color: #d9822b; }
.dsh-atb-exec-outcome[data-outcome="cancelled"] { background: rgba(128,128,128,.15); color: var(--dsw-text-secondary, gray); }
.dsh-atb-exec-time { font-size: 11px; color: var(--dsw-text-secondary, gray); }
.dsh-atb-exec-session {
  font: inherit; font-size: 11px; color: var(--dsw-text-secondary, gray);
  background: none; border: none; padding: 0; cursor: pointer;
}
.dsh-atb-exec-session:hover { color: var(--dsw-alias-brand-primary, inherit); text-decoration: underline dotted; }
.dsh-atb-exec-error { flex-basis: 100%; font-size: 11px; color: #e5484d; word-break: break-all; }

.dsh-atb-dangerzone {
  display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px;
  border-top: 1px dashed var(--dsw-border, rgba(128,128,128,.25));
}

.dsh-atb-modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  background: var(--dsw-alias-bg-mask-drop, rgba(28,30,36,.4)); backdrop-filter: var(--dsw-mask-blur, blur(2px));
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .14s ease;
}
@keyframes dsh-atb-fade { from { opacity: 0; } }
.dsh-atb-modal {
  width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 80px);
  display: flex; flex-direction: column; overflow: hidden; border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
  animation: dsh-atb-pop .16s ease;
}
.dsh-atb-taskform-modal {
  width: 1060px;
  min-width: 1060px;
  max-height: calc(100vh - 50px);
}
@keyframes dsh-atb-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
.dsh-atb-modal-head {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
}
.dsh-atb-modal-headicon {
  flex: none; width: 30px; height: 30px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; background: var(--dsw-alias-brand-primary, #1f2328); color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dsh-atb-modal-headtext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dsh-atb-modal-headtext h3 { margin: 0; font-size: 15px; line-height: 1.3; }
.dsh-atb-modal-headtext p { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary, gray); }
.dsh-atb-modal-close {
  flex: none; width: 26px; height: 26px; border-radius: 7px; border: none; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-tertiary, gray); font-size: 13px; line-height: 1;
}
.dsh-atb-modal-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); color: var(--dsw-alias-label-primary, inherit); }

.dsh-atb-modal-body {
  padding: 13px 16px; overflow-y: auto;
  display: grid; grid-template-columns: 1fr 1fr; gap: 11px 10px;
}
.dsh-atb-taskform-body {
  padding: 14px 18px;
  display: grid;
  grid-template-columns: 1.05fr 1.15fr;
  gap: 18px;
}
.dsh-atb-form-col {
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
}
.dsh-atb-form-left {
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.14));
  padding-right: 18px;
}
.dsh-atb-form-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dsh-atb-form-right .dsh-atb-field {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dsh-atb-form-right .dsh-atb-prompt-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dsh-atb-form-right .dsh-atb-prompt-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dsh-atb-form-right .dsh-atb-prompt-input {
  flex: 1;
  min-height: 130px;
  resize: vertical;
}
.dsh-atb-form-subgrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 768px) {
  .dsh-atb-taskform-modal { width: calc(100vw - 20px); min-width: 0; }
  .dsh-atb-taskform-body { grid-template-columns: 1fr; gap: 14px; padding: 12px 14px; }
  .dsh-atb-form-left { border-right: none; padding-right: 0; }
  .dsh-atb-form-right .dsh-atb-prompt-input { min-height: 90px; }
}
@media (min-width: 769px) and (max-width: 1099px) {
  .dsh-atb-taskform-modal { width: calc(100vw - 40px); min-width: 0; }
}
.dsh-atb-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dsh-atb-field[data-span="full"] { grid-column: 1 / -1; }
.dsh-atb-field-label {
  display: flex; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 600; letter-spacing: .03em;
  color: var(--dsw-alias-label-secondary, gray);
}
.dsh-atb-req { color: var(--dsw-alias-state-error-primary, #e5484d); font-style: normal; }
.dsh-atb-modal-body input:not([type="checkbox"]), .dsh-atb-modal-body textarea, .dsh-atb-modal-body select {
  font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px;
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: var(--dsw-specific-input-major, transparent); color: var(--dsw-alias-label-primary, inherit);
  transition: border-color .12s ease, box-shadow .12s ease;
}
.dsh-atb-modal-body textarea { min-height: 64px; resize: vertical; }
.dsh-atb-modal-body input:not([type="checkbox"]):focus, .dsh-atb-modal-body textarea:focus, .dsh-atb-modal-body select:focus {
  outline: none; border-color: var(--dsw-alias-brand-primary, #1f2328);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 18%, transparent);
}
.dsh-atb-modal-body .dsh-atb-input-bad { border-color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-modal-body .dsh-atb-input-bad:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 20%, transparent); }


.dsh-atb-mode-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.dsh-atb-mode-picker[data-exec="true"] { grid-template-columns: repeat(3, 1fr); }
.dsh-atb-mode-picker[data-exec="true"] .dsh-atb-mode-opt { padding: 7px 8px; }
.dsh-atb-mode-picker[data-exec="true"] .dsh-atb-mode-name { font-size: 12px; }
.dsh-atb-mode-picker[data-exec="true"] .dsh-atb-mode-hint { font-size: 10px; }
.dsh-atb-mode-opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 8px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: inherit;
  transition: border-color .12s ease, background .12s ease;
}
.dsh-atb-mode-name { font-size: 12.5px; font-weight: 600; }
.dsh-atb-mode-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-mode-opt:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); }
.dsh-atb-mode-opt[data-on="true"] { border-color: var(--dsw-alias-brand-primary, #1f2328); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 8%, transparent); }

.dsh-atb-cron-presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-cron-preset {
  font: inherit; font-size: 11px; padding: 2px 9px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
}
.dsh-atb-cron-preset:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); color: inherit; }
.dsh-atb-cron-preset[data-on="true"] { border-color: transparent; background: var(--dsw-alias-brand-primary, #1f2328); color: var(--dsw-alias-label-primary-foreground, #fff); }
.dsh-atb-cron-next { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }

.dsh-atb-modal-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
}
.dsh-atb-modal-hint { flex: 1; min-width: 0; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-modal-hint[data-tone="bad"] { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-modal-footbtns { display: flex; gap: 8px; }

.dsh-atb-secondary { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-link { color: var(--dsw-alias-state-business-primary, #3e63dd); cursor: pointer; text-decoration: none; }
.dsh-atb-link:hover { text-decoration: underline; }

.dsh-atb-alert-backdrop {
  position: fixed; inset: 0; z-index: 90;
  background: var(--dsw-alias-bg-mask-drop, rgba(28,30,36,.4)); backdrop-filter: var(--dsw-mask-blur, blur(2px));
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .12s ease;
}
.dsh-atb-alert {
  min-width: 280px; max-width: 380px; padding: 20px 24px; border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  animation: dsh-atb-pop .14s ease;
}
.dsh-atb-alert-icon { font-size: 28px; line-height: 1; }
.dsh-atb-alert-msg {
  font-size: 13.5px; line-height: 1.55; text-align: center;
  word-break: break-word; white-space: pre-wrap;
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-atb-alert .dsh-atb-btn { padding: 6px 28px; font-size: 13px; }

.dsh-atb-isolation-note { display: block; margin-top: 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-mode-picker[data-disabled="true"] .dsh-atb-mode-opt { cursor: not-allowed; opacity: .55; }
.dsh-atb-iso-none { font-size: 12.5px; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-repo[data-multi="true"] { padding: 6px 0 2px; border-top: 1px dashed var(--dsw-alias-border-secondary, #ddd2); }
.dsh-atb-iso-repo[data-multi="true"]:first-of-type { border-top: none; padding-top: 0; }
.dsh-atb-iso-repohead { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 6px; align-items: baseline; }
.dsh-atb-iso-repohead code {
font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; font-weight: 600;
color: var(--dsw-alias-state-business-primary, #3e63dd);
}
.dsh-atb-iso-facts { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 8px; }
.dsh-atb-iso-fact { font-size: 11.5px; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-fact b { font-weight: 600; color: var(--dsw-alias-state-business-primary, #3e63dd); }
.dsh-atb-iso-commits { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.dsh-atb-iso-commit { display: flex; gap: 8px; font-size: 11.5px; align-items: baseline; }
.dsh-atb-iso-commit code {
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  color: var(--dsh-alias-state-business-primary, #3e63dd); flex-shrink: 0;
}
.dsh-atb-iso-commit span { word-break: break-all; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-more { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-iso-nocommit { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, gray); margin-bottom: 8px; }
.dsh-atb-iso-dirty {
  font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #e5484d);
  background: rgba(229,72,77,.09); border: 1px solid rgba(229,72,77,.35);
  border-radius: 8px; padding: 6px 10px; margin-bottom: 8px;
}
.dsh-atb-iso-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-atb-iso-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }

.dsh-atb-diag { max-width: 520px; width: min(520px, 92vw); }
.dsh-atb-diag-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.dsh-atb-diag-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 6px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
}
.dsh-atb-diag-item b { font-size: 18px; font-weight: 700; }
.dsh-atb-diag-item span { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-diag-item[data-bad="true"] b { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-diag-sec h4 { margin: 0 0 8px; font-size: 12.5px; }
.dsh-atb-diag-orphans { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-diag-orphan {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 7px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
}
.dsh-atb-diag-orphan-path { font-size: 11.5px; font-family: ui-monospace, Consolas, monospace; word-break: break-all; }

.dsh-atb-cke { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-cke-row { display: flex; align-items: center; gap: 8px; }
.dsh-atb-cke-box { flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; }
.dsh-atb-cke-text {
  flex: 1; min-width: 0; font-size: 12.5px; padding: 6px 9px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-layer-1, transparent); color: inherit;
}
.dsh-atb-cke-del {
  flex-shrink: 0; border: none; background: none; cursor: pointer; padding: 4px;
  color: var(--dsw-alias-label-tertiary, gray); font-size: 12px; border-radius: 6px;
}
.dsh-atb-cke-del:hover { color: var(--dsw-alias-state-error-primary, #e5484d); background: rgba(229,72,77,.08); }
.dsh-atb-cke-add {
  align-self: flex-start; border: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,.4));
  background: none; color: var(--dsw-alias-label-secondary, inherit); cursor: pointer;
  font-size: 11.5px; padding: 5px 12px; border-radius: 8px;
}
.dsh-atb-cke-add:hover { color: var(--dsw-alias-state-business-primary, #3e63dd); border-color: var(--dsw-alias-state-business-primary, #3e63dd); }
.dsh-atb-cke-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }

.dsh-atb-cl-progress { margin-left: 8px; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-cl-progress[data-tone="bad"] { color: var(--dsw-alias-state-error-primary, #e5484d); font-weight: 600; }
.dsh-atb-cl-items { display: flex; flex-direction: column; gap: 5px; }
.dsh-atb-cl-item {
  display: flex; align-items: baseline; gap: 9px; padding: 6px 9px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.03)); cursor: pointer;
}
.dsh-atb-cl-item:hover { border-color: var(--dsw-alias-border-l2, rgba(128,128,128,.4)); }
.dsh-atb-cl-item input { flex-shrink: 0; transform: translateY(1px); cursor: pointer; }
.dsh-atb-cl-item[data-checked="true"] .dsh-atb-cl-text { text-decoration: line-through; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-cl-item[data-alert="true"] {
  border-color: rgba(229,72,77,.45); background: rgba(229,72,77,.06);
}
.dsh-atb-cl-text { flex: 1; min-width: 0; font-size: 12.5px; word-break: break-word; }
.dsh-atb-cl-meta { flex-shrink: 0; font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.dsh-atb-cl-note { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-secondary, inherit); }

.dsh-atb-rpt-summary { font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
.dsh-atb-rpt-sec { margin-bottom: 8px; }
.dsh-atb-rpt-label { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); margin-bottom: 4px; }
.dsh-atb-rpt-list { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.55; word-break: break-all; }
.dsh-atb-rpt-risk {
  font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
  color: var(--dsw-alias-state-warn-primary, #f5a524);
  background: rgba(245,165,36,.08); border: 1px solid rgba(245,165,36,.3);
  border-radius: 8px; padding: 6px 10px;
}

.dsh-atb-iso-commit { display: flex; flex-direction: column; gap: 3px; }
.dsh-atb-iso-commit-btn {
  display: flex; gap: 8px; font-size: 11.5px; align-items: baseline; text-align: left;
  border: none; background: none; padding: 2px 4px; margin: 0 -4px; border-radius: 6px; cursor: pointer;
  color: inherit; width: fit-content; max-width: 100%;
}
.dsh-atb-iso-commit-btn:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); }
.dsh-atb-iso-commit-btn code {
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  color: var(--dsw-alias-state-business-primary, #3e63dd); flex-shrink: 0;
}
.dsh-atb-iso-commit-btn span { word-break: break-all; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-iso-commit[data-open="true"] > .dsh-atb-iso-commit-btn code { font-weight: 700; }
.dsh-atb-iso-dirty { display: flex; flex-direction: column; gap: 6px;
  font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #e5484d);
  background: rgba(229,72,77,.09); border: 1px solid rgba(229,72,77,.35);
  border-radius: 8px; padding: 6px 10px; margin-bottom: 8px;
}
.dsh-atb-iso-dirty-toggle { border: none; background: none; cursor: pointer; padding: 0; text-align: left; color: inherit; font-size: inherit; }
.dsh-atb-iso-dirty-files { display: flex; flex-direction: column; gap: 2px; }
.dsh-atb-iso-dirty-file {
  border: none; background: none; cursor: pointer; text-align: left; padding: 1px 2px;
  font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); border-radius: 4px; word-break: break-all;
}
.dsh-atb-iso-dirty-file:hover { background: rgba(128,128,128,.1); color: var(--dsw-alias-state-business-primary, #3e63dd); }
.dsh-atb-iso-dirty-file code { font-family: ui-monospace, Consolas, monospace; font-size: 10px; margin-right: 6px; }
.dsh-atb-diffview { margin-top: 6px; border-radius: 8px; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }
.dsh-atb-diffview-head { display: flex; align-items: center; gap: 10px; padding: 5px 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); }
.dsh-atb-diffview-title { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  color: var(--dsw-alias-state-business-primary, #3e63dd); word-break: break-all; }
.dsh-atb-diffview-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-diffview-error { padding: 8px 10px; font-size: 11.5px; color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-diffview-pre {
  margin: 0; padding: 8px 10px; max-height: 340px; overflow: auto;
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; line-height: 1.5;
  white-space: pre; color: var(--dsw-alias-label-secondary, inherit);
}

.dsh-atb-newmenu { position: relative; display: inline-flex; }
.dsh-atb-newmenu-backdrop { position: fixed; inset: 0; z-index: 40; }
.dsh-atb-newmenu-list {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 41; min-width: 180px;
  display: flex; flex-direction: column; padding: 5px; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
}
.dsh-atb-newmenu-opt {
  border: none; background: none; text-align: left; cursor: pointer; padding: 7px 10px;
  font-size: 12.5px; color: inherit; border-radius: 7px; white-space: nowrap;
}
.dsh-atb-newmenu-opt:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.1)); }
.dsh-atb-newmenu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }
.dsh-atb-newmenu-catgroup { display: flex; flex-direction: column; }
.dsh-atb-newmenu-cat {
  padding: 6px 10px 3px; font-size: 11px; font-weight: 600;
  color: var(--dsw-alias-label-tertiary, gray); white-space: nowrap;
}

.dsh-atb-tplm { max-width: 640px; width: min(640px, 92vw); }
.dsh-atb-tplm .dsh-atb-modal-body,
.dsh-atb-set .dsh-atb-modal-body,
.dsh-atb-diag .dsh-atb-modal-body,
.dsh-atb-imp .dsh-atb-modal-body {
  display: flex; flex-direction: column; gap: 10px;
}
.dsh-atb-tplm-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.dsh-atb-tplm-catgroup { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-tplm-cathead { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-tertiary, gray); padding-left: 2px; }
.dsh-atb-tplm-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.02));
}
.dsh-atb-tplm-name {
  flex: 0 0 150px; width: 150px; max-width: 150px; font-size: 12.5px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-layer-1, transparent); color: inherit;
  box-sizing: border-box;
}
.dsh-atb-tplm-catwrap { position: relative; flex: 0 0 110px; width: 110px; max-width: 110px; }
.dsh-atb-tplm-category {
  width: 100%; max-width: 100%; font-size: 11.5px; padding: 5px 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-layer-1, transparent); color: inherit;
  box-sizing: border-box;
}
/* Suggestion dropdown for the category input: always full list, never filtered. */
.dsh-atb-tplm-catpop {
  position: absolute; top: calc(100% + 3px); left: 0; z-index: 6; min-width: 140px; max-height: 180px; overflow-y: auto;
  display: flex; flex-direction: column; padding: 4px; border-radius: 8px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.18));
}
.dsh-atb-tplm-catopt {
  border: none; background: none; text-align: left; cursor: pointer; padding: 5px 8px;
  font-size: 11.5px; color: inherit; border-radius: 6px; white-space: nowrap;
}
.dsh-atb-tplm-catopt:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.1)); }
/* Flipped variant: open upward when the input sits near the modal bottom. */
.dsh-atb-tplm-catpop-up { top: auto; bottom: calc(100% + 3px); }
.dsh-atb-tplm-catstatic {
  flex: 0 0 110px; max-width: 110px; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-atb-tplm-meta {
  flex: 1; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary, gray);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-atb-tplm-btns { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.dsh-atb-imp { max-width: 600px; width: min(600px, 92vw); }
.dsh-atb-imp-picker { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dsh-atb-imp-picker input[type="file"] { font-size: 12px; }
.dsh-atb-imp-filename { font-size: 11.5px; color: var(--dsw-alias-state-business-primary, #3e63dd); word-break: break-all; }
.dsh-atb-imp-note { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); margin-bottom: 10px; }
.dsh-atb-imp-error { font-size: 12px; color: var(--dsw-alias-state-error-primary, #e5484d); margin-bottom: 8px; }
.dsh-atb-imp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.dsh-atb-imp-stat {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 6px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));
}
.dsh-atb-imp-stat b { font-size: 17px; font-weight: 700; }
.dsh-atb-imp-stat span { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-imp-stat[data-tone="ok"] b { color: var(--dsw-alias-state-success-primary, #30a46c); }
.dsh-atb-imp-stat[data-tone="warn"] b { color: var(--dsw-alias-state-warn-primary, #f5a524); }
.dsh-atb-imp-stat[data-tone="bad"] b { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsh-atb-imp-sec h4 { margin: 0 0 6px; font-size: 12px; }
.dsh-atb-imp-sec { margin-bottom: 10px; }
.dsh-atb-imp-list { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
.dsh-atb-imp-row {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 5px 9px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
}
.dsh-atb-imp-row[data-tone="bad"] { border-color: rgba(229,72,77,.35); }
.dsh-atb-imp-row-title { font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-imp-row-status { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); flex-shrink: 0; }
.dsh-atb-imp-result { font-size: 12px; color: var(--dsw-alias-state-success-primary, #30a46c); margin-top: 10px; }
.dsh-atb-badge[data-kind="checklist"] { color: var(--dsw-alias-label-secondary, inherit); }
.dsh-atb-set { max-width: 860px; width: min(860px, 96vw); height: min(780px, 90vh); max-height: 90vh; }
.dsh-atb-settings-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.dsh-atb-settings-nav { flex: 0 0 138px; padding: 16px 10px; border-right: 1px solid var(--dsw-border, rgba(128,128,128,.2)); display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-settings-nav button { border: 0; border-radius: 7px; padding: 11px 12px; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.dsh-atb-settings-nav button[aria-selected="true"] { background: var(--dsw-active, rgba(99,102,241,.12)); color: var(--dsw-accent, #6366f1); font-weight: 600; }
.dsh-atb-settings-nav button:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
.dsh-atb-settings-content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dsh-atb-settings-content > [hidden] { display: none !important; }
.dsh-atb-settings-content > .dsh-atb-modal-body { flex: 1; min-height: 0; max-height: none; }
@media (max-width: 600px) { .dsh-atb-settings-nav { flex-basis: 94px; padding: 12px 6px; } .dsh-atb-settings-nav button { padding: 10px 6px; font-size: 12px; } .dsh-atb-settings-content .dsh-atb-modal-foot { flex-wrap: wrap; gap: 8px; } }
.dsh-atb-set .dsh-atb-mode-picker { margin-top: 8px; }
.dsh-atb-set .dsh-atb-isolation-note { margin-top: 10px; }
.dsh-atb-set .dsh-atb-perm-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 4px; }
.dsh-atb-set .dsh-atb-perm-opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 8px 10px; border-radius: 9px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; color: inherit;
  transition: border-color .12s ease, background .12s ease;
}
.dsh-atb-set .dsh-atb-perm-name { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; }
.dsh-atb-set .dsh-atb-perm-hint { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, gray); line-height: 1.35; }
.dsh-atb-set .dsh-atb-perm-opt:hover { border-color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.6)); }
.dsh-atb-set .dsh-atb-perm-opt[data-on="true"] {
  border-color: var(--dsw-alias-brand-primary, #1f2328);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 9%, transparent);
}
.dsh-atb-settings-numbers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }
.dsh-atb-settings-numbers label { display: grid; gap: 5px; font-size: 12px; color: var(--dsw-alias-label-secondary, #888); }
.dsh-atb-settings-numbers input { width: 100%; }
.dsh-atb-storage-path { width: 100%; margin-top: 10px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.dsh-atb-storage-meta { display: grid; gap: 4px; margin-top: 8px; color: var(--dsh-atb-muted); font-size: 12px; overflow-wrap: anywhere; }
.dsh-atb-storage-error { color: var(--dsh-atb-danger); }
.dsh-atb-storage-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.dsh-atb-storage-notice { display: grid; gap: 4px; margin-top: 8px; font-size: 12px; }
.dsh-atb-storage-notice-ok { color: var(--dsw-alias-state-success-primary, #2e7d32); padding: 4px 8px; border-radius: 6px; background: rgba(46,125,50,.1); }
.dsh-atb-storage-notice-warn { color: var(--dsw-alias-state-warning-primary, #b8860b); padding: 4px 8px; border-radius: 6px; background: rgba(184,134,11,.1); word-break: break-word; }


.dsh-atb-prompt-wrap {
  display: flex; flex-direction: column; gap: 6px; position: relative; width: 100%;
  border-radius: 9px; transition: border-color .12s ease;
}
.dsh-atb-prompt-wrap[data-drag-over="true"] {
  outline: 2px dashed var(--dsw-alias-brand-primary, #1f2328);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 6%, transparent);
}
.dsh-atb-prompt-inner { position: relative; width: 100%; }
.dsh-atb-prompt-input {
  width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; line-height: 1.5;
  padding: 7px 10px; border-radius: 8px; resize: vertical; min-height: 68px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: var(--dsw-specific-input-major, transparent); color: var(--dsw-alias-label-primary, inherit);
}
.dsh-atb-prompt-input:focus {
  outline: none; border-color: var(--dsw-alias-brand-primary, #1f2328);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #1f2328) 18%, transparent);
}

.dsh-atb-slash-popup {
  display: flex; flex-direction: column; overflow: hidden; border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, #fff); color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.28));
  box-shadow: var(--dsw-shadow-lv3, 0 10px 28px rgba(0,0,0,.22));
}
.dsh-atb-slash-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.15));
  background: var(--dsw-alias-bg-elevated, rgba(128,128,128,.06));
}
.dsh-atb-slash-title { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary, gray); }
.dsh-atb-slash-hint { font-size: 10px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-slash-list { overflow-y: auto; max-height: 200px; display: flex; flex-direction: column; padding: 4px; }
.dsh-atb-slash-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;
  cursor: pointer; font-size: 12px; transition: background .1s ease;
}
.dsh-atb-slash-item[data-active="true"], .dsh-atb-slash-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14));
}
.dsh-atb-slash-badge {
  font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;
}
.dsh-atb-slash-badge[data-kind="command"] { background: rgba(217,130,43,.15); color: #d9822b; }
.dsh-atb-slash-badge[data-kind="skill"] { background: rgba(142,78,198,.15); color: #a06ce0; }
.dsh-atb-slash-name { font-weight: 600; font-family: monospace; font-size: 12.5px; }
.dsh-atb-slash-param { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); font-family: monospace; }
.dsh-atb-slash-desc { font-size: 11px; color: var(--dsw-alias-label-secondary, gray); margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }

.dsh-atb-prompt-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-atb-prompt-tip { font-size: 11px; color: var(--dsw-alias-label-tertiary, gray); }
.dsh-atb-prompt-tip code { font-size: 10.5px; padding: 1px 4px; border-radius: 4px; background: rgba(128,128,128,.14); }

.dsh-atb-queuechip {
    margin-left: auto; padding: 1px 7px; border: none; border-radius: 9px;
    font-size: 11px; line-height: 16px; cursor: pointer; pointer-events: auto;
    background: var(--dsw-bg-tertiary, rgba(127,127,127,.15)); color: var(--dsw-text-secondary, gray);
    font-variant-numeric: tabular-nums;
  }
.dsh-atb-queuechip[data-bad="true"] { background: rgba(217,130,43,.18); color: #d9822b; }
.dsh-atb-queuechip:hover { filter: brightness(1.1); }

  .dsh-atb-queuepanel { width: 480px; max-width: 92vw; }
  .dsh-atb-queuepanel-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .dsh-atb-queuepanel-actions .dsh-atb-btn[data-armed="true"] {
    background: rgba(200,49,49,.85); color: #fff; border-color: transparent;
  }

/* Needs human & Review desk enhancement */
.dsh-atb-badge[data-kind="needs-human"] {
  background: rgba(245, 158, 11, 0.18) !important;
  color: #d97706 !important;
  border: 1px solid rgba(245, 158, 11, 0.45);
  font-weight: 600;
}
.dsh-atb-card[data-needs-human="true"] {
  border-color: rgba(245, 158, 11, 0.55);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.25);
  background: linear-gradient(to right, rgba(245, 158, 11, 0.06), var(--dsw-bg-elevated, rgba(128,128,128,.1)));
}
.dsh-atb-card[data-needs-human="true"]::before {
  background: #f59e0b !important;
  width: 4.5px;
}
.dsh-atb-card-deliverable {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
  border: 1px dashed var(--dsw-border, rgba(128, 128, 128, 0.25));
  font-size: 11.5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-atb-card-deliv-row {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-atb-card-deliv-tag {
  font-weight: 600;
  color: var(--dsw-text-secondary, #71717a);
  flex-shrink: 0;
}
.dsh-atb-card-deliv-val {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-atb-deliv-warn {
  color: #e5484d;
  font-weight: 550;
}
.dsh-atb-card-deliv-summary {
  font-size: 11px;
  color: var(--dsw-text-secondary, #71717a);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 2px;
}
.dsh-atb-reviewdesk {
  border: 1.5px solid var(--dsw-alias-brand-primary, #6366f1) !important;
  background: linear-gradient(to bottom, rgba(99, 102, 241, 0.04), var(--dsw-bg-elevated, rgba(128,128,128,.1))) !important;
}
.dsh-atb-deliv-summary-box {
  background: var(--dsw-bg, rgba(128,128,128,.08));
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 8px;
}
.dsh-atb-rpt-filelist, .dsh-atb-rpt-checklist {
  list-style: none;
  padding: 0;
  margin: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-atb-rpt-fileitem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.08);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dsh-atb-file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-atb-file-copybtn {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--dsw-border, #d4d4d8);
  background: transparent;
  cursor: pointer;
  color: inherit;
  flex-shrink: 0;
  margin-left: 8px;
}
.dsh-atb-file-copybtn:hover {
  background: var(--dsw-bg-hover, rgba(128,128,128,.15));
}
.dsh-atb-rpt-checkitem {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.4;
}
.dsh-atb-check-icon {
  color: #2ea043;
  font-weight: bold;
}
.dsh-atb-deliv-missing-box {
  padding: 12px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px dashed rgba(245, 158, 11, 0.35);
  color: var(--dsw-text-secondary, #71717a);
  font-size: 12.5px;
}
.dsh-atb-movebtn[data-to="needs-human-active"] {
  border-color: #d97706;
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
  font-weight: 600;
}
`;
var STYLE_ID = "dsh-taskboard-styles";
var PLUGIN_ID = "dsh-taskboard";
var CSS_TAG = "dsh-taskboard/styles";
function injectStyles() {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID);
  if (style === null) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.append(style);
  }
  style.dataset.plugin = PLUGIN_ID;
  style.dataset.pluginCss = CSS_TAG;
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/official-panel.tsx
var React = __toESM(require("react"), 1);

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskBoard.tsx
var import_react12 = require("react");

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/shared/version.ts
var PLUGIN_VERSION = "0.9.1";

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/labels.ts
var COLUMN_KEYS = {
  backlog: "status.column.backlog",
  todo: "status.column.todo",
  in_progress: "status.column.in_progress",
  in_review: "status.column.in_review",
  done: "status.column.done",
  canceled: "status.column.canceled",
  archived: "status.column.archived"
};
var STATUS_KEYS = {
  backlog: "status.pill.backlog",
  todo: "status.pill.todo",
  in_progress: "status.pill.in_progress",
  in_review: "status.pill.in_review",
  done: "status.pill.done",
  canceled: "status.pill.canceled",
  archived: "status.pill.archived"
};
var MOVE_KEYS = {
  backlog: "status.move.backlog",
  todo: "status.move.todo",
  in_progress: "status.move.in_progress",
  in_review: "status.move.in_review",
  done: "status.move.done",
  canceled: "status.move.canceled",
  archived: "status.move.archived"
};
var URGENCY_KEYS = {
  urgent: "urgency.urgent",
  normal: "urgency.normal",
  relaxed: "urgency.relaxed"
};
var OUTCOME_KEYS = {
  running: "outcome.running",
  succeeded: "outcome.succeeded",
  failed: "outcome.failed",
  cancelled: "outcome.cancelled"
};

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/shared/builtin-templates.ts
var BUILTIN_TEMPLATE_IDS = ["tpl-feature", "tpl-bugfix", "tpl-release", "tpl-patrol"];
var BUILTIN_TEMPLATE_CONTENT = {
  zh: {
    "tpl-feature": {
      name: "\u65B0\u589E\u529F\u80FD",
      category: "\u5F00\u53D1",
      task: {
        title: "\u65B0\u589E\uFF1A",
        prompt: [
          "\u5B9E\u73B0\u4EE5\u4E0A\u65B0\u529F\u80FD\u5E76\u6309\u5E8F\u4EA4\u63A5\uFF1A",
          "1. \u660E\u786E\u9700\u6C42\u8FB9\u754C\u4E0E\u9A8C\u6536\u6807\u51C6\uFF0C\u5217\u51FA\u5B9E\u73B0\u8981\u70B9",
          "2. \u5B9E\u73B0\u529F\u80FD\uFF08\u542B\u7C7B\u578B\u5B9A\u4E49\u4E0E\u9519\u8BEF\u5904\u7406\uFF09",
          "3. \u8865\u5145\u6D4B\u8BD5\uFF08\u5355\u6D4B/\u56DE\u5F52\uFF09",
          "4. \u8FD0\u884C\u76F8\u5173\u6D4B\u8BD5\u5957\u4EF6\u786E\u8BA4\u901A\u8FC7"
        ].join("\n"),
        urgency: "normal",
        checklist: ["\u5B9E\u73B0\u8981\u70B9\u5DF2\u660E\u786E\uFF08\u9700\u6C42\u8FB9\u754C\u4E0E\u9A8C\u6536\u6807\u51C6\uFF09", "\u529F\u80FD\u5DF2\u5B9E\u73B0\u5E76\u8865\u5145\u6D4B\u8BD5", "\u76F8\u5173\u6D4B\u8BD5\u5957\u4EF6\u901A\u8FC7"]
      }
    },
    "tpl-bugfix": {
      name: "Bug \u4FEE\u590D",
      category: "\u5F00\u53D1",
      task: {
        title: "\u4FEE\u590D\uFF1A",
        prompt: [
          "\u4FEE\u590D\u4EE5\u4E0A\u95EE\u9898\u5E76\u6309\u5E8F\u4EA4\u63A5\uFF1A",
          "1. \u590D\u73B0\u95EE\u9898\uFF08\u5199\u6700\u5C0F\u590D\u73B0\u6B65\u9AA4\u6216\u6D4B\u8BD5\uFF09",
          "2. \u5B9A\u4F4D\u6839\u56E0\uFF0C\u8BF4\u660E\u4E3A\u4EC0\u4E48\u4F1A\u53D1\u751F",
          "3. \u4FEE\u590D\u5E76\u8865\u56DE\u5F52\u6D4B\u8BD5",
          "4. \u8FD0\u884C\u76F8\u5173\u6D4B\u8BD5\u5957\u4EF6\u786E\u8BA4\u65E0\u56DE\u5F52"
        ].join("\n"),
        urgency: "urgent",
        checklist: ["\u5DF2\u590D\u73B0\u5E76\u5B9A\u4F4D\u6839\u56E0", "\u4FEE\u590D\u5DF2\u63D0\u4EA4\u5230\u4EFB\u52A1\u5206\u652F", "\u56DE\u5F52\u6D4B\u8BD5\u901A\u8FC7"]
      }
    },
    "tpl-release": {
      name: "\u53D1\u5E03\u68C0\u67E5",
      category: "\u5F00\u53D1",
      task: {
        title: "\u53D1\u5E03\uFF1A",
        prompt: "\u6267\u884C\u53D1\u5E03\u6D41\u7A0B\uFF1A\u7248\u672C\u53F7\u66F4\u65B0\u3001\u6784\u5EFA\u3001\u6D4B\u8BD5\u3001\u53D8\u66F4\u8BB0\u5F55\uFF0C\u5B8C\u6210\u540E\u6309\u5E8F\u4EA4\u63A5\uFF08\u4E0D\u8981\u5B9E\u9645\u63A8\u9001/\u53D1\u5E03\uFF0C\u7B49\u7528\u6237\u786E\u8BA4\uFF09\u3002",
        urgency: "normal",
        checklist: ["\u7248\u672C\u53F7\u5DF2\u66F4\u65B0\uFF08package.json \u4E0E\u7248\u672C\u5E38\u91CF\u540C\u6B65\uFF09", "\u6784\u5EFA\u901A\u8FC7", "\u5168\u90E8\u6D4B\u8BD5\u901A\u8FC7", "\u53D8\u66F4\u8BB0\u5F55\u5DF2\u5199"]
      }
    },
    "tpl-patrol": {
      name: "\u4F8B\u884C\u5DE1\u68C0",
      category: "\u8FD0\u7EF4",
      task: {
        title: "\u5DE1\u68C0\uFF1A",
        prompt: [
          "\u4F8B\u884C\u5DE1\u68C0\uFF1A\u68C0\u67E5\u4F9D\u8D56\u66F4\u65B0\u3001\u5931\u8D25\u6D4B\u8BD5\u3001\u660E\u663E\u4EE3\u7801\u95EE\u9898\u4E0E\u672A\u5904\u7406\u7684\u544A\u8B66\u3002",
          "\u53D1\u73B0\u7684\u95EE\u9898\u9010\u6761\u5217\u51FA\uFF08\u4E25\u91CD\u5EA6/\u4F4D\u7F6E/\u5EFA\u8BAE\uFF09\uFF0C\u5C0F\u95EE\u9898\u76F4\u63A5\u4FEE\u590D\uFF0C\u5927\u95EE\u9898\u53EA\u62A5\u544A\u4E0D\u52A8\u624B\u3002",
          "\u8F93\u51FA\u5DE1\u68C0\u6458\u8981\uFF08\u7528 {{lastComments}} \u53EF\u56DE\u770B\u4E0A\u6B21\u5DE1\u68C0\u7ED3\u8BBA\uFF09\u3002"
        ].join("\n"),
        urgency: "relaxed",
        execution: { mode: "scheduled", cron: "0 9 * * 1" }
      }
    }
  },
  en: {
    "tpl-feature": {
      name: "New feature",
      category: "Development",
      task: {
        title: "New feature:",
        prompt: [
          "Implement the new feature above and hand off in order:",
          "1. Clarify the requirement boundaries and acceptance criteria; list the implementation points",
          "2. Implement the feature (including type definitions and error handling)",
          "3. Add tests (unit / regression)",
          "4. Run the relevant test suites and confirm they pass"
        ].join("\n"),
        urgency: "normal",
        checklist: ["Implementation points clarified (requirement boundaries and acceptance criteria)", "Feature implemented with tests added", "Relevant test suites pass"]
      }
    },
    "tpl-bugfix": {
      name: "Bug fix",
      category: "Development",
      task: {
        title: "Fix:",
        prompt: [
          "Fix the issue above and hand off in order:",
          "1. Reproduce the issue (write minimal reproduction steps or a test)",
          "2. Locate the root cause and explain why it happens",
          "3. Fix it and add regression tests",
          "4. Run the relevant test suites and confirm there are no regressions"
        ].join("\n"),
        urgency: "urgent",
        checklist: ["Issue reproduced and root cause located", "Fix committed to the task branch", "Regression tests pass"]
      }
    },
    "tpl-release": {
      name: "Release check",
      category: "Development",
      task: {
        title: "Release:",
        prompt: "Run the release process: bump the version, build, test, and update the changelog, then hand off in order (do not actually push / publish \u2014 wait for user confirmation).",
        urgency: "normal",
        checklist: ["Version bumped (package.json and version constants in sync)", "Build passes", "All tests pass", "Changelog written"]
      }
    },
    "tpl-patrol": {
      name: "Routine patrol",
      category: "Operations",
      task: {
        title: "Patrol:",
        prompt: [
          "Routine patrol: check dependency updates, failing tests, obvious code issues, and unhandled alerts.",
          "List each finding (severity / location / suggestion); fix small issues directly, and only report (do not touch) large ones.",
          "Output a patrol summary (use {{lastComments}} to review the last patrol\u2019s conclusions)."
        ].join("\n"),
        urgency: "relaxed",
        execution: { mode: "scheduled", cron: "0 9 * * 1" }
      }
    }
  }
};
function builtinTemplateContent(id, locale) {
  if (!BUILTIN_TEMPLATE_IDS.includes(id)) return void 0;
  return BUILTIN_TEMPLATE_CONTENT[locale][id];
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/i18n/templates.ts
function localizeBuiltinName(tpl) {
  if (tpl.builtin !== true) return tpl.name;
  return builtinTemplateContent(tpl.id, localeStore.getSnapshot().active)?.name ?? tpl.name;
}
function localizeBuiltinTask(tpl) {
  if (tpl.builtin !== true) return tpl.task;
  return builtinTemplateContent(tpl.id, localeStore.getSnapshot().active)?.task ?? tpl.task;
}
function localizeBuiltinCategory(tpl) {
  if (tpl.builtin !== true) return tpl.category;
  return builtinTemplateContent(tpl.id, localeStore.getSnapshot().active)?.category ?? tpl.category;
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/template-categories.ts
function templateCategoryOf(template) {
  return localizeBuiltinCategory(template);
}
function groupTemplatesByCategory(templates) {
  const groups = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const template of templates) {
    const category = templateCategoryOf(template);
    const key = category ?? "";
    let group = byKey.get(key);
    if (group === void 0) {
      group = { category, templates: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.templates.push(template);
  }
  const fallback = groups.filter((group) => group.category === void 0);
  return [...groups.filter((group) => group.category !== void 0), ...fallback];
}
function templateCategoryOptions(templates) {
  return groupTemplatesByCategory(templates).flatMap((group) => group.category !== void 0 ? [group.category] : []);
}
function categoryLabel(category, t) {
  return category ?? t("tpl.category.default");
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/format.ts
function fmtTime(ms) {
  if (ms === void 0) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
var STALE_CLAIM_MS = 30 * 6e4;
function isStaleClaim(task, now) {
  if (task.status !== "in_progress") return false;
  const running = task.executions.filter((execution) => execution.outcome === "running");
  if (running.length === 0) return false;
  const activity = Math.max(...running.map((execution) => execution.lastActivityAt ?? task.claimedAt ?? -Infinity));
  return Number.isFinite(activity) && now - activity > STALE_CLAIM_MS;
}
function checkNeedsHuman(task) {
  const anyTask = task;
  if (anyTask.waitingForHuman === true) {
    return { needs: true, reason: typeof anyTask.waitingReason === "string" ? anyTask.waitingReason : void 0 };
  }
  const text = `${task.title} ${task.description} ${task.prompt}`.toLowerCase();
  const keywords = [
    { word: "\u62CD\u677F", label: "\u9700\u4EBA\u7C7B\u62CD\u677F/\u786E\u8BA4\u65B9\u6848" },
    { word: "\u5F85\u786E\u8BA4", label: "\u5F85\u4EBA\u5DE5\u786E\u8BA4" },
    { word: "\u8BF7\u786E\u8BA4", label: "\u8BF7\u4EBA\u5DE5\u786E\u8BA4" },
    { word: "\u5F85\u63D0\u4F9B", label: "\u5F85\u63D0\u4F9B\u4FE1\u606F/\u53C2\u6570" },
    { word: "\u8BF7\u63D0\u4F9B", label: "\u8BF7\u63D0\u4F9B\u914D\u7F6E/\u4FE1\u606F" },
    { word: "\u9700\u4EBA\u5DE5", label: "\u9700\u4EBA\u5DE5\u4ECB\u5165" },
    { word: "\u4EBA\u5DE5\u5904\u7406", label: "\u9700\u4EBA\u5DE5\u5904\u7406" },
    { word: "\u8F93\u5165key", label: "\u9700\u8F93\u5165 API Key" },
    { word: "\u914D\u7F6Ekey", label: "\u9700\u914D\u7F6E Key" },
    { word: "\u8F93\u5165\u51ED\u636E", label: "\u9700\u8F93\u5165\u51ED\u636E" },
    { word: "\u626B\u7801", label: "\u9700\u4EBA\u5DE5\u626B\u7801" },
    { word: "\u9A8C\u8BC1\u7801", label: "\u9700\u4EBA\u5DE5\u8F93\u5165\u9A8C\u8BC1\u7801" },
    { word: "\u767B\u5F55", label: "\u9700\u4EBA\u5DE5\u767B\u5F55" },
    { word: "\u7B49\u5F85\u7528\u6237", label: "\u7B49\u5F85\u7528\u6237\u54CD\u5E94" },
    { word: "\u5F85\u7528\u6237", label: "\u7B49\u5F85\u7528\u6237\u64CD\u4F5C" }
  ];
  for (const { word, label } of keywords) {
    if (text.includes(word)) return { needs: true, reason: label };
  }
  if (task.comments && task.comments.length > 0) {
    const lastComment = task.comments[task.comments.length - 1].body;
    if (/请提供|等待输入|等待确认|需要您|请在浏览器|missing API key|需要人工/i.test(lastComment)) {
      return { needs: true, reason: "\u4F1A\u8BDD\u4E2D\u7B49\u5F85\u7528\u6237\u63D0\u4F9B\u4FE1\u606F" };
    }
  }
  const lastExec = task.executions && task.executions.length > 0 ? task.executions[task.executions.length - 1] : void 0;
  if (lastExec?.error && /missing API key|需要提供|请提供|未配置|登录/i.test(lastExec.error)) {
    return { needs: true, reason: "\u6267\u884C\u7F3A\u5C11\u51ED\u636E\u6216\u7B49\u5F85\u8F93\u5165" };
  }
  return { needs: false };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskCard.tsx
var import_react2 = require("react");

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/external-api.ts
function externalTypeLabel(type, translate2) {
  const key = `ext.type.${type}`;
  const label = translate2(key);
  return label === key ? type : label;
}
async function externalRequest(path, body) {
  const response = await fetch(`/dsh-taskboard/external${path}`, body === void 0 ? { signal: AbortSignal.timeout(15e3) } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(33e4)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "External sync request failed");
  return result.value;
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskCard.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var DRAG_TYPE = "application/x-dsh-atb-task";
function shortId(id) {
  if (id === void 0) return "";
  return id.replace(/^session-(taskboard-)?/, "").slice(0, 8);
}
var resolveTaskSessionId = taskSessionId;
function TaskCard({ task, controller, draggable = false, now, onAlert }) {
  const t = useT();
  const [rejectOpen, setRejectOpen] = (0, import_react2.useState)(false);
  const [note, setNote] = (0, import_react2.useState)("");
  const last = task.executions.length > 0 ? task.executions[task.executions.length - 1] : void 0;
  const running = task.executions.find((ex) => ex.outcome === "running");
  const stale = now !== void 0 && isStaleClaim(task, now);
  const reviewing = task.status === "in_review" && task.trashedAt === void 0;
  const needsHuman = checkNeedsHuman(task);
  const latestReport = [...task.executions].reverse().find((e) => e.report !== void 0)?.report;
  const latestWithGit = [...task.executions].reverse().find((e) => (e.changedFiles ?? 0) > 0 || (e.commits?.length ?? 0) > 0 || e.diffStat);
  const targetSessionId = resolveTaskSessionId(task);
  const sessionTitle = controller.getSessionTitle(targetSessionId);
  const clickTimerRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    };
  }, []);
  const submitReject = () => {
    void controller.reject(task.id, task.version, note).then((ok) => {
      if (ok) {
        setRejectOpen(false);
        setNote("");
      }
    });
  };
  const handleClick = (e) => {
    if (e.target !== e.currentTarget && e.target.closest("button, input, textarea")) return;
    if (targetSessionId === void 0 || controller.getSnapshot().selectedId === task.id) {
      controller.select(task.id);
      return;
    }
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      controller.select(task.id);
    }, 250);
  };
  const handleDoubleClick = (e) => {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (e.target !== e.currentTarget && e.target.closest("button, input, textarea")) return;
    if (targetSessionId !== void 0) {
      void controller.openSession(targetSessionId).then((result) => {
        if (result === "missing") {
          const msg = t("card.session.missing", { id: shortId(targetSessionId) });
          if (onAlert !== void 0) onAlert(msg);
          else alert(msg);
        } else if (result === "archived") {
          const msg = t("card.session.archived", { id: shortId(targetSessionId) });
          if (onAlert !== void 0) onAlert(msg);
          else alert(msg);
        } else if (result === "unavailable") {
          const msg = t("card.session.unavailable", { id: targetSessionId });
          if (onAlert !== void 0) onAlert(msg);
          else alert(msg);
        }
      });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      role: "button",
      tabIndex: 0,
      className: "dsh-atb-card",
      "data-urgency": task.urgency,
      "data-needs-human": needsHuman.needs ? "true" : void 0,
      draggable: draggable && !rejectOpen,
      onDragStart: (e) => {
        if (running !== void 0) {
          e.preventDefault();
          const msg = t("card.drag.running", { title: task.title });
          if (onAlert !== void 0) onAlert(msg);
          else alert(msg);
          return;
        }
        e.dataTransfer.setData(DRAG_TYPE, task.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.dataset.dragging = "true";
      },
      onDragEnd: (e) => {
        delete e.currentTarget.dataset.dragging;
      },
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
      onKeyDown: (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          controller.select(task.id);
        }
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-card-title", children: [
          needsHuman.needs && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-badge", "data-kind": "needs-human", style: { marginRight: 6, verticalAlign: "middle" }, children: [
            "\u{1F64B} ",
            needsHuman.reason ?? t("card.badge.needsHuman")
          ] }),
          task.title
        ] }),
        task.external && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
          task.external.providerName ?? task.external.provider,
          " \xB7 ",
          externalTypeLabel(task.external.item.type, t),
          " #",
          task.external.item.id,
          task.external.conflicts.length > 0 ? " \u26A0" : ""
        ] }),
        (task.status === "in_review" || task.status === "done") && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-card-deliverable", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-card-deliv-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-tag", children: [
              "\u{1F4C4} ",
              t("card.deliv.changed"),
              ":"
            ] }),
            latestReport?.changedFiles && latestReport.changedFiles.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-val", title: latestReport.changedFiles.join("\n"), children: [
              latestReport.changedFiles.length,
              " ",
              t("card.deliv.filesUnit"),
              " (",
              latestReport.changedFiles[0].split("/").pop(),
              latestReport.changedFiles.length > 1 ? ` +${latestReport.changedFiles.length - 1}` : "",
              ")"
            ] }) : latestWithGit?.changedFiles ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-val", children: [
              latestWithGit.changedFiles,
              " ",
              t("card.deliv.gitFilesChanged")
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-card-deliv-val dsh-atb-deliv-warn", children: t("card.deliv.noFilesRecorded") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-card-deliv-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-tag", children: [
              "\u2611 ",
              t("card.deliv.acceptance"),
              ":"
            ] }),
            task.checklist && task.checklist.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-val", title: task.checklist.map((c) => `${c.checked ? "\u2713" : "\u2717"} ${c.text}`).join("\n"), children: [
              t("card.deliv.checklistProgress", { done: task.checklist.filter((c) => c.checked).length, total: task.checklist.length }),
              task.status === "in_review" && task.checklist.some((c) => !c.checked) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-deliv-warn", children: [
                " (",
                t("card.deliv.uncheckedWarn"),
                ")"
              ] })
            ] }) : latestReport?.checks && latestReport.checks.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-val", title: latestReport.checks.join("\n"), children: [
              "\u2713 ",
              t("card.deliv.checksCount", { n: latestReport.checks.length })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-card-deliv-val dsh-atb-deliv-warn", children: [
              "\u26A0 ",
              t("card.deliv.noVerificationWarn")
            ] })
          ] }),
          latestReport?.summary && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-card-deliv-summary", title: latestReport.summary, children: [
            "\u{1F4A1} ",
            latestReport.summary
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-card-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", children: t(URGENCY_KEYS[task.urgency]) }),
          task.blocked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": "blocked", children: t("shared.blocked") }),
          stale && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": "stale", children: t("card.badge.stale") }),
          task.execution.mode === "scheduled" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-atb-badge", "data-kind": "scheduled", children: [
            "\u23F0 ",
            fmtTime(task.execution.nextRunAt)
          ] }),
          task.model !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "span",
            {
              className: "dsh-atb-badge",
              title: t("card.badge.modelTitle", { model: task.model.provider + "/" + task.model.model }) + (task.model.reasoningEffort !== void 0 ? t("card.badge.modelEffort", { effort: task.model.reasoningEffort }) : ""),
              children: [
                task.model.model,
                task.model.reasoningEffort !== void 0 ? ` (${task.model.reasoningEffort})` : ""
              ]
            }
          ),
          task.permission === "read-only" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": "blocked", title: t("card.badge.permReadOnlyTitle"), children: t("card.badge.permReadOnly") }),
          task.permission === "danger-full-access" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": "urgent", title: t("card.badge.permFullTitle"), children: t("card.badge.permFull") }),
          task.checklist !== void 0 && task.checklist.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "span",
            {
              className: "dsh-atb-badge",
              "data-kind": task.status === "in_review" && task.checklist.some((i) => !i.checked) ? "blocked" : "checklist",
              title: task.status === "in_review" && task.checklist.some((i) => !i.checked) ? t("card.badge.checklistReview") : t("card.badge.checklist"),
              children: [
                "\u2611 ",
                task.checklist.filter((i) => i.checked).length,
                "/",
                task.checklist.length
              ]
            }
          ),
          task.status === "done" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": "done", children: t("status.pill.done") }),
          last !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": last.outcome === "running" ? "running" : last.outcome, children: t(OUTCOME_KEYS[last.outcome] ?? last.outcome) }),
          targetSessionId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "span",
            {
              className: "dsh-atb-badge",
              "data-kind": "session",
              title: sessionTitle && sessionTitle !== task.title ? t("card.session.tagTitleWithTitle", { title: sessionTitle, id: targetSessionId }) : t("card.session.tagTitle", { id: targetSessionId }),
              onClick: (e) => {
                e.stopPropagation();
                void controller.openSession(targetSessionId).then((result) => {
                  if (result === "missing") {
                    const msg = t("card.session.missing", { id: shortId(targetSessionId) });
                    if (onAlert !== void 0) onAlert(msg);
                    else alert(msg);
                  } else if (result === "archived") {
                    const msg = t("card.session.archived", { id: shortId(targetSessionId) });
                    if (onAlert !== void 0) onAlert(msg);
                    else alert(msg);
                  } else if (result === "unavailable") {
                    const msg = t("card.session.unavailable", { id: targetSessionId });
                    if (onAlert !== void 0) onAlert(msg);
                    else alert(msg);
                  }
                });
              },
              children: [
                "\u{1F4AC} ",
                t("card.session.badge", { id: shortId(targetSessionId) })
              ]
            }
          ),
          task.comments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "\u{1F4AC} ",
            task.comments.length
          ] }),
          task.trashedAt !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-atb-badge", "data-kind": "trashed", children: t("card.badge.pendingPurge") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: "auto" }, children: fmtTime(task.updatedAt) })
        ] }),
        reviewing && (rejectOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-quick-reject", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "dsh-atb-input dsh-atb-quick-note",
              value: note,
              placeholder: t("card.reject.placeholder"),
              autoFocus: true,
              spellCheck: false,
              onChange: (e) => setNote(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") submitReject();
                else if (e.key === "Escape") {
                  setRejectOpen(false);
                  setNote("");
                }
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-atb-quickbtn", "data-act": "reject-confirm", onClick: submitReject, children: t("card.reject.confirm") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-atb-quickbtn", "data-act": "reject-cancel", onClick: () => {
            setRejectOpen(false);
            setNote("");
          }, children: t("shared.cancel") })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-atb-quick", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-quickbtn",
              "data-act": "done",
              title: t("card.action.doneTitle"),
              onClick: () => void controller.move(task.id, task.version, "done"),
              children: t("card.action.done")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-quickbtn",
              "data-act": "reject",
              title: t("card.action.rejectTitle"),
              onClick: () => setRejectOpen(true),
              children: t("card.action.reject")
            }
          )
        ] }))
      ]
    }
  );
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskDetail.tsx
var import_react5 = require("react");

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/ExternalSourcePanel.tsx
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function ExternalSourcePanel({ task }) {
  const t = useT();
  const [error, setError] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const source = normalizeExternalSource(task.external);
  if (!source) return null;
  const resolve = async (field, acceptExternal) => {
    setBusy(true);
    setError("");
    try {
      await externalRequest("/resolve", { taskId: task.id, field, acceptExternal, ifVersion: task.version });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h4", { children: t("ext.source") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("a", { href: source.item.url, target: "_blank", rel: "noopener noreferrer", children: [
      source.providerName ?? source.provider,
      " \xB7 ",
      externalTypeLabel(source.item.type, t),
      " #",
      source.item.id
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
      t("ext.status"),
      ": ",
      source.item.status,
      " \xB7 ",
      source.item.assignedTo
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
      t("ext.synced"),
      ": ",
      new Date(source.syncedAt).toLocaleString()
    ] }),
    source.conflicts.map((field) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("ext.conflict", { field: t(`ext.field.${field}`) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: { whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }, children: source.item[field] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: busy || task.status === "in_progress", onClick: () => void resolve(field, true), children: t("ext.accept") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: busy || task.status === "in_progress", onClick: () => void resolve(field, false), children: t("ext.keep") })
    ] }, field)),
    error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "alert", children: error })
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/AlertModal.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function useAlert() {
  const [msg, setMsg] = (0, import_react4.useState)(null);
  const show = (m) => setMsg(m);
  const close = () => setMsg(null);
  const el = msg !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(AlertModal, { message: msg, onClose: close }) : null;
  return { alert: show, el };
}
function AlertModal({ message, onClose }) {
  const t = useT();
  (0, import_react4.useEffect)(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-atb-alert-backdrop", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-atb-alert", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-atb-alert-icon", children: "\u26D4" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-atb-alert-msg", children: message }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-primary": "true", onClick: onClose, children: t("alert.ok") })
  ] }) });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/image-insert.ts
var IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
var TYPES = new Set(IMAGE_ACCEPT.split(","));
function imageAlt(fileName, fallback) {
  const withoutExtension = fileName.replace(/\.(?:png|jpe?g|gif|webp)$/i, "");
  const clean = withoutExtension.replace(/[\[\]\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > 0 ? clean.slice(0, 120) : fallback;
}
function imageMarkdown(asset, alt) {
  return `![${alt}](${asset.url})`;
}
function insertImageMarkdown(value, start, end, markdown) {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  const inserted = `${prefix}${markdown}${suffix}`;
  return { value: before + inserted + after, cursor: before.length + inserted.length };
}
function acceptedImageFiles(files) {
  return Array.from(files).filter((file) => TYPES.has(file.type)).slice(0, 10);
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskDetail.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function moveTargets(task) {
  const all = ["backlog", "todo", "in_progress", "in_review", "done", "canceled", "archived"];
  return all.filter((to) => canTransition(task.status, to));
}
function shortId2(id) {
  if (id === void 0) return "";
  return id.replace(/^session-(taskboard-)?/, "").slice(0, 8);
}
function commentBody(t, c) {
  if (c.systemKey === void 0) return c.body;
  if (c.systemRows !== void 0) {
    const summary = c.systemRows.map((r) => {
      const label = r.repo === "" ? t("iso.repo.root") : r.repo;
      const mark = r.outcome === "merged" ? "\u2713" : r.outcome === "noop" ? "\u27F2" : "\u2717";
      return r.outcome === "failed" && r.error !== void 0 ? `${label} ${mark} ${r.error}` : `${label} ${mark}`;
    }).join(" \xB7 ");
    return t(c.systemKey, { summary });
  }
  return t(c.systemKey, c.systemParams);
}
function duration(startedAt, endedAt) {
  if (startedAt === void 0 || endedAt === void 0) return "";
  const s = Math.max(0, Math.round((endedAt - startedAt) / 1e3));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor(s % 3600 / 60)}m`;
}
function Chip({ icon, children, tone, title }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-chip2", "data-tone": tone, title, children: [
    icon !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-chip2-icon", children: icon }),
    children
  ] });
}
function MarkdownContent({ text }) {
  const t = useT();
  const [lightboxUrl, setLightboxUrl] = (0, import_react5.useState)(null);
  const regex = /!\[(.*?)\]\(((?:data:image\/[^)]+)|(?:https?:\/\/[^)]+)|(?:[^)]+\.(?:png|jpg|jpeg|gif|webp|svg)))\)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  let count = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(/* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: text.slice(lastIndex, match.index) }, `txt-${lastIndex}`));
    }
    const alt = match[1] || t("md.imageAlt", { n: ++count });
    const url = match[2] ?? "";
    parts.push(
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail-img-wrap", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "img",
          {
            src: url,
            alt,
            className: "dsh-atb-detail-img",
            onClick: () => setLightboxUrl(url),
            title: t("md.imageTitle", { alt })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-detail-img-caption", children: alt })
      ] }, `img-${match.index}`)
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(/* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: text.slice(lastIndex) }, `txt-${lastIndex}`));
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-markdown-body", children: parts }),
    lightboxUrl !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-lightbox-backdrop", onClick: () => setLightboxUrl(null), children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-lightbox-content", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("img", { src: lightboxUrl, alt: t("md.lightboxAlt"), className: "dsh-atb-lightbox-img" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-atb-lightbox-close",
          title: t("md.closePreview"),
          onClick: () => setLightboxUrl(null),
          children: "\u2715"
        }
      )
    ] }) })
  ] });
}
function latestIsolated(task) {
  return [...task.executions].reverse().find((e) => e.isolation !== void 0 || e.worktreePath !== void 0 || e.isolationNote !== void 0);
}
function shortHash(hash) {
  return hash === void 0 ? "" : hash.slice(0, 8);
}
function porcelainPath(line) {
  let p = line.slice(3);
  const arrow = p.indexOf(" -> ");
  if (arrow >= 0) p = p.slice(arrow + 4);
  if (p.startsWith('"') && p.endsWith('"') && p.length > 1) p = p.slice(1, -1);
  return p;
}
function DiffView({ controller, task, execution, commit, path, repo }) {
  const t = useT();
  const [state, setState] = (0, import_react5.useState)({ loading: true });
  (0, import_react5.useEffect)(() => {
    let alive = true;
    setState({ loading: true });
    void controller.fetchDiff(task.id, { execution: execution.id, ...commit !== void 0 ? { commit } : { path: path ?? "" }, ...repo !== void 0 ? { repo } : {} }).then((result) => {
      if (!alive) return;
      if (result === void 0) setState({ loading: false, failed: true });
      else setState({ loading: false, diff: result.diff, truncated: result.truncated });
    });
    return () => {
      alive = false;
    };
  }, [controller, task.id, execution.id, commit, path, repo]);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-diffview", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-diffview-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-diffview-title", children: commit !== void 0 ? t("diff.commit", { hash: shortHash(commit) }) : t("diff.file", { path: path ?? "" }) }),
      state.loading && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-diffview-hint", children: t("shared.loading") }),
      state.truncated === true && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-diffview-hint", children: t("diff.truncated") })
    ] }),
    state.failed === true ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-diffview-error", children: t("diff.failed") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { className: "dsh-atb-diffview-pre", children: state.diff ?? "" })
  ] });
}
function ChecklistBlock({ task, controller }) {
  const t = useT();
  const items = task.checklist ?? [];
  if (items.length === 0) return null;
  const { done, total } = checklistProgress(task);
  const unchecked = total - done;
  const reviewing = task.status === "in_review";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard", "data-kind": "checklist", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard-label", children: [
      t("checklist.title"),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-cl-progress", "data-tone": reviewing && unchecked > 0 ? "bad" : void 0, children: [
        "\u2611 ",
        done,
        "/",
        total,
        reviewing && unchecked > 0 ? t("checklist.unchecked", { n: unchecked }) : done === total ? t("checklist.allDone") : ""
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-cl-items", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "label",
      {
        className: "dsh-atb-cl-item",
        "data-checked": item.checked ? "true" : void 0,
        "data-alert": reviewing && !item.checked ? "true" : void 0,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              type: "checkbox",
              checked: item.checked,
              onChange: () => void controller.toggleChecklistItem(task, item.id)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-cl-text", children: item.text }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-cl-meta", children: [
            item.checked ? `${item.checkedBy === "user" ? t("checklist.byUser") : `\u{1F916} ${shortId2(item.checkedBy)}`} \xB7 ${fmtTime(item.checkedAt)}` : t("checklist.uncheckedItem"),
            item.note !== void 0 && item.note.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-cl-note", title: item.note, children: t("checklist.evidence", { note: item.note }) })
          ] })
        ]
      },
      item.id
    )) })
  ] });
}
function ReportBlock({ task }) {
  const t = useT();
  const [copiedFile, setCopiedFile] = (0, import_react5.useState)(null);
  const execution = [...task.executions].reverse().find((e) => e.report !== void 0);
  const report = execution?.report;
  const isReviewOrDone = task.status === "in_review" || task.status === "done";
  if (!isReviewOrDone && (execution === void 0 || report === void 0)) return null;
  const copyPath = (path) => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopiedFile(path);
      setTimeout(() => setCopiedFile(null), 1500);
    });
  };
  if (execution === void 0 || report === void 0) {
    if (task.status === "in_review") {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard dsh-atb-reviewdesk", "data-kind": "report-missing", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard-label", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
            "\u{1F4CB} ",
            t("detail.deliv.title")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-deliv-warn", style: { marginLeft: "auto" }, children: [
            "\u26A0 ",
            t("detail.deliv.missingReport")
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-deliv-missing-box", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: t("detail.deliv.missingHint") }) })
      ] });
    }
    return null;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard dsh-atb-reviewdesk", "data-kind": "report", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard-label", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        "\u{1F4CB} ",
        t("detail.deliv.title")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-cl-progress", children: t("report.submitted", { time: fmtTime(execution.endedAt ?? execution.startedAt) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-deliv-summary-box", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-label", children: [
        "\u{1F3AF} ",
        t("detail.deliv.summaryLabel")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-rpt-summary", children: report.summary })
    ] }),
    report.changedFiles && report.changedFiles.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-label", children: [
        "\u{1F4C1} ",
        t("report.changedFiles"),
        " (",
        report.changedFiles.length,
        ")"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "dsh-atb-rpt-filelist", children: report.changedFiles.map((file, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "dsh-atb-rpt-fileitem", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-file-path", children: file }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-file-copybtn",
            title: t("detail.deliv.copyPath"),
            onClick: () => copyPath(file),
            children: copiedFile === file ? t("detail.deliv.copied") : t("detail.deliv.copy")
          }
        )
      ] }, i)) })
    ] }),
    report.checks && report.checks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-label", children: [
        "\u{1F52C} ",
        t("report.checks"),
        " (",
        report.checks.length,
        ")"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "dsh-atb-rpt-checklist", children: report.checks.map((check, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "dsh-atb-rpt-checkitem", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-check-icon", children: "\u2713" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: check })
      ] }, i)) })
    ] }),
    report.artifacts && report.artifacts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-label", children: [
        "\u{1F4E6} ",
        t("report.artifacts")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "dsh-atb-rpt-list", children: report.artifacts.map((art, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { children: art }, i)) })
    ] }),
    report.risk.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-rpt-label", children: [
        "\u26A0\uFE0F ",
        t("report.risk")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-rpt-risk", children: report.risk })
    ] })
  ] });
}
function IsolationBlock({ task, controller }) {
  const t = useT();
  const { alert: showAlert, el: alertEl } = useAlert();
  const [confirmMerge, setConfirmMerge] = (0, import_react5.useState)(false);
  const [confirmRemove, setConfirmRemove] = (0, import_react5.useState)(null);
  const [busy, setBusy] = (0, import_react5.useState)(false);
  const [openDiff, setOpenDiff] = (0, import_react5.useState)(null);
  const [dirtyOpen, setDirtyOpen] = (0, import_react5.useState)(false);
  const execution = latestIsolated(task);
  const running = task.executions.some((e) => e.outcome === "running");
  if (execution === void 0) return null;
  const doMerge = () => {
    setBusy(true);
    void controller.mergeBranch(task.id).then((result) => {
      setBusy(false);
      setConfirmMerge(false);
      if (!result.ok) showAlert(t("iso.merge.failed", { error: result.error }));
      else if (result.results !== void 0) {
        const labelOf = (repo) => repo === "" ? t("iso.repo.root") : repo;
        const summary = result.results.map((r) => `${labelOf(r.repo)} ${r.outcome === "merged" ? "\u2713" : r.outcome === "noop" ? "\u27F2" : "\u2717"}`).join(" \xB7 ");
        const failed = result.results.some((r) => r.outcome === "failed");
        const failedError = result.results.find((r) => r.outcome === "failed")?.error;
        showAlert(failed ? t("iso.merge.partial", { summary, error: failedError ?? "" }) : t("iso.merge.done", { summary }));
      } else if (result.noop === true) showAlert(t("iso.merge.noop"));
    });
  };
  const doRemove = (deleteBranch) => {
    setBusy(true);
    void controller.removeWorktree(task.id, deleteBranch).then((result) => {
      setBusy(false);
      setConfirmRemove(null);
      if (!result.ok) showAlert(t("iso.remove.failed", { error: result.error }));
      else if (result.branchError !== void 0) showAlert(t("iso.remove.branchFailed", { error: result.branchError }));
    });
  };
  if (execution.isolation !== "worktree" || execution.worktreePath === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard", "data-kind": "isolation", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-fieldcard-label", children: t("iso.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-none", children: [
        t("iso.none"),
        execution.isolationNote !== void 0 ? ` \xB7 ${execution.isolationNote}` : ""
      ] }),
      alertEl
    ] });
  }
  const multi = execution.repos !== void 0 && execution.repos.length > 0;
  const views = multi ? (execution.repos ?? []).map((r) => ({
    repo: r.repo,
    label: r.repo === "" ? t("iso.repo.root") : r.repo,
    branch: r.branch,
    worktreePath: r.worktreePath,
    baseCommit: r.baseCommit,
    headCommit: r.headCommit,
    commits: r.commits ?? [],
    commitTotal: r.commitsTotal ?? (r.commits ?? []).length,
    dirty: r.dirtyFiles ?? [],
    dirtyTotal: r.dirtyFilesTotal ?? (r.dirtyFiles ?? []).length,
    ...r.diffStat !== void 0 ? { diffStat: r.diffStat } : {},
    ...r.changedFiles !== void 0 ? { changedFiles: r.changedFiles } : {}
  })) : [{
    label: t("iso.repo.root"),
    branch: execution.branch ?? task.branch,
    worktreePath: execution.worktreePath,
    baseCommit: execution.baseCommit,
    headCommit: execution.headCommit,
    commits: execution.commits ?? [],
    commitTotal: execution.commitsTotal ?? (execution.commits ?? []).length,
    dirty: execution.dirtyFiles ?? [],
    dirtyTotal: execution.dirtyFilesTotal ?? (execution.dirtyFiles ?? []).length,
    ...execution.diffStat !== void 0 ? { diffStat: execution.diffStat } : {},
    ...execution.changedFiles !== void 0 ? { changedFiles: execution.changedFiles } : {}
  }];
  const renderRepo = (view) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "dsh-atb-iso-repo", "data-multi": multi ? "true" : void 0, children: [
    multi && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-repohead", title: view.worktreePath, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: view.label }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-iso-fact", children: [
        t("iso.branch"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: view.branch })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-facts", children: [
      !multi && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-iso-fact", title: view.worktreePath, children: [
        t("iso.branch"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: view.branch })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-iso-fact", children: t("iso.baseline", { base: shortHash(view.baseCommit), head: shortHash(view.headCommit) }) }),
      view.changedFiles !== void 0 && view.changedFiles > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-iso-fact", children: t("iso.changed", { n: view.changedFiles }) }),
      view.diffStat !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-iso-fact", title: view.diffStat, children: view.diffStat })
    ] }),
    view.commits.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-commits", children: [
      view.commits.slice(0, 10).map((c) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-commit", "data-open": openDiff?.commit === c.hash && openDiff?.repo === view.repo ? "true" : void 0, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-atb-iso-commit-btn",
            title: t("iso.commit.openTitle"),
            onClick: () => setOpenDiff(openDiff?.commit === c.hash && openDiff?.repo === view.repo ? null : { commit: c.hash, ...view.repo !== void 0 ? { repo: view.repo } : {} }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: shortHash(c.hash) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: c.subject })
            ]
          }
        ),
        openDiff?.commit === c.hash && openDiff?.repo === view.repo && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DiffView, { controller, task, execution, commit: c.hash, repo: view.repo })
      ] }, c.hash)),
      view.commitTotal > 10 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-iso-more", children: t("iso.commits.more", { n: view.commitTotal }) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-iso-nocommit", children: t("iso.nocommit") }),
    view.dirtyTotal > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-dirty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { type: "button", className: "dsh-atb-iso-dirty-toggle", onClick: () => setDirtyOpen(!dirtyOpen), children: [
        t("iso.dirty.toggle", { n: view.dirtyTotal }),
        dirtyOpen ? t("iso.dirty.collapse") : t("iso.dirty.expand")
      ] }),
      dirtyOpen && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-dirty-files", children: [
        view.dirty.slice(0, 30).map((line, index) => {
          const filePath = porcelainPath(line);
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            "button",
            {
              type: "button",
              className: "dsh-atb-iso-dirty-file",
              title: t("iso.dirty.openTitle"),
              onClick: () => setOpenDiff(openDiff?.path === filePath && openDiff?.repo === view.repo ? null : { path: filePath, ...view.repo !== void 0 ? { repo: view.repo } : {} }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: line.slice(0, 2) }),
                " ",
                filePath
              ]
            },
            `${line}-${index}`
          );
        }),
        view.dirtyTotal > 30 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-iso-more", children: t("iso.dirty.more", { n: view.dirtyTotal }) })
      ] }),
      openDiff?.path !== void 0 && openDiff?.repo === view.repo && dirtyOpen && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DiffView, { controller, task, execution, path: openDiff.path, repo: view.repo })
    ] })
  ] }, view.repo ?? "root");
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard", "data-kind": "isolation", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-fieldcard-label", children: t("iso.worktreeTitle") }),
    views.map(renderRepo),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-iso-actions", children: [
      running ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-iso-hint", children: t("iso.hint.running") }) : confirmMerge ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-confirm", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", children: t("iso.merge.confirm") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-primary": "true", disabled: busy, onClick: doMerge, children: t("iso.merge.go") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmMerge(false), children: t("shared.cancel") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-atb-btn",
          disabled: busy,
          title: t("iso.merge.title"),
          onClick: () => setConfirmMerge(true),
          children: t("iso.merge.button")
        }
      ),
      !running && (confirmRemove === null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-btn",
            "data-danger": "true",
            disabled: busy,
            title: t("iso.remove.wtTitle"),
            onClick: () => setConfirmRemove("wt"),
            children: t("iso.remove.wt")
          }
        ),
        task.branch !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-btn",
            "data-danger": "true",
            disabled: busy,
            title: t("iso.remove.wtbTitle"),
            onClick: () => setConfirmRemove("wtb"),
            children: t("iso.remove.wtb")
          }
        )
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-confirm", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", children: confirmRemove === "wtb" ? t("iso.remove.confirmWtb") : t("iso.remove.confirmWt") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", disabled: busy, onClick: () => doRemove(confirmRemove === "wtb"), children: t("shared.confirmDelete") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmRemove(null), children: t("shared.cancel") })
      ] })),
      !running && confirmRemove === null && !confirmMerge && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-iso-hint", children: t("iso.hint.keep") })
    ] }),
    alertEl
  ] });
}
function TaskDetail({ task, controller, now }) {
  const t = useT();
  const [comment, setComment] = (0, import_react5.useState)("");
  const [commentUploading, setCommentUploading] = (0, import_react5.useState)(false);
  const commentRef = (0, import_react5.useRef)(null);
  const commentFileRef = (0, import_react5.useRef)(null);
  const [confirmDone, setConfirmDone] = (0, import_react5.useState)(false);
  const [confirmPurge, setConfirmPurge] = (0, import_react5.useState)(false);
  const [confirmCancel, setConfirmCancel] = (0, import_react5.useState)(false);
  const [confirmArchive, setConfirmArchive] = (0, import_react5.useState)(false);
  const [actionBusy, setActionBusy] = (0, import_react5.useState)(false);
  const { alert: showAlert, el: alertEl } = useAlert();
  const ws = controller.getSnapshot().workspaces.find((w) => w.id === task.workspaceId);
  const runningExecution = task.executions.find((e) => e.outcome === "running");
  const holder = task.status === "in_progress" ? task.claimedBy : void 0;
  const canRun = task.status !== "done" && task.status !== "archived" && runningExecution === void 0 && holder === void 0;
  const stale = now !== void 0 && isStaleClaim(task, now);
  const needsHuman = checkNeedsHuman(task);
  const unchecked = (task.checklist ?? []).filter((i) => !i.checked).length;
  const targetSessionId = taskSessionId(task);
  const associatedSessions = taskAssociatedSessionIds(task);
  const archiveState = controller.getSnapshot();
  const archiveResult = archiveState.sessionArchive?.taskId === task.id ? archiveState.sessionArchive.result : void 0;
  const isReviewOrDone = task.status === "in_review" || task.status === "done";
  const hasReport = task.executions.some((e) => e.report !== void 0);
  const runAction = (action) => {
    if (actionBusy) return;
    setActionBusy(true);
    void action().catch(() => void 0).finally(() => setActionBusy(false));
  };
  const postComment = () => {
    if (commentUploading || comment.trim().length === 0) return;
    void controller.comment(task.id, comment).then((ok) => {
      if (ok) setComment("");
    });
  };
  const uploadCommentImages = async (rawFiles) => {
    const files = acceptedImageFiles(rawFiles);
    if (files.length === 0 || commentUploading) return;
    setCommentUploading(true);
    const element = commentRef.current;
    let nextValue = element?.value ?? comment;
    let start = element?.selectionStart ?? nextValue.length;
    let end = element?.selectionEnd ?? start;
    let changed = false;
    try {
      for (const file of files) {
        const asset = await controller.uploadImage(file);
        if (asset === void 0) continue;
        const next = insertImageMarkdown(nextValue, start, end, imageMarkdown(asset, imageAlt(file.name, t("image.defaultAlt"))));
        nextValue = next.value;
        start = next.cursor;
        end = start;
        changed = true;
      }
      if (changed) {
        setComment(nextValue);
        setTimeout(() => {
          commentRef.current?.focus();
          commentRef.current?.setSelectionRange(start, start);
        }, 0);
      }
    } finally {
      setCommentUploading(false);
    }
  };
  const jumpToSession = (sessionId) => {
    void controller.openSession(sessionId).then((result) => {
      if (result === "missing") showAlert(t("card.session.missing", { id: shortId2(sessionId) }));
      else if (result === "archived") showAlert(t("card.session.archived", { id: shortId2(sessionId) }));
      else if (result === "unavailable") showAlert(t("card.session.unavailable", { id: sessionId }));
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail", "data-urgency": task.urgency, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail-titlewrap", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail-titlebar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: task.title }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-statuspill", "data-status": task.status, children: t(STATUS_KEYS[task.status] ?? task.status) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail-chips", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Chip, { tone: task.urgency, children: [
            "\u25CF ",
            t(URGENCY_KEYS[task.urgency] ?? task.urgency)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F4C1}", children: ws?.title ?? shortId2(task.workspaceId) }),
          task.model !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            Chip,
            {
              icon: "\u2726",
              title: t("card.badge.modelTitle", { model: task.model.provider + "/" + task.model.model }) + (task.model.reasoningEffort !== void 0 ? t("card.badge.modelEffort", { effort: task.model.reasoningEffort }) : ""),
              children: [
                task.model.model,
                task.model.reasoningEffort !== void 0 ? ` \xB7 ${task.model.reasoningEffort}` : ""
              ]
            }
          ),
          task.presetId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F39B}", children: task.presetId }),
          task.execution.mode === "scheduled" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u23F0", children: t("detail.chip.nextRun", { cron: task.execution.cron ?? "", time: fmtTime(task.execution.nextRunAt) }) }),
          task.execution.queuedRunAt !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u23F3", tone: "urgent", children: t("detail.chip.queuedRun", { time: fmtTime(task.execution.queuedRunAt) }) }),
          needsHuman.needs && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F64B}", tone: "urgent", title: needsHuman.reason, children: needsHuman.reason ?? t("detail.chip.needsHuman") }),
          task.blocked && !needsHuman.needs && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u26D4", tone: "urgent", children: t("shared.blocked") }),
          task.checklist !== void 0 && task.checklist.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u2611", tone: task.status === "in_review" && task.checklist.some((i) => !i.checked) ? "urgent" : void 0, children: t("detail.chip.checklist", { done: checklistProgress(task).done, total: task.checklist.length }) }),
          task.branch !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Chip, { icon: "\u{1F33F}", tone: void 0, children: [
            "Worktree \xB7 ",
            task.branch.length > 28 ? `${task.branch.slice(0, 28)}\u2026` : task.branch
          ] }),
          (task.isolation === void 0 || task.isolation === "worktree") && task.branch === void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F33F}", children: t("detail.chip.isolated") }),
          task.permission === "read-only" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F512}", tone: "urgent", children: t("detail.chip.permReadOnly") }),
          task.permission === "danger-full-access" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u26A1", tone: "urgent", children: t("detail.chip.permFull") }),
          (task.permission === "workspace-write" || task.permission === void 0) && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F4C1}", children: t("detail.chip.permWrite") }),
          holder !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            "button",
            {
              type: "button",
              className: "dsh-atb-chip2 dsh-atb-chip-btn",
              "data-tone": stale ? "urgent" : void 0,
              title: t("detail.chip.holderTitle", { id: holder }),
              onClick: () => jumpToSession(holder),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-chip2-icon", children: stale ? "\u23F1" : "\u{1F916}" }),
                stale ? t("detail.chip.holderStale") : t("detail.chip.holderBy"),
                shortId2(holder),
                t("detail.chip.holderSuffix")
              ]
            }
          ),
          task.trashedAt !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Chip, { icon: "\u{1F5D1}", tone: "urgent", children: t("detail.chip.trashed") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Chip, { children: [
            "v",
            task.version
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-detail-sub", children: t("detail.sub.line", { time: fmtTime(task.updatedAt), who: task.updatedBy.kind === "agent" ? `\u{1F916} ${shortId2(task.updatedBy.sessionId)}` : task.updatedBy.kind === "system" ? t("detail.updatedBy.system") : t("detail.updatedBy.user") }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-detail-topbtns", children: [
        targetSessionId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-detail-session",
            title: t("detail.session.jumpTitle", { id: targetSessionId }),
            onClick: () => jumpToSession(targetSessionId),
            children: t("detail.session.jump")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-detail-edit", onClick: () => controller.openEditor(task.id), children: t("detail.action.edit") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-detail-edit",
            title: t("detail.action.duplicateTitle"),
            disabled: actionBusy,
            onClick: () => runAction(() => controller.duplicate(task)),
            children: t("detail.action.duplicate")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-detail-edit",
            title: t("detail.action.saveTplTitle"),
            disabled: actionBusy,
            onClick: () => runAction(async () => {
              const ok = await controller.saveAsTemplate(task);
              if (ok) showAlert(t("detail.action.saveTplDone"));
            }),
            children: t("detail.action.saveTpl")
          }
        ),
        canRun && task.branch !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-detail-run",
            title: t("detail.action.reuseTitle"),
            disabled: actionBusy,
            onClick: () => runAction(() => controller.run(task.id, true)),
            children: t("detail.action.reuse")
          }
        ),
        canRun && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-detail-run",
            title: task.model !== void 0 ? t("detail.action.runTitleModel", { model: task.model.model }) : t("detail.action.runTitleDefault"),
            disabled: actionBusy,
            onClick: () => runAction(() => controller.run(task.id)),
            children: t("detail.action.run")
          }
        ),
        runningExecution !== void 0 && (confirmCancel ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-confirm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", children: t("detail.action.stopConfirm") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", onClick: () => {
            void controller.cancel(task.id);
            setConfirmCancel(false);
          }, children: t("detail.action.stop") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmCancel(false), children: t("shared.cancel") })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-detail-run",
            "data-danger": "true",
            title: t("detail.action.stopTitle", { id: runningExecution.sessionId ?? "" }),
            onClick: () => setConfirmCancel(true),
            children: t("detail.action.stopExec")
          }
        )),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-detail-close", "aria-label": t("shared.close"), onClick: () => controller.select(void 0), children: "\u2715" })
      ] })
    ] }),
    task.external && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ExternalSourcePanel, { task }),
    (isReviewOrDone || hasReport) && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ReportBlock, { task }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ChecklistBlock, { task, controller })
    ] }),
    task.description.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-fieldcard-label", children: t("detail.field.description") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-desc", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MarkdownContent, { text: task.description }) })
    ] }),
    task.prompt.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-fieldcard", "data-kind": "prompt", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-fieldcard-label", children: t("detail.field.prompt") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-promptbox", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MarkdownContent, { text: task.prompt }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(IsolationBlock, { task, controller }),
    !isReviewOrDone && !hasReport && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ReportBlock, { task }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ChecklistBlock, { task, controller })
    ] }),
    archiveResult !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "status", className: "dsh-atb-confirm", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("detail.move.archiveResult", { n: archiveResult.archived.length }) }),
      archiveResult.failed.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        item.sessionId,
        ": ",
        item.error
      ] }, item.sessionId)),
      archiveResult.unsupported.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        t("detail.move.archiveUnsupported"),
        " ",
        archiveResult.unsupported.join(", ")
      ] })
    ] }),
    task.status === "archived" && associatedSessions.length > 0 && archiveState.archiveSessionsSupported && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", disabled: actionBusy, onClick: () => runAction(() => controller.retryArchiveSessions(task.id)), children: t("detail.move.archiveRetry") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-detail-actions", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-movebtns", children: [
      moveTargets(task).map((to) => {
        if (to === "done") {
          return confirmDone ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-confirm", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", "data-tone": unchecked > 0 ? "bad" : void 0, children: unchecked > 0 ? t("detail.move.confirmDoneUnchecked", { n: unchecked }) : t("detail.move.confirmDone") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-primary": "true", onClick: () => {
              void controller.move(task.id, task.version, "done");
              setConfirmDone(false);
            }, children: t("detail.move.confirm") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmDone(false), children: t("shared.cancel") })
          ] }, to) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-movebtn", "data-to": to, onClick: () => {
            setConfirmDone(true);
            setConfirmArchive(false);
          }, children: t("detail.move.to", { status: t(MOVE_KEYS[to]) }) }, to);
        }
        if (to === "archived") {
          if (confirmArchive) {
            return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-confirm", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", children: associatedSessions.length === 1 ? t("detail.move.confirmArchiveSessionWithId", { id: shortId2(associatedSessions[0]) }) : associatedSessions.length > 1 ? t("detail.move.confirmArchiveSessionCount", { n: associatedSessions.length }) : t("detail.move.confirmArchive") }),
              associatedSessions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", children: associatedSessions.join(", ") }),
              associatedSessions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-atb-btn",
                    disabled: !archiveState.archiveSessionsSupported || actionBusy,
                    title: !archiveState.archiveSessionsSupported ? t("detail.move.archiveUnsupported") : void 0,
                    onClick: () => {
                      runAction(() => controller.move(task.id, task.version, "archived", { archiveSessions: true }));
                      setConfirmArchive(false);
                    },
                    children: t("detail.move.archiveWithSession")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-atb-btn",
                    onClick: () => {
                      runAction(() => controller.move(task.id, task.version, "archived", { archiveSessions: false }));
                      setConfirmArchive(false);
                    },
                    children: t("detail.move.archiveCardOnly")
                  }
                )
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-btn",
                  "data-primary": "true",
                  onClick: () => {
                    void controller.move(task.id, task.version, "archived");
                    setConfirmArchive(false);
                  },
                  children: t("detail.move.confirm")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmArchive(false), children: t("shared.cancel") })
            ] }, to);
          }
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-movebtn",
              "data-to": to,
              onClick: () => {
                setConfirmArchive(true);
                setConfirmDone(false);
              },
              children: t("detail.move.to", { status: t(MOVE_KEYS[to]) })
            },
            to
          );
        }
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-movebtn", "data-to": to, onClick: () => void controller.move(task.id, task.version, to), children: t("detail.move.to", { status: t(MOVE_KEYS[to]) }) }, to);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-atb-movebtn",
          "data-to": needsHuman.needs ? "needs-human-active" : "needs-human",
          title: needsHuman.reason ?? t("detail.needsHuman.hint"),
          onClick: () => {
            const anyTask = task;
            const nextVal = !needsHuman.needs;
            void controller.update(task.id, task.version, {
              blocked: nextVal,
              waitingForHuman: nextVal,
              waitingReason: nextVal ? anyTask.waitingReason ?? "\u9700\u4EBA\u5DE5\u64CD\u4F5C\u6216\u63D0\u4F9B\u4FE1\u606F" : void 0
            });
          },
          children: needsHuman.needs ? t("detail.needsHuman.unmark") : t("detail.needsHuman.mark")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-movebtn", "data-to": "blocked", onClick: () => void controller.toggleBlocked(task), children: task.blocked ? t("detail.blocked.unmark") : t("detail.blocked.mark") }),
      holder !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-atb-movebtn",
          "data-to": "release",
          title: t("detail.release.title", { id: holder }),
          onClick: () => void controller.move(task.id, task.version, "todo"),
          children: t("detail.release.button")
        }
      )
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("h4", { children: [
        t("detail.comments.title"),
        task.comments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-count2", children: task.comments.length })
      ] }),
      task.comments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-empty2", children: t("detail.comments.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-commentlist", children: task.comments.map((c) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-bubble", "data-from": c.threadId !== void 0 ? "agent" : "user", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-bubble-avatar", children: c.threadId !== void 0 ? "\u{1F916}" : "\u{1F464}" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-bubble-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-bubble-meta", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: c.threadId !== void 0 ? `agent ${shortId2(c.threadId)}` : t("detail.comments.user") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: fmtTime(c.createdAt) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-bubble-body", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MarkdownContent, { text: commentBody(t, c) }) })
        ] })
      ] }, c.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-composer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "textarea",
          {
            ref: commentRef,
            className: "dsh-atb-composer-input",
            value: comment,
            placeholder: t("detail.composer.placeholder"),
            disabled: commentUploading,
            onChange: (e) => setComment(e.target.value),
            onKeyDown: (e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && comment.trim().length > 0 && !commentUploading) {
                postComment();
              }
            },
            onPaste: (e) => {
              const files = acceptedImageFiles(e.clipboardData.files);
              if (files.length > 0) {
                e.preventDefault();
                void uploadCommentImages(files);
              }
            },
            onDragOver: (e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            },
            onDrop: (e) => {
              const files = acceptedImageFiles(e.dataTransfer.files);
              if (files.length > 0) {
                e.preventDefault();
                void uploadCommentImages(files);
              }
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            ref: commentFileRef,
            type: "file",
            accept: IMAGE_ACCEPT,
            multiple: true,
            hidden: true,
            onChange: (e) => {
              if (e.target.files !== null) void uploadCommentImages(e.target.files);
              e.target.value = "";
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-image-add", disabled: commentUploading, title: t("image.add"), onClick: () => commentFileRef.current?.click(), children: commentUploading ? "\u2026" : "\u{1F5BC}" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-composer-send",
            disabled: comment.trim().length === 0 || commentUploading,
            onClick: postComment,
            children: t("detail.composer.send")
          }
        )
      ] })
    ] }),
    task.executions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("h4", { children: [
        t("detail.exec.title"),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-count2", children: task.executions.length }),
        task.executionsPruned !== void 0 && task.executionsPruned > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-count2", title: t("detail.exec.prunedTitle", { n: task.executionsPruned }), children: t("detail.exec.pruned", { n: task.executionsPruned }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-execlist", children: [...task.executions].reverse().map((e) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-atb-exec-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-exec-dot", "data-outcome": e.outcome }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-exec-trigger", children: e.trigger === "manual" ? t("detail.exec.trigger.manual") : t("detail.exec.trigger.scheduled") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-exec-outcome", "data-outcome": e.outcome, children: t(OUTCOME_KEYS[e.outcome] ?? e.outcome) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-exec-time", children: [
          fmtTime(e.startedAt),
          e.endedAt !== void 0 && ` \xB7 ${duration(e.startedAt, e.endedAt)}`
        ] }),
        e.sessionId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-atb-exec-session",
            title: t("detail.exec.openTitle", { id: e.sessionId }),
            onClick: () => jumpToSession(e.sessionId),
            children: [
              "\u{1F916} ",
              shortId2(e.sessionId),
              " \u2197"
            ]
          }
        ),
        e.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-exec-error", title: e.error, children: [
          e.error.slice(0, 80),
          e.error.length > 80 ? "\u2026" : ""
        ] })
      ] }, e.id)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-atb-dangerzone", children: task.trashedAt === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", onClick: () => void controller.remove(task.id, task.version, false), children: t("detail.danger.delete") }) : confirmPurge ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-atb-confirm", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-atb-confirm-label", children: t("detail.danger.purgeConfirm") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", onClick: () => {
        void controller.remove(task.id, task.version, true);
        setConfirmPurge(false);
      }, children: t("detail.danger.purgeGo") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmPurge(false), children: t("shared.cancel") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", onClick: () => setConfirmPurge(true), children: t("detail.danger.purge") }) }),
    alertEl
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskFormModal.tsx
var import_react7 = require("react");

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/SlashPromptInput.tsx
var import_react6 = require("react");
var import_react_dom = require("react-dom");
var import_jsx_runtime5 = require("react/jsx-runtime");
var defaultCommands = (t) => [
  { name: "goal", kind: "command", description: t("slash.cmd.goal.desc"), hint: t("slash.cmd.goal.hint") },
  { name: "schedule", kind: "command", description: t("slash.cmd.schedule.desc"), hint: t("slash.cmd.schedule.hint") },
  { name: "plan", kind: "command", description: t("slash.cmd.plan.desc") },
  { name: "browser", kind: "command", description: t("slash.cmd.browser.desc") },
  { name: "grill-me", kind: "command", description: t("slash.cmd.grill-me.desc") },
  { name: "teamwork-preview", kind: "command", description: t("slash.cmd.teamwork-preview.desc") },
  { name: "learn", kind: "command", description: t("slash.cmd.learn.desc") },
  { name: "review", kind: "command", description: t("slash.cmd.review.desc") },
  { name: "security", kind: "command", description: t("slash.cmd.security.desc") },
  { name: "permission", kind: "command", description: t("slash.cmd.permission.desc"), hint: t("slash.cmd.permission.hint") }
];
var defaultSkills = (t) => [
  { name: "frontend-ui-engineering", kind: "skill", description: t("slash.skill.frontend-ui-engineering") },
  { name: "api-and-interface-design", kind: "skill", description: t("slash.skill.api-and-interface-design") },
  { name: "test-driven-development", kind: "skill", description: t("slash.skill.test-driven-development") },
  { name: "debugging-and-error-recovery", kind: "skill", description: t("slash.skill.debugging-and-error-recovery") },
  { name: "performance-optimization", kind: "skill", description: t("slash.skill.performance-optimization") },
  { name: "ci-cd-and-automation", kind: "skill", description: t("slash.skill.ci-cd-and-automation") },
  { name: "code-review-and-quality", kind: "skill", description: t("slash.skill.code-review-and-quality") },
  { name: "code-simplification", kind: "skill", description: t("slash.skill.code-simplification") },
  { name: "context-engineering", kind: "skill", description: t("slash.skill.context-engineering") },
  { name: "doubt-driven-development", kind: "skill", description: t("slash.skill.doubt-driven-development") },
  { name: "git-workflow-and-versioning", kind: "skill", description: t("slash.skill.git-workflow-and-versioning") },
  { name: "idea-refine", kind: "skill", description: t("slash.skill.idea-refine") },
  { name: "incremental-implementation", kind: "skill", description: t("slash.skill.incremental-implementation") },
  { name: "interview-me", kind: "skill", description: t("slash.skill.interview-me") },
  { name: "memory-leak-debugging", kind: "skill", description: t("slash.skill.memory-leak-debugging") },
  { name: "observability-and-instrumentation", kind: "skill", description: t("slash.skill.observability-and-instrumentation") },
  { name: "planning-and-task-breakdown", kind: "skill", description: t("slash.skill.planning-and-task-breakdown") },
  { name: "security-and-hardening", kind: "skill", description: t("slash.skill.security-and-hardening") },
  { name: "shipping-and-launch", kind: "skill", description: t("slash.skill.shipping-and-launch") },
  { name: "source-driven-development", kind: "skill", description: t("slash.skill.source-driven-development") },
  { name: "spec-driven-development", kind: "skill", description: t("slash.skill.spec-driven-development") },
  { name: "using-agent-skills", kind: "skill", description: t("slash.skill.using-agent-skills") }
];
function SlashPromptInput({
  value,
  onChange,
  controller,
  placeholder,
  rows = 4,
  maxLength = 8e3,
  disabled = false,
  autoFocus = false,
  className,
  ariaLabel,
  allowImages = false,
  onUploadingChange
}) {
  const t = useT();
  const textareaRef = (0, import_react6.useRef)(null);
  const popupRef = (0, import_react6.useRef)(null);
  const listRef = (0, import_react6.useRef)(null);
  const fileInputRef = (0, import_react6.useRef)(null);
  const [popupStyle, setPopupStyle] = (0, import_react6.useState)({});
  const [hostCompletions, setHostCompletions] = (0, import_react6.useState)(void 0);
  const completions = (0, import_react6.useMemo)(() => {
    const merge = (defaults, host) => {
      const map = /* @__PURE__ */ new Map();
      for (const d of defaults) map.set(d.name, d);
      for (const h of host ?? []) map.set(h.name, h);
      return Array.from(map.values());
    };
    return { commands: merge(defaultCommands(t), hostCompletions?.commands), skills: merge(defaultSkills(t), hostCompletions?.skills) };
  }, [t, hostCompletions]);
  const [popupOpen, setPopupOpen] = (0, import_react6.useState)(false);
  const [slashQuery, setSlashQuery] = (0, import_react6.useState)("");
  const [slashStart, setSlashStart] = (0, import_react6.useState)(-1);
  const [selectedIndex, setSelectedIndex] = (0, import_react6.useState)(0);
  const [uploading, setUploading] = (0, import_react6.useState)(false);
  const uploadFiles = async (rawFiles) => {
    const files = acceptedImageFiles(rawFiles);
    if (!allowImages || controller === void 0 || files.length === 0 || uploading) return;
    setUploading(true);
    onUploadingChange?.(true);
    const element = textareaRef.current;
    let nextValue = element?.value ?? value;
    let start = element?.selectionStart ?? nextValue.length;
    let end = element?.selectionEnd ?? start;
    let changed = false;
    try {
      for (const file of files) {
        const asset = await controller.uploadImage(file);
        if (asset === void 0) continue;
        const next = insertImageMarkdown(nextValue, start, end, imageMarkdown(asset, imageAlt(file.name, t("image.defaultAlt"))));
        nextValue = next.value;
        start = next.cursor;
        end = start;
        changed = true;
      }
      if (changed) {
        onChange(nextValue);
        setTimeout(() => {
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(start, start);
        }, 0);
      }
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };
  (0, import_react6.useEffect)(() => {
    if (controller === void 0) return;
    let alive = true;
    void controller.fetchPromptCompletions().then((res) => {
      if (!alive || res === void 0) return;
      setHostCompletions({
        commands: res.commands.map((c) => ({ ...c, kind: "command" })),
        skills: res.skills.map((s) => ({ ...s, kind: "skill" }))
      });
    });
    return () => {
      alive = false;
    };
  }, [controller]);
  const filteredItems = (0, import_react6.useMemo)(() => {
    const q = slashQuery.toLowerCase().trim();
    const all = [...completions.commands, ...completions.skills];
    if (q.length === 0) return all;
    return all.filter((item) => item.name.toLowerCase().includes(q) || item.description !== void 0 && item.description.toLowerCase().includes(q));
  }, [completions, slashQuery]);
  (0, import_react6.useEffect)(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);
  (0, import_react6.useLayoutEffect)(() => {
    if (!popupOpen) return;
    const list = listRef.current;
    const active = list?.children[selectedIndex];
    if (list === null || !(active instanceof HTMLElement)) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
    else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
  }, [popupOpen, selectedIndex, filteredItems]);
  const checkSlashTrigger = () => {
    const el = textareaRef.current;
    if (el === null) return;
    const pos = el.selectionStart;
    const currentText = el.value.slice(0, pos);
    const lastSlash = currentText.lastIndexOf("/");
    if (lastSlash >= 0) {
      const charBefore = lastSlash > 0 ? currentText[lastSlash - 1] ?? "\n" : "\n";
      const isWordStart = /\s/.test(charBefore) || lastSlash === 0;
      const queryPart = currentText.slice(lastSlash + 1);
      const noWhitespaceInQuery = !/\s/.test(queryPart);
      if (isWordStart && noWhitespaceInQuery) {
        setSlashStart(lastSlash);
        setSlashQuery(queryPart);
        setPopupOpen(true);
        return;
      }
    }
    setPopupOpen(false);
  };
  const applyCompletion = (item) => {
    const el = textareaRef.current;
    if (el === null || slashStart < 0) return;
    const pos = el.selectionStart;
    const before = value.slice(0, slashStart);
    const after = value.slice(pos);
    const inserted = `/${item.name} `;
    const nextText = before + inserted + after;
    onChange(nextText);
    setPopupOpen(false);
    setTimeout(() => {
      if (textareaRef.current !== null) {
        const nextPos = slashStart + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };
  const handleKeyDown = (e) => {
    if (popupOpen && filteredItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const picked = filteredItems[selectedIndex];
        if (picked !== void 0) {
          e.preventDefault();
          applyCompletion(picked);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPopupOpen(false);
        return;
      }
    }
  };
  const positionPopup = (0, import_react6.useCallback)(() => {
    const anchor = textareaRef.current;
    if (anchor === null) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const vh = window.innerHeight;
    const measured = popupRef.current?.offsetHeight ?? 0;
    const natural = measured > 0 ? measured : 240;
    const roomAbove = rect.top - gap - margin;
    const roomBelow = vh - margin - (rect.bottom + gap);
    const openBelow = roomBelow > roomAbove;
    const height = Math.min(natural, Math.max(openBelow ? roomBelow : roomAbove, 120));
    const top = openBelow ? rect.bottom + gap : rect.top - gap - height;
    setPopupStyle((prev) => prev.left === rect.left && prev.top === top && prev.width === rect.width && prev.maxHeight === height ? prev : { position: "fixed", left: rect.left, top, width: rect.width, maxHeight: height, zIndex: 100 });
  }, []);
  (0, import_react6.useLayoutEffect)(() => {
    if (!popupOpen) return;
    positionPopup();
  });
  (0, import_react6.useEffect)(() => {
    if (!popupOpen) return;
    window.addEventListener("scroll", positionPopup, true);
    window.addEventListener("resize", positionPopup);
    return () => {
      window.removeEventListener("scroll", positionPopup, true);
      window.removeEventListener("resize", positionPopup);
    };
  }, [popupOpen, positionPopup]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: `dsh-atb-prompt-wrap ${className ?? ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-atb-prompt-inner", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "textarea",
        {
          ref: textareaRef,
          className: "dsh-atb-prompt-input",
          value,
          rows,
          maxLength,
          disabled: disabled || uploading,
          autoFocus,
          placeholder,
          "aria-label": ariaLabel,
          onChange: (e) => {
            onChange(e.target.value);
            checkSlashTrigger();
          },
          onKeyUp: checkSlashTrigger,
          onClick: checkSlashTrigger,
          onKeyDown: handleKeyDown,
          onPaste: (e) => {
            const files = acceptedImageFiles(e.clipboardData.files);
            if (allowImages && files.length > 0) {
              e.preventDefault();
              void uploadFiles(files);
            }
          },
          onDragOver: (e) => {
            if (allowImages && e.dataTransfer.types.includes("Files")) e.preventDefault();
          },
          onDrop: (e) => {
            const files = acceptedImageFiles(e.dataTransfer.files);
            if (allowImages && files.length > 0) {
              e.preventDefault();
              void uploadFiles(files);
            }
          }
        }
      ),
      popupOpen && filteredItems.length > 0 && (0, import_react_dom.createPortal)(
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { ref: popupRef, className: "dsh-atb-slash-popup", style: popupStyle, role: "listbox", "aria-label": t("slash.aria"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-atb-slash-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-atb-slash-title", children: t("slash.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-atb-slash-hint", children: t("slash.hint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { ref: listRef, className: "dsh-atb-slash-list", children: filteredItems.map((item, idx) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "div",
            {
              role: "option",
              "aria-selected": idx === selectedIndex,
              className: "dsh-atb-slash-item",
              "data-active": idx === selectedIndex ? "true" : void 0,
              "data-kind": item.kind,
              onClick: () => applyCompletion(item),
              onMouseEnter: () => setSelectedIndex(idx),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-atb-slash-badge", "data-kind": item.kind, children: item.kind === "command" ? t("slash.badge.command") : t("slash.badge.skill") }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dsh-atb-slash-name", children: [
                  "/",
                  item.name
                ] }),
                item.hint && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-atb-slash-param", children: item.hint }),
                item.description && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-atb-slash-desc", children: item.description })
              ]
            },
            `${item.kind}-${item.name}`
          )) })
        ] }),
        document.body
      )
    ] }),
    allowImages && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-atb-image-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          ref: fileInputRef,
          type: "file",
          accept: IMAGE_ACCEPT,
          multiple: true,
          hidden: true,
          onChange: (e) => {
            if (e.target.files !== null) void uploadFiles(e.target.files);
            e.target.value = "";
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "dsh-atb-image-add", disabled: disabled || uploading, onClick: () => fileInputRef.current?.click(), children: uploading ? t("image.uploading") : t("image.add") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-atb-image-hint", children: t("image.hint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-atb-prompt-foot", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dsh-atb-prompt-tip", children: [
      t("slash.tipA"),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: "/" }),
      " ",
      t("slash.tipB")
    ] }) })
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskFormModal.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var LAST_MODEL_KEY = "dsh-taskboard-last-model-v1";
function loadLastModel() {
  try {
    const raw = localStorage.getItem(LAST_MODEL_KEY);
    if (raw === null) return void 0;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const { provider, model, reasoningEffort } = parsed;
      if (typeof provider === "string" && typeof model === "string" && provider.trim().length > 0 && model.trim().length > 0) {
        return {
          provider: provider.trim(),
          model: model.trim(),
          ...typeof reasoningEffort === "string" && reasoningEffort.trim().length > 0 ? { reasoningEffort: reasoningEffort.trim() } : {}
        };
      }
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function saveLastModel(model) {
  try {
    if (model === void 0) {
      localStorage.removeItem(LAST_MODEL_KEY);
    } else {
      localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(model));
    }
  } catch {
  }
}
var urgencyOptions = (t) => [
  { value: "urgent", label: t("form.urgency.urgent") },
  { value: "normal", label: t("form.urgency.normal") },
  { value: "relaxed", label: t("form.urgency.relaxed") }
];
var cronPresets = (t) => [
  { label: t("form.cron.daily"), cron: "0 9 * * *" },
  { label: t("form.cron.hourly"), cron: "0 * * * *" },
  { label: t("form.cron.every10min"), cron: "*/10 * * * *" },
  { label: t("form.cron.weekly"), cron: "0 9 * * 1" }
];
var permissionOptions = (t) => [
  { value: "workspace-write", label: t("form.perm.write"), icon: "\u{1F4C1}" },
  { value: "read-only", label: t("form.perm.readOnly"), icon: "\u{1F512}" },
  { value: "danger-full-access", label: t("form.perm.fullAccess"), icon: "\u26A1" }
];
function Field({ label, required = false, full = false, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-atb-field", "data-span": full ? "full" : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-atb-field-label", children: [
      label,
      required && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("em", { className: "dsh-atb-req", children: "*" })
    ] }),
    children
  ] });
}
function ChecklistEditor({ rows, onChange, editing }) {
  const t = useT();
  const setRow = (index, patch) => {
    const next = rows.map((row, i) => i === index ? { ...row, ...patch } : row);
    onChange(next);
  };
  const checked = rows.filter((r) => r.checked).length;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-cke", children: [
    rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-cke-row", children: [
      editing && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "input",
        {
          type: "checkbox",
          className: "dsh-atb-cke-box",
          checked: row.checked,
          title: t("form.check.checkedTitle", { who: row.checkedBy ?? t("form.check.notCheckedYet") }),
          onChange: (e) => setRow(index, { checked: e.target.checked })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "input",
        {
          className: "dsh-atb-cke-text",
          value: row.text,
          maxLength: 200,
          placeholder: t("form.check.itemPlaceholder", { n: index + 1 }),
          spellCheck: false,
          onChange: (e) => setRow(index, { text: e.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-atb-cke-del", title: t("form.check.removeTitle"), onClick: () => onChange(rows.filter((_, i) => i !== index)), children: "\u2715" })
    ] }, row.id ?? `new-${index}`)),
    rows.length < MAX_CHECKLIST_ITEMS && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-atb-cke-add", onClick: () => onChange([...rows, { text: "", checked: false }]), children: t("form.check.add") }),
    rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-cke-hint", children: editing ? t("form.check.hintEdit", { checked, total: rows.length }) : t("form.check.hintCreate", { n: rows.length }) })
  ] });
}
function TaskFormModal({ controller, task }) {
  const t = useT();
  const state = controller.getSnapshot();
  const { alert: showAlert, el: alertEl } = useAlert();
  const prefill = state.templatePrefill;
  const editing = task !== void 0;
  const [title, setTitle] = (0, import_react7.useState)(task?.title ?? prefill?.title ?? "");
  const [description, setDescription] = (0, import_react7.useState)(task?.description ?? prefill?.description ?? "");
  const [prompt, setPrompt] = (0, import_react7.useState)(task?.prompt ?? prefill?.prompt ?? "");
  const [workspaceId, setWorkspaceId] = (0, import_react7.useState)(task?.workspaceId ?? state.filters.workspaceId ?? state.workspaces[0]?.id ?? "");
  const [urgency, setUrgency] = (0, import_react7.useState)(task?.urgency ?? (prefill?.urgency === "urgent" || prefill?.urgency === "relaxed" ? prefill.urgency : "normal"));
  const initExec = task?.execution ?? prefill?.execution;
  const [mode, setMode] = (0, import_react7.useState)(
    initExec?.mode === "scheduled" ? initExec.cron !== void 0 ? "periodic" : "once" : "claim"
  );
  const [cron, setCron] = (0, import_react7.useState)(task?.execution.cron ?? prefill?.execution?.cron ?? "0 9 * * *");
  const [periodicCompletion, setPeriodicCompletion] = (0, import_react7.useState)(
    task?.execution.periodicCompletion ?? prefill?.execution?.periodicCompletion ?? "spawn"
  );
  const initialSessionChoice = task?.execution.reuseSessionId !== void 0 ? `selected:${task.execution.reuseSessionId}` : task !== void 0 ? task.execution.sessionReuseMode ?? "reuse" : prefill?.execution?.reuseSessionId !== void 0 ? `selected:${prefill.execution.reuseSessionId}` : prefill?.execution?.sessionReuseMode ?? "fresh";
  const [sessionChoice, setSessionChoice] = (0, import_react7.useState)(initialSessionChoice);
  const [projectSessions, setProjectSessions] = (0, import_react7.useState)([]);
  const [sessionsLoading, setSessionsLoading] = (0, import_react7.useState)(false);
  const [sessionsError, setSessionsError] = (0, import_react7.useState)(false);
  const initRunAt = initExec?.mode === "scheduled" && initExec.runAt !== void 0 ? initExec.runAt : void 0;
  const [runAt, setRunAt] = (0, import_react7.useState)(() => {
    if (initRunAt === void 0) return "";
    const d = new Date(initRunAt);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [catalog, setCatalog] = (0, import_react7.useState)([]);
  const initialModel = editing ? task.model : prefill?.model ?? state.ledger.settings?.defaultModel ?? loadLastModel();
  const [model, setModel] = (0, import_react7.useState)(initialModel !== void 0 ? JSON.stringify({ provider: initialModel.provider, model: initialModel.model }) : "");
  const [reasoningEffort, setReasoningEffort] = (0, import_react7.useState)(initialModel?.reasoningEffort ?? "");
  const initialPreset = editing ? task.presetId ?? "" : prefill?.presetId ?? state.ledger.settings?.defaultPresetId ?? "";
  const [presetId, setPresetId] = (0, import_react7.useState)(initialPreset);
  const [presets, setPresets] = (0, import_react7.useState)([]);
  const [presetDefault, setPresetDefault] = (0, import_react7.useState)(void 0);
  const [permission, setPermission] = (0, import_react7.useState)(
    task?.permission ?? (prefill?.permission ? asPermission(prefill.permission) : defaultPermissionOf(state.ledger.settings))
  );
  const [isolation, setIsolation] = (0, import_react7.useState)(task?.isolation ?? (prefill?.isolation === "none" ? "none" : prefill?.isolation === "worktree" ? "worktree" : defaultIsolationOf(state.ledger.settings)));
  const [checkRows, setCheckRows] = (0, import_react7.useState)(
    task?.checklist !== void 0 && task.checklist.length > 0 ? task.checklist.map((i) => ({ ...i })) : (prefill?.checklist ?? []).map((text) => ({ text, checked: false }))
  );
  const titleRef = (0, import_react7.useRef)(null);
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [imageUploading, setImageUploading] = (0, import_react7.useState)(false);
  (0, import_react7.useEffect)(() => {
    titleRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") controller.closeForm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [controller]);
  (0, import_react7.useEffect)(() => {
    void controller.fetchModelCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, [controller]);
  (0, import_react7.useEffect)(() => {
    if (workspaceId === "") return;
    let active = true;
    setSessionsLoading(true);
    setSessionsError(false);
    void controller.fetchProjectSessions(workspaceId).then((sessions) => {
      if (active) setProjectSessions(sessions);
    }).catch(() => {
      if (active) {
        setProjectSessions([]);
        setSessionsError(true);
      }
    }).finally(() => {
      if (active) setSessionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [controller, workspaceId]);
  (0, import_react7.useEffect)(() => {
    void controller.fetchPresetCatalog().then((roster) => {
      setPresets(roster.presets);
      setPresetDefault(roster.defaultId);
      if (!editing && initialPreset === "" && roster.defaultId !== void 0) setPresetId(roster.defaultId);
    }).catch(() => setPresets([]));
  }, [controller, editing, task?.presetId, initialPreset]);
  const cronMatch = mode === "periodic" ? parseCron(cron.trim()) : null;
  const nextRun = cronMatch !== null ? nextCronTime(cronMatch, Date.now()) : null;
  const cronBad = mode === "periodic" && (cronMatch === null || nextRun === null);
  const runAtMs = mode === "once" && runAt !== "" ? new Date(runAt).getTime() : NaN;
  const runAtBad = mode === "once" && (runAt === "" || Number.isNaN(runAtMs) || runAtMs <= Date.now());
  const valid = title.trim().length > 0 && workspaceId !== "" && !cronBad && !runAtBad && (mode === "claim" || !sessionChoice.startsWith("selected:") || !sessionsLoading && projectSessions.some((s) => s.id === sessionChoice.slice("selected:".length)));
  const executionPayload = () => {
    const reuse = sessionChoice.startsWith("selected:") ? { reuseSessionId: sessionChoice.slice("selected:".length) } : { sessionReuseMode: sessionChoice === "reuse" ? "reuse" : "fresh" };
    if (mode === "periodic") return { mode: "scheduled", cron: cron.trim(), periodicCompletion, ...reuse };
    if (mode === "once") return {
      mode: "scheduled",
      runAt: new Date(runAt).toISOString(),
      ...sessionChoice.startsWith("selected:") ? { reuseSessionId: sessionChoice.slice("selected:".length) } : {}
    };
    return { mode: "claim" };
  };
  const runBlocked = editing && task.status === "in_progress";
  const isolationLocked = editing && ((task.executions?.length ?? 0) > 0 || task.status === "in_progress");
  const gitOk = controller.gitAvailable(workspaceId);
  const repoCount = controller.repoCount(workspaceId);
  const isolationDisabled = isolationLocked || !gitOk;
  const isolationPayload = () => {
    if (!gitOk) return void 0;
    return isolation;
  };
  const presetPayload = () => presetId.trim().length > 0 ? presetId.trim() : void 0;
  const filledRows = () => checkRows.map((r) => ({ ...r, text: r.text.trim() })).filter((r) => r.text.length > 0);
  const parsedModel = model !== "" ? JSON.parse(model) : void 0;
  const currentCatalogModel = parsedModel !== void 0 ? catalog.find((m) => m.provider === parsedModel.provider && m.model === parsedModel.model) : void 0;
  const modelReasoning = currentCatalogModel?.reasoning;
  const buildPickedModel = () => {
    if (parsedModel === void 0) return void 0;
    const eff = reasoningEffort.trim();
    return {
      provider: parsedModel.provider,
      model: parsedModel.model,
      ...eff.length > 0 ? { reasoningEffort: eff } : {}
    };
  };
  const submit = () => {
    if (!valid || busy || imageUploading) return;
    const picked = buildPickedModel();
    if (!editing) saveLastModel(picked);
    const isolationOut = isolationPayload();
    const presetOut = presetPayload();
    const rows = filledRows();
    setBusy(true);
    const action = editing ? controller.update(task.id, task.version, {
      title,
      description,
      prompt,
      urgency,
      workspaceId,
      execution: executionPayload(),
      // '' in edit mode clears the pinned model back to the default.
      model: picked ?? null,
      ...isolationOut !== void 0 && !isolationLocked ? { isolation: isolationOut } : {},
      presetId: presetOut ?? null,
      permission,
      // [] clears the checklist (host deletes the field on empty).
      checklist: rows.length > 0 ? rows : null
    }) : controller.create({
      title,
      workspaceId,
      urgency,
      description: description.length > 0 ? description : void 0,
      prompt: prompt.length > 0 ? prompt : void 0,
      execution: executionPayload(),
      model: picked ?? null,
      ...isolationOut !== void 0 ? { isolation: isolationOut } : {},
      presetId: presetOut ?? null,
      permission,
      ...rows.length > 0 ? { checklist: rows.map((r) => r.text) } : {}
    });
    void action.catch(() => void 0).finally(() => setBusy(false));
  };
  const submitAndRun = () => {
    if (!valid || runBlocked || busy || imageUploading) return;
    const picked = buildPickedModel();
    if (!editing) saveLastModel(picked);
    const isolationOut = isolationPayload();
    const presetOut = presetPayload();
    const rows = filledRows();
    setBusy(true);
    void (async () => {
      if (editing) {
        const saved = await controller.update(task.id, task.version, {
          title,
          description,
          prompt,
          urgency,
          workspaceId,
          execution: executionPayload(),
          model: picked ?? null,
          ...isolationOut !== void 0 && !isolationLocked ? { isolation: isolationOut } : {},
          presetId: presetOut ?? null,
          permission,
          checklist: rows.length > 0 ? rows : null
        });
        if (saved) await controller.run(task.id);
      } else {
        const id = await controller.create({
          title,
          workspaceId,
          urgency,
          description: description.length > 0 ? description : void 0,
          prompt: prompt.length > 0 ? prompt : void 0,
          execution: executionPayload(),
          model: picked ?? null,
          ...isolationOut !== void 0 ? { isolation: isolationOut } : {},
          presetId: presetOut ?? null,
          permission,
          ...rows.length > 0 ? { checklist: rows.map((r) => r.text) } : {}
        });
        if (id !== void 0) await controller.run(id);
      }
    })().catch(() => void 0).finally(() => setBusy(false));
  };
  const saveAsTemplate = () => {
    if (busy || imageUploading) return;
    const name2 = title.trim();
    if (name2.length === 0) return;
    const rows = filledRows();
    void controller.upsertTemplate({
      name: name2.slice(0, 60),
      task: {
        title: name2,
        description: description.length > 0 ? description : void 0,
        prompt: prompt.length > 0 ? prompt : void 0,
        urgency,
        execution: executionPayload(),
        model: buildPickedModel(),
        isolation: isolationPayload(),
        presetId: presetPayload(),
        permission,
        checklist: rows.length > 0 ? rows.map((r) => r.text) : void 0
      }
    }).then((ok) => {
      if (ok) showAlert(t("detail.action.saveTplDone"));
    });
  };
  const hint = !valid ? title.trim().length === 0 ? t("form.hint.needTitle") : workspaceId === "" ? t("form.hint.needProject") : runAtBad ? t("form.hint.runAtBad") : t("form.hint.cronBad") : mode === "periodic" && nextRun !== null ? t("form.hint.nextRun", { time: fmtTime(nextRun) }) : mode === "once" && !Number.isNaN(runAtMs) ? t("form.hint.onceAt", { time: fmtTime(runAtMs) }) : editing ? t("form.hint.saveVersion", { v: task.version, next: task.version + 1 }) : t("form.hint.createClaim");
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-modal-backdrop", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-modal dsh-atb-taskform-modal", "data-mode": editing ? "edit" : "create", role: "dialog", "aria-modal": "true", "aria-label": editing ? t("form.title.edit") : t("form.title.create"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-modal-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-modal-headicon", children: editing ? "\u270E" : "\u271A" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-modal-headtext", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { children: editing ? t("form.title.edit") : t("form.title.create") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: editing ? t("form.subtitle.edit") : t("form.subtitle.create") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-atb-modal-close", "aria-label": t("shared.close"), onClick: () => controller.closeForm(), children: "\u2715" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-modal-body dsh-atb-taskform-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-form-col dsh-atb-form-left", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.title"), required: true, full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { ref: titleRef, value: title, onChange: (e) => setTitle(e.target.value), placeholder: t("form.field.titlePlaceholder"), maxLength: 200 }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-form-subgrid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.project"), required: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("select", { value: workspaceId, onChange: (e) => {
              setWorkspaceId(e.target.value);
              setSessionChoice("fresh");
              setProjectSessions([]);
            }, children: state.workspaces.map((ws) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: ws.id, children: ws.title || ws.path }, ws.id)) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.model"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
              "select",
              {
                value: model,
                onChange: (e) => {
                  const val = e.target.value;
                  setModel(val);
                  if (val === "") {
                    setReasoningEffort("");
                  } else {
                    const pm = JSON.parse(val);
                    const cm = catalog.find((m) => m.provider === pm.provider && m.model === pm.model);
                    if (cm?.reasoning?.defaultEffort !== void 0) {
                      setReasoningEffort(cm.reasoning.defaultEffort);
                    } else {
                      setReasoningEffort("");
                    }
                  }
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: t("form.field.modelDefault") }),
                  parsedModel !== void 0 && currentCatalogModel === void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: model, children: [
                    parsedModel.model,
                    " (",
                    parsedModel.provider,
                    ")"
                  ] }),
                  catalog.map((m) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: JSON.stringify({ provider: m.provider, model: m.model }), children: t("form.model.option", { name: m.name ?? m.model, provider: m.provider }) }, `${m.provider}/${m.model}`))
                ]
              }
            ) }),
            parsedModel !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.effort"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
              "select",
              {
                value: reasoningEffort,
                onChange: (e) => setReasoningEffort(e.target.value),
                title: t("form.field.effortTitle"),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: "", children: [
                    t("form.effort.follow"),
                    modelReasoning?.defaultEffort !== void 0 ? t("shared.current", { name: modelReasoning.efforts.find((ef) => ef.id === modelReasoning.defaultEffort)?.name ?? modelReasoning.defaultEffort }) : ""
                  ] }),
                  reasoningEffort !== "" && !(modelReasoning !== void 0 && modelReasoning.efforts.length > 0 ? modelReasoning.efforts.some((eff) => eff.id === reasoningEffort) : ["low", "medium", "high", "none"].includes(reasoningEffort)) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: reasoningEffort, children: reasoningEffort }),
                  modelReasoning !== void 0 && modelReasoning.efforts.length > 0 ? modelReasoning.efforts.map((eff) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: eff.id, children: [
                    eff.name,
                    eff.description ? ` (${eff.description})` : ""
                  ] }, eff.id)) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "low", children: t("form.effort.low") }),
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "medium", children: t("form.effort.medium") }),
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "high", children: t("form.effort.high") }),
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "none", children: t("form.effort.none") })
                  ] })
                ]
              }
            ) }),
            (presets.length > 0 || presetId !== "") && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.preset"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { value: presetId, onChange: (e) => setPresetId(e.target.value), title: t("form.field.presetTitle"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: "", children: [
                t("form.preset.follow"),
                presetDefault !== void 0 ? t("shared.current", { name: presets.find((p) => p.id === presetDefault)?.name ?? presetDefault }) : ""
              ] }),
              presetId !== "" && !presets.some((p) => p.id === presetId) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: presetId, children: presetId }),
              presets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: p.id, children: [
                p.name ?? p.id,
                p.id === presetDefault ? t("form.preset.defaultTag") : ""
              ] }, p.id))
            ] }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-form-subgrid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.permission"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("select", { className: "dsh-atb-permission-select", value: permission, onChange: (e) => setPermission(asPermission(e.target.value)), children: permissionOptions(t).map((opt) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: opt.value, children: [
              opt.icon,
              " ",
              opt.label,
              opt.value === "workspace-write" ? t("form.perm.defaultTag") : ""
            ] }, opt.value)) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.urgency"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("select", { className: "dsh-atb-urgency-select", value: urgency, onChange: (e) => setUrgency(e.target.value), children: urgencyOptions(t).map((o) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: o.value, children: o.label }, o.value)) }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.mode"), full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-mode-picker", "data-exec": "true", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": mode === "claim", onClick: () => setMode("claim"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.mode.claim") }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: t("form.mode.claimHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": mode === "once", onClick: () => setMode("once"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.mode.once") }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: t("form.mode.onceHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": mode === "periodic", onClick: () => setMode("periodic"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.mode.periodic") }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: t("form.mode.periodicHint") })
            ] })
          ] }) }),
          mode === "once" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.runAt"), required: true, full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              type: "datetime-local",
              className: runAtBad ? "dsh-atb-input-bad" : void 0,
              value: runAt,
              onChange: (e) => setRunAt(e.target.value),
              spellCheck: false
            }
          ) }),
          mode === "periodic" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Field, { label: t("form.field.cron"), required: true, full: true, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  className: cronBad ? "dsh-atb-input-bad" : void 0,
                  value: cron,
                  onChange: (e) => setCron(e.target.value),
                  placeholder: t("form.cron.placeholder"),
                  spellCheck: false
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-atb-cron-presets", children: [
                cronPresets(t).map((p) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-atb-cron-preset",
                    "data-on": cron.trim() === p.cron,
                    onClick: () => setCron(p.cron),
                    children: p.label
                  },
                  p.cron
                )),
                !cronBad && nextRun !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-cron-next", children: t("form.cron.next", { time: fmtTime(nextRun) }) })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: t("form.field.periodicCompletion"), full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-mode-picker", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": periodicCompletion === "rearm", onClick: () => setPeriodicCompletion("rearm"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.periodicCompletion.rearm") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: t("form.periodicCompletion.rearmHint") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": periodicCompletion === "spawn", onClick: () => setPeriodicCompletion("spawn"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.periodicCompletion.spawn") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: t("form.periodicCompletion.spawnHint") })
              ] })
            ] }) })
          ] }),
          mode === "periodic" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Field, { label: t("form.field.reuseSession"), full: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { value: sessionChoice, onChange: (e) => setSessionChoice(e.target.value), children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "fresh", children: t("form.session.fresh") }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "reuse", children: t("form.session.reuse") }),
              projectSessions.map((session) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: `selected:${session.id}`, children: session.title ?? session.id }, session.id))
            ] }),
            sessionsLoading && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("shared.loading") }),
            sessionsError && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("form.session.unavailable") }),
            !sessionsLoading && !sessionsError && sessionChoice.startsWith("selected:") && !projectSessions.some((session) => session.id === sessionChoice.slice("selected:".length)) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("form.session.missing") })
          ] }),
          mode === "once" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Field, { label: t("form.field.reuseSession"), full: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { value: sessionChoice.startsWith("selected:") ? sessionChoice : "fresh", onChange: (e) => setSessionChoice(e.target.value === "fresh" ? "fresh" : `selected:${e.target.value}`), children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "fresh", children: t("form.session.new") }),
              projectSessions.map((session) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: session.id, children: session.title ?? session.id }, session.id))
            ] }),
            sessionsLoading && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("shared.loading") }),
            sessionsError && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("form.session.unavailable") }),
            !sessionsLoading && !sessionsError && sessionChoice.startsWith("selected:") && !projectSessions.some((session) => session.id === sessionChoice.slice("selected:".length)) && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("form.session.missing") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Field, { label: t("form.field.isolation"), full: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-mode-picker", "data-disabled": isolationDisabled ? "true" : void 0, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-mode-opt",
                  "data-on": isolation === "worktree",
                  disabled: isolationDisabled,
                  title: isolationLocked ? t("form.iso.locked") : !gitOk ? t("form.iso.nonGit") : t("form.iso.worktreeTitle"),
                  onClick: () => setIsolation("worktree"),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.iso.worktree") }),
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: isolationLocked ? t("form.iso.lockedShort") : !gitOk ? t("form.iso.nonGit") : t("form.iso.worktreeHint") })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-mode-opt",
                  "data-on": isolation === "none",
                  disabled: isolationDisabled,
                  title: isolationLocked ? t("form.iso.locked") : t("form.iso.noneTitle"),
                  onClick: () => setIsolation("none"),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-name", children: t("form.iso.none") }),
                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-mode-hint", children: isolationLocked ? t("form.iso.lockedShort") : !gitOk ? t("form.iso.noneHintNonGit") : t("form.iso.noneHint") })
                  ]
                }
              )
            ] }),
            !gitOk && !isolationLocked && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", children: t("form.iso.nonGitNote") }),
            gitOk && !isolationLocked && repoCount > 1 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-isolation-note", "data-mirror": "true", children: t("form.iso.mirrorNote", { n: repoCount }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: editing ? t("form.field.checklist") : t("form.field.checklistOptional"), full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ChecklistEditor, { rows: checkRows, onChange: setCheckRows, editing }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-form-col dsh-atb-form-right", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: editing ? t("form.field.description") : t("form.field.descriptionOptional"), full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            SlashPromptInput,
            {
              value: description,
              onChange: setDescription,
              controller,
              rows: 7,
              placeholder: t("form.desc.placeholder"),
              allowImages: true,
              onUploadingChange: setImageUploading
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: editing ? t("form.field.prompt") : t("form.field.promptOptional"), full: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            SlashPromptInput,
            {
              value: prompt,
              onChange: setPrompt,
              controller,
              rows: 7,
              placeholder: t("form.prompt.placeholder")
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-atb-modal-foot", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-atb-modal-hint", "data-tone": valid ? void 0 : "bad", children: hint }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-atb-modal-footbtns", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => controller.closeForm(), children: t("shared.cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-btn",
              disabled: title.trim().length === 0 || busy || imageUploading,
              title: t("detail.action.saveTplTitle"),
              onClick: saveAsTemplate,
              children: t("detail.action.saveTpl")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-btn",
              disabled: !valid || runBlocked || busy || imageUploading,
              title: runBlocked ? t("form.action.runBlockedTitle") : busy || imageUploading ? t("form.action.runBusyTitle") : t("form.action.runTitle"),
              onClick: submitAndRun,
              children: t("form.action.run")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-primary": "true", disabled: !valid || busy || imageUploading, onClick: submit, children: editing ? t("form.action.save") : t("form.action.create") })
        ] })
      ] })
    ] }),
    alertEl
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/SettingsModal.tsx
var import_react9 = require("react");

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/ExternalSyncPanel.tsx
var import_react8 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function ScopePicker({ value, projects, loaded, onChange, t }) {
  const [manual, setManual] = (0, import_react8.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { title: projects.find((p) => p.id === value)?.name, value: manual ? "__manual__" : value, onChange: (e) => {
      if (e.target.value === "__manual__") setManual(true);
      else {
        setManual(false);
        onChange(e.target.value);
      }
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: projects.length ? t("ext.chooseScope") : t(loaded ? "ext.noScopes" : "ext.syncListFirst") }),
      value && !projects.some((p) => p.id === value) && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("option", { value, children: [
        "ID: ",
        value
      ] }),
      projects.map((p) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("option", { value: p.id, children: [
        "ID: ",
        p.id,
        " \xB7 ",
        p.name
      ] }, p.id)),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "__manual__", children: t("ext.enterScopeId") })
    ] }),
    (manual || !projects.length) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { "aria-label": t("ext.enterScopeId"), value, onChange: (e) => onChange(e.target.value) })
  ] });
}
function ExternalSyncPanel() {
  const t = useT();
  const [status, setStatus] = (0, import_react8.useState)();
  const [baseUrl, setBaseUrl] = (0, import_react8.useState)("");
  const [account, setAccount] = (0, import_react8.useState)("");
  const [reuseLogin, setReuseLogin] = (0, import_react8.useState)(true);
  const [providerId, setProviderId] = (0, import_react8.useState)("");
  const [authMode, setAuthMode] = (0, import_react8.useState)("");
  const [credentials, setCredentials] = (0, import_react8.useState)({});
  const [settings, setSettings] = (0, import_react8.useState)({});
  const [itemTypes, setItemTypes] = (0, import_react8.useState)([]);
  const [projects, setProjects] = (0, import_react8.useState)([]);
  const [projectsLoaded, setProjectsLoaded] = (0, import_react8.useState)(false);
  const [since, setSince] = (0, import_react8.useState)("");
  const [interval, setIntervalMinutes] = (0, import_react8.useState)("0");
  const [mappingMode, setMappingMode] = (0, import_react8.useState)("project");
  const [includeUnmapped, setIncludeUnmapped] = (0, import_react8.useState)(false);
  const [importStatus, setImportStatus] = (0, import_react8.useState)("backlog");
  const [mappings, setMappings] = (0, import_react8.useState)([{ projectId: "", workspaceId: "" }]);
  const [workspaces, setWorkspaces] = (0, import_react8.useState)([]);
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const [message, setMessage] = (0, import_react8.useState)("");
  const [action, setAction] = (0, import_react8.useState)("");
  const [savedDraft, setSavedDraft] = (0, import_react8.useState)();
  const descriptor = status?.providers?.find((p) => p.id === providerId);
  const authentication = descriptor?.authModes.find((m) => m.id === authMode);
  const effectiveAccount = providerId === "zentao" && reuseLogin ? (credentials.username ?? "").trim() : account;
  const canKeepCredentials = status?.config?.provider === providerId && status.config.authMode === authMode && status.config.account === effectiveAccount && status.config.baseUrl === baseUrl.replace(/\/$/, "");
  const draft = () => ({ provider: providerId, baseUrl, account: effectiveAccount, authMode, credentials, settings, itemTypes, since, intervalMinutes: Number(interval), importStatus, ...providerId === "zentao" ? { mappingMode, includeUnmapped, mappings: mappings.filter((m) => includeUnmapped || m.workspaceId) } : { mappings } });
  const fingerprint = (values = draft()) => JSON.stringify({
    ...values,
    itemTypes: [...values.itemTypes].sort(),
    mappings: values.mappings.filter((m) => m.projectId && m.workspaceId).slice().sort((a, b) => a.projectId.localeCompare(b.projectId))
  });
  const currentDraft = fingerprint();
  const dirty = savedDraft !== void 0 && currentDraft !== savedDraft;
  (0, import_react8.useEffect)(() => {
    if (status && savedDraft === void 0) setSavedDraft(currentDraft);
  }, [status, savedDraft, currentDraft]);
  const selectProvider = (p) => {
    setProviderId(p.id);
    setBaseUrl(p.defaultBaseUrl);
    setAuthMode(p.authModes[0].id);
    setReuseLogin(true);
    setMappingMode("project");
    setIncludeUnmapped(false);
    setCredentials({});
    setSettings(Object.fromEntries((p.settingsFields ?? []).map((f) => [f.key, f.defaultValue])));
    setItemTypes([p.capabilities.itemTypes[0]]);
    setProjects([]);
    setProjectsLoaded(false);
    setMappings(p.id === "zentao" ? [] : [{ projectId: "", workspaceId: "" }]);
  };
  (0, import_react8.useEffect)(() => {
    let active = true;
    void Promise.all([externalRequest(""), fetch("/dsh-taskboard/workspaces").then((r) => r.json())]).then(([s, ws]) => {
      if (!active) return;
      setStatus(s);
      setWorkspaces(ws.value ?? []);
      const c = s.config;
      if (c) {
        setProviderId(c.provider);
        setAuthMode(c.authMode);
        setItemTypes(c.itemTypes);
        setSettings(c.settings);
        setCredentials(s.credentialValues ?? {});
        setMappingMode(c.mappingMode ?? "project");
        setIncludeUnmapped(c.includeUnmapped ?? false);
        setImportStatus(c.importStatus ?? "backlog");
        setReuseLogin(c.provider !== "zentao" || c.account === (s.credentialValues?.username ?? "").trim());
        setBaseUrl(c.baseUrl);
        setAccount(c.account);
        setSince(c.since);
        setIntervalMinutes(String(c.intervalMinutes));
        setMappings(c.provider === "zentao" && !c.mappingMode ? [] : c.mappings);
      } else if (s.providers?.[0]) selectProvider(s.providers[0]);
    }).catch((e) => {
      if (active) setMessage(String(e.message));
    });
    return () => {
      active = false;
    };
  }, []);
  (0, import_react8.useEffect)(() => {
    let active = true;
    const timer = setInterval(() => {
      void externalRequest("").then((s) => {
        if (active) setStatus(s);
      }).catch(() => {
      });
    }, 3e3);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const act = async (path, body = {}) => {
    setBusy(true);
    setAction(path);
    setMessage("");
    try {
      const result = await externalRequest(path, body);
      if (path === "/projects") {
        const scopes = result;
        setProjects(scopes);
        setProjectsLoaded(true);
        if (providerId === "zentao") setMappings((current) => [
          ...scopes.map((p) => ({ projectId: p.id, workspaceId: current.find((m) => m.projectId === p.id)?.workspaceId ?? "" })),
          ...current.filter((m) => m.workspaceId && !scopes.some((p) => p.id === m.projectId))
        ]);
      }
      if (path === "/account" && result && typeof result === "object" && "account" in result) setAccount(String(result.account));
      const next = await externalRequest("");
      if (path === "/config") {
        const savedCredentials = next.credentialValues ?? {};
        setCredentials(savedCredentials);
        setSavedDraft(fingerprint({ ...draft(), credentials: savedCredentials }));
      }
      setStatus(next);
      setMessage(path === "/projects" ? t(providerId === "zentao" ? includeUnmapped ? "ext.unmappedMappingsFound" : "ext.mappingsFound" : "ext.projectsFound", { count: result.length }) : t("ext.success"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setAction("");
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "dsh-atb-diag-sec dsh-atb-external", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h4", { children: t("ext.heading") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("ext.hint") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("fieldset", { disabled: busy || status?.running, style: { border: 0, padding: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t("ext.provider"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { value: providerId, onChange: (e) => {
          const p = status?.providers.find((p2) => p2.id === e.target.value);
          if (p) selectProvider(p);
        }, children: (status?.providers ?? []).map((p) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: p.id, children: p.name }, p.id)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t("ext.url"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { value: baseUrl, onChange: (e) => setBaseUrl(e.target.value) })
      ] }),
      providerId !== "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
          t("ext.account"),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { value: account, onChange: (e) => setAccount(e.target.value) })
        ] }),
        !descriptor?.capabilities.accountDiscovery && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("ext.manualAccount") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t("ext.authMode"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { value: authMode, onChange: (e) => {
          setAuthMode(e.target.value);
          setCredentials({});
        }, children: descriptor?.authModes.map((m) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: m.id, children: t(m.label) }, m.id)) })
      ] }),
      authentication?.fields.map((field) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t(field.label),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "input",
          {
            type: field.secret === false ? "text" : "password",
            autoComplete: field.secret === false ? "username" : "new-password",
            value: credentials[field.key] ?? "",
            placeholder: canKeepCredentials && status?.credentialPresent[field.key] ? t("ext.tokenSaved") : "",
            onChange: (e) => setCredentials({ ...credentials, [field.key]: e.target.value })
          }
        )
      ] }, field.key)),
      providerId === "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { flexDirection: "row", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "input",
            {
              type: "checkbox",
              style: { width: "auto" },
              checked: reuseLogin,
              onChange: (e) => {
                setReuseLogin(e.target.checked);
                if (!e.target.checked && !account) setAccount(credentials.username ?? "");
              }
            }
          ),
          t("ext.reuseLogin")
        ] }),
        !reuseLogin && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
          t("ext.assigneeAccount"),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { value: account, onChange: (e) => setAccount(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-atb-external-options", role: "group", "aria-label": t(providerId === "zentao" ? "ext.syncScope" : "ext.itemTypes"), children: [
        providerId === "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("ext.syncScope") }),
        descriptor?.capabilities.itemTypes.map((type) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { flexDirection: "row", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { type: "checkbox", style: { width: "auto" }, checked: itemTypes.includes(type), disabled: providerId === "zentao" && itemTypes.length === 1 && itemTypes.includes(type), onChange: (e) => setItemTypes(e.target.checked ? [...itemTypes, type] : itemTypes.filter((v) => v !== type)) }),
          externalTypeLabel(type, t)
        ] }, type))
      ] }),
      descriptor?.settingsFields?.map((field) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t(field.label),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { value: settings[field.key] ?? field.defaultValue, onChange: (e) => setSettings({ ...settings, [field.key]: e.target.value }) })
      ] }, field.key)),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t("ext.since"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { type: "date", value: since, onChange: (e) => setSince(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t("ext.interval"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { type: "number", min: "0", max: "1440", value: interval, onChange: (e) => setIntervalMinutes(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        t("ext.importStatus"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { value: importStatus, onChange: (e) => setImportStatus(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "backlog", children: t("ext.importBacklog") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "todo", children: t("ext.importTodo") })
        ] })
      ] }),
      providerId === "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-atb-external-options", role: "radiogroup", "aria-label": t("ext.mappingMode"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: t("ext.mappingMode") }),
        ["project", "execution"].map((mode) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { flexDirection: "row", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "input",
            {
              type: "radio",
              name: "dsh-atb-mapping-mode",
              value: mode,
              checked: mappingMode === mode,
              style: { width: "auto" },
              onChange: () => {
                setMappingMode(mode);
                setProjects([]);
                setProjectsLoaded(false);
                setMappings([]);
              }
            }
          ),
          t(mode === "project" ? "ext.linkProject" : "ext.linkExecution")
        ] }, mode))
      ] }),
      providerId === "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_jsx_runtime7.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { flexDirection: "row", alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "input",
          {
            type: "checkbox",
            style: { width: "auto" },
            checked: includeUnmapped,
            onChange: (e) => setIncludeUnmapped(e.target.checked)
          }
        ),
        t(mappingMode === "project" ? "ext.syncUnmappedProjects" : "ext.syncUnmappedExecutions")
      ] }) }),
      providerId === "zentao" && status?.requiresMappingReview && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "alert", children: t("ext.remapRequired") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", margin: "9px 0" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", onClick: () => void act("/test", { ...draft(), mappings: providerId === "zentao" ? mappings.filter((m) => m.workspaceId) : mappings.filter((m) => m.projectId || m.workspaceId) }), children: t("ext.test") }),
        descriptor?.capabilities.projectDiscovery && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", onClick: () => void act("/projects", { ...draft(), mappings: [] }), children: t(providerId === "zentao" ? "ext.discoverMappings" : "ext.discoverProjects") })
      ] }),
      providerId === "zentao" && !mappings.length && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(projectsLoaded ? "ext.noScopes" : "ext.loadMappings") }),
      mappings.map((m, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-atb-external-mapping", children: [
        providerId === "zentao" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-atb-external-scope-info", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: projects.find((p) => p.id === m.projectId)?.name ?? `ID: ${m.projectId.split(":")[1]}` }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
            t(mappingMode === "project" ? "ext.projectId" : "ext.executionId"),
            ": ",
            m.projectId.split(":")[1]
          ] }),
          projectsLoaded && !projects.some((p) => p.id === m.projectId) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { role: "alert", children: t("ext.scopeUnavailable") })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_jsx_runtime7.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
          t(descriptor?.scopeLabel ?? "ext.projectId"),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            ScopePicker,
            {
              t,
              loaded: projectsLoaded,
              value: m.projectId,
              projects,
              onChange: (value) => setMappings(mappings.map((v, i) => i === index ? { ...v, projectId: value } : v))
            }
          )
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
          t("ext.workspace"),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { value: m.workspaceId, onChange: (e) => setMappings(mappings.map((v, i) => i === index ? { ...v, workspaceId: e.target.value } : v)), children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: providerId === "zentao" ? t("ext.unlinked") : "\u2014" }),
            workspaces.map((ws) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: ws.id, children: ws.title }, ws.id))
          ] })
        ] }),
        providerId !== "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-external-remove",
            "aria-label": t("ext.removeMapping", { n: index + 1 }),
            title: t("ext.removeMapping", { n: index + 1 }),
            disabled: mappings.length === 1,
            onClick: () => setMappings(mappings.filter((_, i) => i !== index)),
            children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" }) })
          }
        )
      ] }, providerId === "zentao" ? m.projectId : index)),
      dirty && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", children: t("ext.unsavedChanges") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
        providerId !== "zentao" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", onClick: () => setMappings([...mappings, { projectId: "", workspaceId: "" }]), children: t("ext.addMapping") }),
        descriptor?.capabilities.accountDiscovery && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", disabled: !status?.config, onClick: () => void act("/account"), children: t("ext.discoverAccount") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", disabled: providerId === "zentao" && projectsLoaded && mappings.some((m) => m.workspaceId && !projects.some((p) => p.id === m.projectId)), onClick: () => void act("/config", draft()), children: t("ext.save") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", disabled: !status?.config || status.requiresMappingReview || dirty, title: dirty ? t("ext.unsavedChanges") : void 0, onClick: () => void act("/sync"), children: t("ext.sync") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", disabled: !status?.ignoredCount, onClick: () => void act("/ignored/clear"), children: t("ext.clearIgnored") })
      ] })
    ] }),
    (action === "/sync" || status?.running) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", onClick: () => {
      void externalRequest("/cancel", {}).catch(() => {
      });
    }, children: t("ext.cancel") }),
    busy && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", children: t("ext.busy") }),
    message && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", children: message }),
    status?.lastError && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "alert", children: status.lastError }),
    status?.lastAttemptAt !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("ext.lastAttempt"),
      ": ",
      new Date(status.lastAttemptAt).toLocaleString()
    ] }),
    status?.lastResult && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { children: [
      t("ext.result", status.lastResult),
      " \xB7 ",
      new Date(status.lastResult.at).toLocaleString()
    ] })
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/SettingsModal.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var isolationOptions = (t) => [
  { value: "none", name: t("form.iso.none"), hint: t("set.iso.noneHint") },
  { value: "worktree", name: t("form.iso.worktree"), hint: t("set.iso.worktreeHint") }
];
function SettingsModal({ controller }) {
  const t = useT();
  const [section, setSection] = (0, import_react9.useState)("general");
  const state = controller.getSnapshot();
  const currentIso = state.ledger.settings?.defaultIsolation ?? DEFAULT_ISOLATION;
  const currentSync = defaultSyncExternalSessionsOf(state.ledger.settings);
  const currentPerm = defaultPermissionOf(state.ledger.settings);
  const currentMaxConcurrent = maxConcurrentOf(state.ledger.settings);
  const currentMissedAfterMinutes = scheduleMissedAfterMinutesOf(state.ledger.settings);
  const currentQueueMaxAgeMinutes = queueMaxAgeMinutesOf(state.ledger.settings);
  const currentDispatchIntervalMs = dispatchIntervalMsOf(state.ledger.settings);
  const currentCompletedLimit = completedDisplayLimitOf(state.ledger.settings);
  const currentModel = state.ledger.settings?.defaultModel;
  const currentModelKey = currentModel === void 0 ? "" : JSON.stringify({ provider: currentModel.provider, model: currentModel.model });
  const currentEffort = currentModel?.reasoningEffort ?? "";
  const currentPreset = state.ledger.settings?.defaultPresetId ?? "";
  const [catalog, setCatalog] = (0, import_react9.useState)([]);
  const [presets, setPresets] = (0, import_react9.useState)([]);
  const [presetDefault, setPresetDefault] = (0, import_react9.useState)();
  const [draftModel, setDraftModel] = (0, import_react9.useState)(currentModelKey);
  const [draftEffort, setDraftEffort] = (0, import_react9.useState)(currentEffort);
  const [draftPreset, setDraftPreset] = (0, import_react9.useState)(currentPreset);
  const parsedModel = draftModel === "" ? void 0 : JSON.parse(draftModel);
  const selectedModel = catalog.find((m) => m.provider === parsedModel?.provider && m.model === parsedModel?.model);
  const reasoning = selectedModel?.reasoning;
  const [draftIso, setDraftIso] = (0, import_react9.useState)(currentIso);
  const [draftSync, setDraftSync] = (0, import_react9.useState)(currentSync);
  const [draftPerm, setDraftPerm] = (0, import_react9.useState)(currentPerm);
  const [draftMaxConcurrent, setDraftMaxConcurrent] = (0, import_react9.useState)(String(currentMaxConcurrent));
  const [draftMissedAfterMinutes, setDraftMissedAfterMinutes] = (0, import_react9.useState)(String(currentMissedAfterMinutes));
  const [draftQueueMaxAgeMinutes, setDraftQueueMaxAgeMinutes] = (0, import_react9.useState)(String(currentQueueMaxAgeMinutes));
  const [draftDispatchIntervalMs, setDraftDispatchIntervalMs] = (0, import_react9.useState)(String(currentDispatchIntervalMs));
  const [draftCompletedLimit, setDraftCompletedLimit] = (0, import_react9.useState)(String(currentCompletedLimit));
  const [storagePath, setStoragePath] = (0, import_react9.useState)(state.storage?.currentDirectory ?? "");
  const [storageTouched, setStorageTouched] = (0, import_react9.useState)(false);
  const [storageBusy, setStorageBusy] = (0, import_react9.useState)(false);
  const maxConcurrent = Number(draftMaxConcurrent);
  const missedAfterMinutes = Number(draftMissedAfterMinutes);
  const queueMaxAgeMinutes = Number(draftQueueMaxAgeMinutes);
  const dispatchIntervalMs = Number(draftDispatchIntervalMs);
  const completedLimit = Number(draftCompletedLimit);
  const scheduleValid = Number.isSafeInteger(maxConcurrent) && maxConcurrent >= 1 && maxConcurrent <= 100 && Number.isSafeInteger(missedAfterMinutes) && missedAfterMinutes >= 1 && missedAfterMinutes <= 1440 && Number.isSafeInteger(queueMaxAgeMinutes) && queueMaxAgeMinutes >= 0 && queueMaxAgeMinutes <= 10080 && Number.isSafeInteger(dispatchIntervalMs) && dispatchIntervalMs >= 0 && dispatchIntervalMs <= 6e4;
  const completedLimitValid = Number.isSafeInteger(completedLimit) && completedLimit >= MIN_COMPLETED_DISPLAY_LIMIT && completedLimit <= MAX_COMPLETED_DISPLAY_LIMIT;
  const dirty = draftModel !== currentModelKey || draftEffort !== currentEffort || draftPreset !== currentPreset || draftIso !== currentIso || draftSync !== currentSync || draftPerm !== currentPerm || draftMaxConcurrent !== String(currentMaxConcurrent) || draftMissedAfterMinutes !== String(currentMissedAfterMinutes) || draftQueueMaxAgeMinutes !== String(currentQueueMaxAgeMinutes) || draftDispatchIntervalMs !== String(currentDispatchIntervalMs) || draftCompletedLimit !== String(currentCompletedLimit);
  const effectiveStoragePath = storagePath.trim().length === 0 ? state.storage?.defaultDirectory ?? "" : storagePath.trim();
  const storageDirty = state.storage !== void 0 && effectiveStoragePath !== state.storage.currentDirectory;
  (0, import_react9.useEffect)(() => {
    if (!storageTouched && state.storage !== void 0) setStoragePath(state.storage.currentDirectory);
  }, [state.storage, storageTouched]);
  (0, import_react9.useEffect)(() => {
    let active = true;
    void controller.fetchModelCatalog().then((models) => {
      if (active) setCatalog(models);
    }).catch(() => {
    });
    void controller.fetchPresetCatalog().then((roster) => {
      if (active) {
        setPresets(roster.presets);
        setPresetDefault(roster.defaultId);
      }
    }).catch(() => {
    });
    return () => {
      active = false;
    };
  }, [controller]);
  const save = () => {
    void controller.updateSettings({
      defaultIsolation: draftIso,
      syncExternalSessions: draftSync,
      defaultPermission: draftPerm,
      ...parsedModel !== void 0 ? { defaultModel: { ...parsedModel, ...draftEffort !== "" ? { reasoningEffort: draftEffort } : {} } } : {},
      ...draftPreset !== "" ? { defaultPresetId: draftPreset } : {},
      maxConcurrent,
      scheduleMissedAfterMinutes: missedAfterMinutes,
      queueMaxAgeMinutes,
      dispatchIntervalMs,
      completedDisplayLimit: completedLimit
    }).then((ok) => {
      if (ok) controller.closeSettings();
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-atb-modal-backdrop", onClick: (e) => {
    if (e.target === e.currentTarget) controller.closeSettings();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-modal dsh-atb-set", role: "dialog", "aria-modal": "true", "aria-label": t("set.aria"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-modal-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-modal-headicon", children: "\u{1F6E0}" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-modal-headtext", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { children: t("set.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { children: t("set.subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "dsh-atb-modal-close", "aria-label": t("shared.close"), onClick: () => controller.closeSettings(), children: "\u2715" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-settings-layout", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "nav",
        {
          className: "dsh-atb-settings-nav",
          role: "tablist",
          "aria-label": t("set.nav.label"),
          "aria-orientation": "vertical",
          onKeyDown: (e) => {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const next = e.key === "Home" ? "general" : e.key === "End" ? "external" : section === "general" ? "external" : "general";
            setSection(next);
            e.currentTarget.querySelector(`#dsh-atb-settings-tab-${next}`)?.focus();
          },
          children: ["general", "external"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
            "button",
            {
              id: `dsh-atb-settings-tab-${value}`,
              type: "button",
              role: "tab",
              "aria-selected": section === value,
              "aria-controls": `dsh-atb-settings-panel-${value}`,
              tabIndex: section === value ? 0 : -1,
              onClick: () => setSection(value),
              children: [
                t(`set.nav.${value}`),
                value === "general" && dirty ? " \u2022" : ""
              ]
            },
            value
          ))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-settings-content", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-modal-body", id: "dsh-atb-settings-panel-general", role: "tabpanel", "aria-labelledby": "dsh-atb-settings-tab-general", hidden: section !== "general", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.iso.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-atb-mode-picker", children: isolationOptions(t).map((o) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
              "button",
              {
                type: "button",
                className: "dsh-atb-mode-opt",
                "data-on": draftIso === o.value,
                title: o.hint,
                onClick: () => setDraftIso(o.value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-mode-name", children: o.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-mode-hint", children: o.hint })
                ]
              },
              o.value
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-isolation-note", children: t("set.iso.current", { current: currentIso === "worktree" ? t("form.iso.worktree") : t("form.iso.none") }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.sync.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-mode-picker", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-mode-opt",
                  "data-on": !draftSync,
                  title: t("set.sync.off.title"),
                  onClick: () => setDraftSync(false),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-mode-name", children: t("set.sync.off.name") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-mode-hint", children: t("set.sync.off.hint") })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-mode-opt",
                  "data-on": draftSync,
                  title: t("set.sync.on.title"),
                  onClick: () => setDraftSync(true),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-mode-name", children: t("set.sync.on.name") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-mode-hint", children: t("set.sync.on.hint") })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-isolation-note", children: currentSync ? t("set.sync.stateOn") : t("set.sync.stateOff") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.agent.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsh-atb-isolation-note", children: t("set.agent.hint") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-form-subgrid", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dsh-atb-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-field-label", children: t("set.agent.model") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("select", { className: "dsh-atb-input", value: draftModel, onChange: (e) => {
                  setDraftModel(e.target.value);
                  setDraftEffort("");
                }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "", children: t("form.field.modelDefault") }),
                  parsedModel !== void 0 && selectedModel === void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("option", { value: draftModel, children: [
                    parsedModel.model,
                    " (",
                    parsedModel.provider,
                    ")"
                  ] }),
                  catalog.map((m) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: JSON.stringify({ provider: m.provider, model: m.model }), children: t("form.model.option", { name: m.name ?? m.model, provider: m.provider }) }, `${m.provider}/${m.model}`))
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dsh-atb-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-field-label", children: t("set.agent.effort") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("select", { className: "dsh-atb-input", value: draftEffort, disabled: parsedModel === void 0, onChange: (e) => setDraftEffort(e.target.value), children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("option", { value: "", children: [
                    t("form.effort.follow"),
                    reasoning?.defaultEffort !== void 0 ? t("shared.current", { name: reasoning.efforts.find((e) => e.id === reasoning.defaultEffort)?.name ?? reasoning.defaultEffort }) : ""
                  ] }),
                  draftEffort !== "" && reasoning !== void 0 && !reasoning.efforts.some((e) => e.id === draftEffort) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: draftEffort, children: draftEffort }),
                  reasoning !== void 0 ? reasoning.efforts.map((e) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("option", { value: e.id, children: [
                    e.name,
                    e.description ? ` (${e.description})` : ""
                  ] }, e.id)) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
                    !["", "low", "medium", "high", "none"].includes(draftEffort) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: draftEffort, children: draftEffort }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "low", children: t("form.effort.low") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "medium", children: t("form.effort.medium") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "high", children: t("form.effort.high") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "none", children: t("form.effort.none") })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "dsh-atb-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-field-label", children: t("set.agent.preset") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("select", { className: "dsh-atb-input", value: draftPreset, onChange: (e) => setDraftPreset(e.target.value), children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("option", { value: "", children: [
                    t("form.preset.follow"),
                    presetDefault !== void 0 ? t("shared.current", { name: presets.find((p) => p.id === presetDefault)?.name ?? presetDefault }) : ""
                  ] }),
                  draftPreset !== "" && !presets.some((p) => p.id === draftPreset) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: draftPreset, children: draftPreset }),
                  presets.map((p) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("option", { value: p.id, children: [
                    p.name ?? p.id,
                    p.id === presetDefault ? t("form.preset.defaultTag") : ""
                  ] }, p.id))
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.perm.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-perm-picker", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-perm-opt",
                  "data-on": draftPerm === "workspace-write",
                  onClick: () => setDraftPerm("workspace-write"),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-perm-name", children: t("set.perm.writeName") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-perm-hint", children: t("set.perm.writeHint") })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-perm-opt",
                  "data-on": draftPerm === "read-only",
                  onClick: () => setDraftPerm("read-only"),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-perm-name", children: t("set.perm.readOnlyName") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-perm-hint", children: t("set.perm.readOnlyHint") })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-perm-opt",
                  "data-on": draftPerm === "danger-full-access",
                  onClick: () => setDraftPerm("danger-full-access"),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-perm-name", children: t("set.perm.fullName") }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-perm-hint", children: t("set.perm.fullHint") })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-isolation-note", children: t("set.perm.current", { current: currentPerm === "read-only" ? t("set.perm.readOnlyName") : currentPerm === "danger-full-access" ? t("set.perm.fullName") : t("set.perm.writeName") }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.schedule.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsh-atb-isolation-note", children: t("set.schedule.hint") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-settings-numbers", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.schedule.concurrent") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { className: "dsh-atb-input", type: "number", min: "1", max: "100", step: "1", value: draftMaxConcurrent, onChange: (e) => setDraftMaxConcurrent(e.target.value) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.schedule.missedAfter") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { className: "dsh-atb-input", type: "number", min: "1", max: "1440", step: "1", value: draftMissedAfterMinutes, onChange: (e) => setDraftMissedAfterMinutes(e.target.value) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.schedule.queueMaxAge") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { className: "dsh-atb-input", type: "number", min: "0", max: "10080", step: "1", value: draftQueueMaxAgeMinutes, onChange: (e) => setDraftQueueMaxAgeMinutes(e.target.value) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.schedule.dispatchInterval") }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { className: "dsh-atb-input", type: "number", min: "0", max: "60000", step: "1", value: draftDispatchIntervalMs, onChange: (e) => setDraftDispatchIntervalMs(e.target.value) })
              ] })
            ] }),
            !scheduleValid && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-storage-error", children: t("set.schedule.invalid") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.completedLimit.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsh-atb-isolation-note", children: t("set.completedLimit.hint") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-atb-settings-numbers", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.completedLimit.label") }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "input",
                {
                  className: "dsh-atb-input",
                  type: "number",
                  min: MIN_COMPLETED_DISPLAY_LIMIT,
                  max: MAX_COMPLETED_DISPLAY_LIMIT,
                  step: "1",
                  value: draftCompletedLimit,
                  onChange: (e) => setDraftCompletedLimit(e.target.value)
                }
              )
            ] }) }),
            !completedLimitValid && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-storage-error", children: t("set.schedule.invalid") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "dsh-atb-diag-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { children: t("set.storage.heading") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "dsh-atb-isolation-note", children: t("set.storage.hint") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "input",
              {
                className: "dsh-atb-input dsh-atb-storage-path",
                value: storagePath,
                disabled: state.storage === void 0 || storageBusy,
                placeholder: state.storage?.defaultDirectory ?? t("set.storage.loading"),
                onChange: (e) => {
                  setStoragePath(e.target.value);
                  setStorageTouched(true);
                  controller.dismissStorageNotice();
                }
              }
            ),
            state.storageNotice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-storage-notice", role: "status", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "dsh-atb-storage-notice-ok", children: [
                "\u2713 ",
                t("set.storage.migrated", { path: state.storageNotice.path })
              ] }),
              state.storageNotice.warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-storage-notice-warn", children: t("set.storage.warnings", { warnings: state.storageNotice.warnings.join("; ") }) })
            ] }),
            state.storage !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-storage-meta", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.storage.current", { path: state.storage.currentDirectory }) }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t("set.storage.assets", { count: state.storage.assetCount, size: (state.storage.assetBytes / 1024 / 1024).toFixed(1) }) }),
              state.storage.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-storage-error", children: state.storage.error })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-storage-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-btn",
                  disabled: state.storage === void 0 || storageBusy,
                  onClick: () => {
                    setStoragePath(state.storage?.defaultDirectory ?? "");
                    setStorageTouched(true);
                  },
                  children: t("set.storage.default")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-btn",
                  disabled: state.storage === void 0 || storageBusy || effectiveStoragePath.length === 0,
                  onClick: () => {
                    setStorageBusy(true);
                    void controller.checkStorage(effectiveStoragePath).finally(() => setStorageBusy(false));
                  },
                  children: t("set.storage.check")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-btn",
                  "data-primary": "true",
                  disabled: !storageDirty || storageBusy,
                  onClick: () => {
                    if (!window.confirm(t("set.storage.confirm", { from: state.storage?.currentDirectory ?? "", to: effectiveStoragePath }))) return;
                    setStorageBusy(true);
                    void controller.migrateStorage(effectiveStoragePath).then((ok) => {
                      if (ok) {
                        setStorageTouched(false);
                        setStoragePath(effectiveStoragePath);
                      }
                    }).finally(() => setStorageBusy(false));
                  },
                  children: storageBusy ? t("set.storage.migrating") : t("set.storage.migrate")
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-atb-modal-body", id: "dsh-atb-settings-panel-external", role: "tabpanel", "aria-labelledby": "dsh-atb-settings-tab-external", hidden: section !== "external", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ExternalSyncPanel, {}) }),
        section === "general" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-atb-modal-foot", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-atb-modal-hint", children: dirty ? t("set.foot.dirty") : t("set.foot.clean") }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "dsh-atb-modal-footbtns", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => controller.closeSettings(), children: t("shared.cancel") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-primary": "true", disabled: !dirty || !scheduleValid || !completedLimitValid, onClick: save, children: t("set.action.save") })
          ] })
        ] })
      ] })
    ] })
  ] }) });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/ImportModal.tsx
var import_react10 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function PlanRow({ row }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-row", title: row.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-imp-row-title", children: row.title }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-imp-row-status", children: row.status })
  ] });
}
function ImportModal({ controller }) {
  const t = useT();
  const [fileName, setFileName] = (0, import_react10.useState)("");
  const [parsed, setParsed] = (0, import_react10.useState)(null);
  const [parseError, setParseError] = (0, import_react10.useState)(void 0);
  const [plan, setPlan] = (0, import_react10.useState)(void 0);
  const [mode, setMode] = (0, import_react10.useState)("merge");
  const [busy, setBusy] = (0, import_react10.useState)(false);
  const [result, setResult] = (0, import_react10.useState)(void 0);
  const [confirmReplace, setConfirmReplace] = (0, import_react10.useState)(false);
  const fileRef = (0, import_react10.useRef)(null);
  const { alert: showAlert, el: alertEl } = useAlert();
  const onFile = (file) => {
    setPlan(void 0);
    setParseError(void 0);
    setResult(void 0);
    setConfirmReplace(false);
    setFileName("");
    setParsed(null);
    if (file === void 0) return;
    void file.text().then((text) => {
      try {
        const value = JSON.parse(text);
        setParsed(value);
        setFileName(file.name);
        void controller.importPreview(value).then((p) => {
          if (p !== void 0) setPlan(p);
        });
      } catch {
        setParseError(t("imp.parseError"));
      }
    });
  };
  const commit = () => {
    if (parsed === null || plan === void 0 || busy) return;
    if (mode === "replace" && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setBusy(true);
    void controller.importCommit(mode, parsed).then((r) => {
      setBusy(false);
      setConfirmReplace(false);
      if (r === void 0) return;
      setResult(r.mode === "replace" ? t("imp.result.replace", { n: r.created + r.overwritten, total: r.replacedTotal ?? 0 }) : t("imp.result.merge", { n: r.created, m: r.overwritten }));
    });
  };
  const close = () => controller.closeImport();
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-modal-backdrop", onClick: (e) => {
    if (e.target === e.currentTarget) close();
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-modal dsh-atb-imp", role: "dialog", "aria-modal": "true", "aria-label": t("imp.aria"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-modal-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-modal-headicon", children: "\u2B06" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-modal-headtext", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: t("imp.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("imp.subtitle") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "dsh-atb-modal-close", "aria-label": t("shared.close"), onClick: close, children: "\u2715" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-modal-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-picker", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "input",
            {
              ref: fileRef,
              type: "file",
              accept: ".json,application/json",
              onChange: (e) => onFile(e.target.files?.[0])
            }
          ),
          fileName.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-imp-filename", children: fileName })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-imp-note", children: t("imp.note") }),
        parseError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-imp-error", children: parseError }),
        plan === void 0 && parseError === void 0 && fileName.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-empty2", children: t("imp.previewing") }),
        plan !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-stats", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-stat", "data-tone": "ok", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: plan.create.length }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("imp.stat.create") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-stat", "data-tone": "warn", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: plan.overwrite.length }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("imp.stat.overwrite") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-stat", "data-tone": plan.invalid.length > 0 ? "bad" : void 0, children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: plan.invalid.length }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("imp.stat.invalid") })
            ] })
          ] }),
          plan.create.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { children: t("imp.sec.create") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-imp-list", children: plan.create.map((r) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(PlanRow, { row: r }, r.id)) })
          ] }),
          plan.overwrite.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { children: t("imp.sec.overwrite") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-imp-list", children: plan.overwrite.map((r) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(PlanRow, { row: r }, r.id)) })
          ] }),
          plan.invalid.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-sec", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { children: t("imp.sec.invalid") }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-imp-list", children: plan.invalid.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-imp-row", "data-tone": "bad", title: r.id ?? "", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-imp-row-title", children: r.id ?? t("imp.noId") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-imp-row-status", children: r.reason })
            ] }, r.id ?? `invalid-${i}`)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-mode-picker", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": mode === "merge", onClick: () => {
              setMode("merge");
              setConfirmReplace(false);
            }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-mode-name", children: t("imp.mode.merge") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-mode-hint", children: t("imp.mode.mergeHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "dsh-atb-mode-opt", "data-on": mode === "replace", onClick: () => setMode("replace"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-mode-name", children: t("imp.mode.replace") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-mode-hint", children: t("imp.mode.replaceHint") })
            ] })
          ] }),
          result !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "dsh-atb-imp-result", children: result })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dsh-atb-modal-foot", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dsh-atb-modal-hint", children: mode === "replace" ? confirmReplace ? t("imp.foot.replaceConfirm") : t("imp.foot.replaceNeedConfirm") : t("imp.foot.mergeHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "dsh-atb-modal-footbtns", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: close, children: result !== void 0 ? t("shared.close") : t("shared.cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-btn",
              "data-primary": "true",
              "data-danger": mode === "replace" && confirmReplace ? "true" : void 0,
              disabled: plan === void 0 || busy,
              onClick: commit,
              children: mode === "replace" && confirmReplace ? t("imp.action.confirmReplace") : t("imp.action.run")
            }
          )
        ] })
      ] })
    ] }),
    alertEl
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TemplateManager.tsx
var import_react11 = require("react");
var import_jsx_runtime10 = require("react/jsx-runtime");
var CATEGORY_POP_MIN_SPACE = 150;
function CategorySuggest({ value, options, placeholder, ariaLabel, onPick, onEnter, onChange }) {
  const [open, setOpen] = (0, import_react11.useState)(false);
  const [up, setUp] = (0, import_react11.useState)(false);
  const wrapRef = (0, import_react11.useRef)(null);
  const openList = () => {
    const wrap = wrapRef.current;
    if (wrap !== null) {
      const bodyRect = wrap.closest(".dsh-atb-modal-body")?.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const below = (bodyRect?.bottom ?? window.innerHeight) - wrapRect.bottom;
      const above = wrapRect.top - (bodyRect?.top ?? 0);
      setUp(below < CATEGORY_POP_MIN_SPACE && above > below);
    }
    setOpen(true);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { ref: wrapRef, className: "dsh-atb-tplm-catwrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      "input",
      {
        className: "dsh-atb-tplm-category",
        value,
        maxLength: 30,
        spellCheck: false,
        placeholder,
        "aria-label": ariaLabel,
        onFocus: openList,
        onBlur: () => setOpen(false),
        onChange: (e) => onChange(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") onEnter();
          if (e.key === "Escape") setOpen(false);
        }
      }
    ),
    open && options.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: up ? "dsh-atb-tplm-catpop dsh-atb-tplm-catpop-up" : "dsh-atb-tplm-catpop", children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      "button",
      {
        type: "button",
        className: "dsh-atb-tplm-catopt",
        onMouseDown: (e) => {
          e.preventDefault();
          onPick(option);
        },
        onClick: () => setOpen(false),
        children: option
      },
      option
    )) })
  ] });
}
function TemplateManager({ controller }) {
  const t = useT();
  const state = controller.getSnapshot();
  const [edits, setEdits] = (0, import_react11.useState)({});
  const [categoryEdits, setCategoryEdits] = (0, import_react11.useState)({});
  const [confirmId, setConfirmId] = (0, import_react11.useState)(void 0);
  const { alert: showAlert, el: alertEl } = useAlert();
  const close = () => controller.closeTemplateManager();
  const nameOf = (tpl) => edits[tpl.id] ?? localizeBuiltinName(tpl);
  const urgencyLabel = (urgency) => {
    if (urgency === void 0) return "";
    const key = URGENCY_KEYS[urgency];
    return key !== void 0 ? ` \xB7 ${t(key)}` : ` \xB7 ${urgency}`;
  };
  const categoryOf = (tpl) => {
    const edit = categoryEdits[tpl.id];
    if (edit === void 0) return templateCategoryOf(tpl);
    const trimmed = edit.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  };
  const dirty = (tpl) => {
    if (nameOf(tpl) !== localizeBuiltinName(tpl)) return true;
    const edit = categoryEdits[tpl.id];
    return edit !== void 0 && edit.trim() !== (templateCategoryOf(tpl) ?? "");
  };
  const save = (tpl, name2) => {
    if (!dirty(tpl) || name2.trim().length === 0) return;
    const category = categoryOf(tpl);
    void controller.upsertTemplate({ id: tpl.id, name: name2, ...category !== void 0 ? { category } : {}, task: tpl.task }).then((ok) => {
      if (ok) {
        setEdits((prev) => {
          const next = { ...prev };
          delete next[tpl.id];
          return next;
        });
        setCategoryEdits((prev) => {
          const next = { ...prev };
          delete next[tpl.id];
          return next;
        });
        showAlert(t("tpl.updated"));
      }
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-modal-backdrop", onClick: (e) => {
    if (e.target === e.currentTarget) close();
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-modal dsh-atb-tplm", role: "dialog", "aria-modal": "true", "aria-label": t("tpl.aria"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-modal-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-atb-modal-headicon", children: "\u2317" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-modal-headtext", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: t("tpl.title") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: t("tpl.subtitle") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "dsh-atb-modal-close", "aria-label": t("shared.close"), onClick: close, children: "\u2715" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-atb-modal-body", children: state.templates.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-atb-empty2", children: t("tpl.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dsh-atb-tplm-list", children: groupTemplatesByCategory(state.templates).map((group) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-tplm-catgroup", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-tplm-cathead", children: [
          "\u258D",
          categoryLabel(group.category, t),
          " (",
          group.templates.length,
          ")"
        ] }),
        group.templates.map((tpl) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-tplm-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "dsh-atb-tplm-name",
              value: nameOf(tpl),
              maxLength: 60,
              spellCheck: false,
              "aria-label": t("tpl.name.aria", { name: localizeBuiltinName(tpl) }),
              onChange: (e) => setEdits((prev) => ({ ...prev, [tpl.id]: e.target.value })),
              onKeyDown: (e) => {
                if (e.key === "Enter") save(tpl, nameOf(tpl));
              }
            }
          ),
          tpl.builtin === true ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-atb-tplm-catstatic", title: t("tpl.builtin"), children: categoryLabel(templateCategoryOf(tpl), t) }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            CategorySuggest,
            {
              value: categoryEdits[tpl.id] ?? (templateCategoryOf(tpl) ?? ""),
              options: templateCategoryOptions(state.templates),
              placeholder: t("tpl.category.placeholder"),
              ariaLabel: t("tpl.category.aria", { name: localizeBuiltinName(tpl) }),
              onPick: (option) => setCategoryEdits((prev) => ({ ...prev, [tpl.id]: option })),
              onChange: (value) => setCategoryEdits((prev) => ({ ...prev, [tpl.id]: value })),
              onEnter: () => save(tpl, nameOf(tpl))
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "span",
            {
              className: "dsh-atb-tplm-meta",
              title: `${tpl.builtin === true ? t("tpl.builtin") : t("tpl.custom")}${tpl.task.checklist !== void 0 && tpl.task.checklist.length > 0 ? t("tpl.meta.checklist", { n: tpl.task.checklist.length }) : ""}${urgencyLabel(tpl.task.urgency)}${tpl.task.permission !== void 0 ? ` \xB7 ${t("shared.permission")}: ${tpl.task.permission}` : ""}`,
              children: [
                tpl.builtin === true ? t("tpl.builtin") : t("tpl.custom"),
                tpl.task.checklist !== void 0 && tpl.task.checklist.length > 0 ? t("tpl.meta.checklist", { n: tpl.task.checklist.length }) : "",
                urgencyLabel(tpl.task.urgency),
                tpl.task.permission !== void 0 && tpl.task.permission !== "workspace-write" ? ` \xB7 ${tpl.task.permission === "read-only" ? t("tpl.meta.permReadOnly") : t("tpl.meta.permFull")}` : ""
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dsh-atb-tplm-btns", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-atb-btn",
                disabled: !dirty(tpl) || nameOf(tpl).trim().length === 0,
                title: t("tpl.rename.title"),
                onClick: () => save(tpl, nameOf(tpl)),
                children: t("tpl.rename.button")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-atb-btn",
                title: t("tpl.use.title"),
                onClick: () => {
                  close();
                  controller.newFromTemplate(localizeBuiltinTask(tpl));
                },
                children: t("tpl.use.button")
              }
            ),
            confirmId === tpl.id ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", onClick: () => {
                void controller.deleteTemplate(tpl.id);
                setConfirmId(void 0);
              }, children: t("shared.confirmDelete") }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => setConfirmId(void 0), children: t("shared.cancel") })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", title: t("tpl.delete.title"), onClick: () => setConfirmId(tpl.id), children: "\u{1F5D1}" })
          ] })
        ] }, tpl.id))
      ] }, group.category ?? "\0")) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dsh-atb-modal-foot", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-atb-modal-hint", children: t("tpl.foot.hint") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dsh-atb-modal-footbtns", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: close, children: t("shared.close") }) })
      ] })
    ] }),
    alertEl
  ] });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board/TaskBoard.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var URGENCY_RANK = { urgent: 0, normal: 1, relaxed: 2 };
function filterTasks(state, tasks) {
  const q = state.search.trim().toLowerCase();
  const filtered = tasks.filter((t) => (state.filters.workspaceId === void 0 || t.workspaceId === state.filters.workspaceId) && (state.filters.urgencies.length === 0 || state.filters.urgencies.includes(t.urgency)) && (q.length === 0 || t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)));
  if (state.sortBy === "default") return filtered;
  const sorted = [...filtered];
  if (state.sortBy === "updated") sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  else if (state.sortBy === "created") sorted.sort((a, b) => b.createdAt - a.createdAt);
  else if (state.sortBy === "urgency") sorted.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.updatedAt - a.updatedAt);
  else if (state.sortBy === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, void 0, { numeric: true }));
  return sorted;
}
function sortDoneTasks(tasks) {
  return [...tasks].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}
function resolveWorkspaceName(workspaceId, workspaces, unassignedLabel) {
  if (!workspaceId) return unassignedLabel;
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (ws?.title && ws.title.trim().length > 0) return ws.title.trim();
  if (ws?.path && ws.path.trim().length > 0) {
    const trimmed = ws.path.trim().replace(/[/\\]+$/, "");
    const base = trimmed.split(/[/\\]/).filter(Boolean).pop();
    return base || trimmed;
  }
  return workspaceId.slice(0, 8);
}
function groupAndSortTasksByWorkspace(tasks, workspaces, unassignedLabel, sortOrder = "name") {
  const map = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const key = task.workspaceId || "";
    let group = map.get(key);
    if (group === void 0) {
      const name2 = resolveWorkspaceName(task.workspaceId, workspaces, unassignedLabel);
      group = {
        workspaceId: task.workspaceId,
        workspaceName: name2,
        tasks: []
      };
      map.set(key, group);
    }
    group.tasks.push(task);
  }
  const list = Array.from(map.values());
  if (sortOrder === "latestTask" || sortOrder === "updated") {
    for (const group of list) {
      group.tasks.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    }
  } else if (sortOrder === "created") {
    for (const group of list) {
      group.tasks.sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
    }
  }
  list.sort((a, b) => {
    if (sortOrder === "latestTask" || sortOrder === "updated") {
      const aTime = a.tasks.length > 0 ? Math.max(...a.tasks.map((t) => t.updatedAt)) : 0;
      const bTime = b.tasks.length > 0 ? Math.max(...b.tasks.map((t) => t.updatedAt)) : 0;
      if (bTime !== aTime) return bTime - aTime;
      if (!a.workspaceId && b.workspaceId) return 1;
      if (a.workspaceId && !b.workspaceId) return -1;
      return a.workspaceName.localeCompare(b.workspaceName, void 0, { numeric: true, sensitivity: "base" });
    }
    if (sortOrder === "created") {
      const aTime = a.tasks.length > 0 ? Math.max(...a.tasks.map((t) => t.createdAt)) : 0;
      const bTime = b.tasks.length > 0 ? Math.max(...b.tasks.map((t) => t.createdAt)) : 0;
      if (bTime !== aTime) return bTime - aTime;
      if (!a.workspaceId && b.workspaceId) return 1;
      if (a.workspaceId && !b.workspaceId) return -1;
      return a.workspaceName.localeCompare(b.workspaceName, void 0, { numeric: true, sensitivity: "base" });
    }
    if (sortOrder === "urgency") {
      const aRank = a.tasks.length > 0 ? Math.min(...a.tasks.map((t) => URGENCY_RANK[t.urgency])) : 999;
      const bRank = b.tasks.length > 0 ? Math.min(...b.tasks.map((t) => URGENCY_RANK[t.urgency])) : 999;
      if (aRank !== bRank) return aRank - bRank;
      const aTime = a.tasks.length > 0 ? Math.max(...a.tasks.map((t) => t.updatedAt)) : 0;
      const bTime = b.tasks.length > 0 ? Math.max(...b.tasks.map((t) => t.updatedAt)) : 0;
      if (bTime !== aTime) return bTime - aTime;
      if (!a.workspaceId && b.workspaceId) return 1;
      if (a.workspaceId && !b.workspaceId) return -1;
      return a.workspaceName.localeCompare(b.workspaceName, void 0, { numeric: true, sensitivity: "base" });
    }
    if (!a.workspaceId && b.workspaceId) return 1;
    if (a.workspaceId && !b.workspaceId) return -1;
    return a.workspaceName.localeCompare(b.workspaceName, void 0, { numeric: true, sensitivity: "base" });
  });
  return list;
}
function TaskBoard({ controller }) {
  const t = useT();
  const state = (0, import_react12.useSyncExternalStore)(
    (cb) => controller.subscribe(cb),
    () => controller.getSnapshot()
  );
  const [now, setNow] = (0, import_react12.useState)(() => Date.now());
  (0, import_react12.useEffect)(() => {
    const timer = setInterval(() => setNow(Date.now()), 6e4);
    return () => clearInterval(timer);
  }, []);
  const [onlyNeedsHuman, setOnlyNeedsHuman] = (0, import_react12.useState)(false);
  const allLive = filterTasks(state, state.ledger.tasks.filter((t2) => t2.trashedAt === void 0));
  const needsHumanCount = allLive.filter((t2) => checkNeedsHuman(t2).needs).length;
  const live = onlyNeedsHuman ? allLive.filter((t2) => checkNeedsHuman(t2).needs) : allLive;
  const selected = state.selectedId === void 0 ? void 0 : state.ledger.tasks.find((t2) => t2.id === state.selectedId);
  const detailPanelRef = (0, import_react12.useRef)(null);
  (0, import_react12.useEffect)(() => {
    if (selected === void 0) return;
    const onPointerDown = (e) => {
      const panel = detailPanelRef.current;
      if (panel === null) return;
      const target = e.target;
      if (target === null) return;
      if (panel.contains(target)) return;
      if (target.closest(".dsh-atb-card")) return;
      if (target.closest(".dsh-atb-modal, .dsh-atb-modal-backdrop, .dsh-atb-newmenu-backdrop, .dsh-atb-newmenu, .dsh-atb-dropdown, .dsh-atb-btn-menu")) return;
      controller.select(void 0);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selected, controller]);
  const { alert: showAlert, el: alertEl } = useAlert();
  const [newMenuOpen, setNewMenuOpen] = (0, import_react12.useState)(false);
  const closeMenu = () => setNewMenuOpen(false);
  const [exportOpen, setExportOpen] = (0, import_react12.useState)(false);
  const closeExport = () => setExportOpen(false);
  const [doneExpanded, setDoneExpanded] = (0, import_react12.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-board", children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h2", { className: "dsh-atb-title", children: t("board.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-count", children: t("board.count.tasks", { n: live.length, rev: state.ledger.revision }) }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-newmenu", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-btn",
            "data-primary": "true",
            onClick: () => {
              const next = !newMenuOpen;
              setNewMenuOpen(next);
              if (next) controller.prepareTemplateMenu();
            },
            children: t("board.action.newTask")
          }
        ),
        newMenuOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-newmenu-backdrop", onClick: closeMenu }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-newmenu-list", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-newmenu-opt", onClick: () => {
              closeMenu();
              controller.setComposer(true);
            }, children: t("board.action.blankTask") }),
            groupTemplatesByCategory(state.templates).map((group) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-newmenu-catgroup", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-newmenu-cat", children: [
                categoryLabel(group.category, t),
                " (",
                group.templates.length,
                ")"
              ] }),
              group.templates.map((tpl) => {
                const name2 = localizeBuiltinName(tpl);
                const spec = localizeBuiltinTask(tpl);
                return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-atb-newmenu-opt",
                    title: spec.description !== void 0 && spec.description.length > 0 ? spec.description.slice(0, 120) : name2,
                    onClick: () => {
                      closeMenu();
                      controller.newFromTemplate(spec);
                    },
                    children: name2
                  },
                  tpl.id
                );
              })
            ] }, group.category ?? "\0")),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-newmenu-sep" }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-newmenu-opt", onClick: () => {
              closeMenu();
              controller.openTemplateManager();
            }, children: t("board.action.manageTemplates") })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "input",
        {
          className: "dsh-atb-input dsh-atb-search",
          value: state.search,
          placeholder: t("board.search.placeholder"),
          spellCheck: false,
          onChange: (e) => controller.setSearch(e.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "select",
        {
          className: "dsh-atb-select",
          value: state.filters.workspaceId ?? "",
          onChange: (e) => controller.setWorkspaceFilter(e.target.value === "" ? void 0 : e.target.value),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "", children: t("board.filter.allProjects") }),
            state.workspaces.map((ws) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: ws.id, children: ws.title || ws.path }, ws.id))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "select",
        {
          className: "dsh-atb-select",
          value: state.sortBy,
          title: t("board.sort.title"),
          onChange: (e) => controller.setSortBy(e.target.value),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "default", children: t("board.sort.default") }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "updated", children: t("board.sort.updated") }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "urgency", children: t("board.sort.urgency") }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "created", children: t("board.sort.created") }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "title", children: t("board.sort.byTitle") })
          ]
        }
      ),
      ["urgent", "normal", "relaxed"].map((u) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "button",
        {
          type: "button",
          className: "dsh-atb-chip",
          "data-urgency": u,
          "data-on": state.filters.urgencies.includes(u),
          onClick: () => controller.toggleUrgency(u),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-dot", "data-urgency": u }),
            t(URGENCY_KEYS[u])
          ]
        },
        u
      )),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "button",
        {
          type: "button",
          className: "dsh-atb-chip",
          "data-kind": "needs-human-filter",
          "data-on": onlyNeedsHuman,
          style: onlyNeedsHuman ? { background: "#f59e0b", color: "#fff", borderColor: "#d97706", fontWeight: 600 } : void 0,
          title: t("board.filter.needsHumanTitle"),
          onClick: () => setOnlyNeedsHuman(!onlyNeedsHuman),
          children: [
            "\u{1F64B} ",
            t("board.filter.needsHuman"),
            " ",
            needsHumanCount > 0 ? `(${needsHumanCount})` : ""
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-btn", onClick: () => controller.toggleSecondary(), children: state.secondaryOpen ? t("board.action.backToBoard") : t("board.action.otherTasks") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-btn", title: t("board.action.settingsTitle"), onClick: () => controller.openSettings(), children: t("board.action.settings") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-btn", title: t("board.action.diagTitle"), onClick: () => controller.openDiagnostics(), children: t("board.action.diag") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-btn", title: t("board.action.importTitle"), onClick: () => controller.openImport(), children: t("board.action.import") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-newmenu", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-btn",
            title: t("board.action.exportTitle"),
            onClick: () => setExportOpen(!exportOpen),
            children: t("board.action.export")
          }
        ),
        exportOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-newmenu-backdrop", onClick: closeExport }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-newmenu-list", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-atb-newmenu-opt",
                title: t("board.export.jsonTitle"),
                onClick: () => {
                  closeExport();
                  controller.exportJson();
                },
                children: t("board.export.json")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-atb-newmenu-opt",
                title: t("board.export.csvTitle"),
                onClick: () => {
                  closeExport();
                  controller.exportCsv();
                },
                children: t("board.export.csv")
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "a",
        {
          className: "dsh-atb-ver",
          href: "https://github.com/cloader/dsh-taskboard",
          target: "_blank",
          rel: "noopener noreferrer",
          children: [
            "V",
            PLUGIN_VERSION
          ]
        }
      )
    ] }),
    state.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-error", children: state.error }),
    state.secondaryOpen ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(SecondaryTab, { controller, tasks: filterTasks(state, state.ledger.tasks) }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-columns", children: MAIN_STATUSES.map((status) => {
      const rawColumnTasks = live.filter((t2) => t2.status === status);
      const isDone = status === "done";
      const columnTasks = isDone && state.sortBy !== "title" ? sortDoneTasks(rawColumnTasks) : rawColumnTasks;
      const doneLimit = completedDisplayLimitOf(state.ledger.settings);
      const isSearching = state.search.trim().length > 0;
      const isFolded = isDone && !isSearching && !doneExpanded && columnTasks.length > doneLimit;
      const visibleTasks = isFolded ? columnTasks.slice(0, doneLimit) : columnTasks;
      const foldedCount = columnTasks.length - visibleTasks.length;
      const groupSortOrder = isDone ? state.sortBy === "title" ? "name" : "latestTask" : state.sortBy === "updated" ? "updated" : state.sortBy === "created" ? "created" : state.sortBy === "urgency" ? "urgency" : "name";
      const workspaceGroups = groupAndSortTasksByWorkspace(
        visibleTasks,
        state.workspaces,
        t("board.workspace.unassigned"),
        groupSortOrder
      );
      if (isDone && state.doneCollapsed) {
        const doneTotalCount = state.doneCount ?? columnTasks.length;
        return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "div",
          {
            className: "dsh-atb-column",
            "data-collapsed": "true",
            onDragOver: (e) => {
              if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                e.currentTarget.dataset.dragover = "true";
              }
            },
            onDragLeave: (e) => {
              delete e.currentTarget.dataset.dragover;
            },
            onDrop: (e) => {
              e.preventDefault();
              delete e.currentTarget.dataset.dragover;
              const id = e.dataTransfer.getData(DRAG_TYPE);
              if (id.length === 0) return;
              const task = state.ledger.tasks.find((t2) => t2.id === id);
              if (task === void 0 || task.status === status) return;
              if (!canTransition(task.status, status)) {
                showAlert(t("board.drag.forbidden", { from: t(COLUMN_KEYS[task.status]), to: t(COLUMN_KEYS[status]) }));
                return;
              }
              void controller.move(id, task.version, status);
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
              "div",
              {
                className: "dsh-atb-col-collapsed-bar",
                title: t("board.column.expandDone"),
                onClick: () => controller.setDoneCollapsed(false),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                    "button",
                    {
                      type: "button",
                      className: "dsh-atb-colfoldbtn",
                      title: t("board.column.expandDone"),
                      onClick: (e) => {
                        e.stopPropagation();
                        controller.setDoneCollapsed(false);
                      },
                      children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { viewBox: "0 0 16 16", width: "12", height: "12", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M6 3.5a.5.5 0 0 1 .854-.354l4 4a.5.5 0 0 1 0 .708l-4 4A.5.5 0 0 1 6 11.5v-8z" }) })
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-col-collapsed-title", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-dot", "data-status": status }),
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-col-collapsed-text", children: t(COLUMN_KEYS[status]) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-colcount", children: doneTotalCount })
                ]
              }
            )
          },
          status
        );
      }
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
        "div",
        {
          className: "dsh-atb-column",
          onDragOver: (e) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              e.currentTarget.dataset.dragover = "true";
            }
          },
          onDragLeave: (e) => {
            delete e.currentTarget.dataset.dragover;
          },
          onDrop: (e) => {
            e.preventDefault();
            delete e.currentTarget.dataset.dragover;
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (id.length === 0) return;
            const task = state.ledger.tasks.find((t2) => t2.id === id);
            if (task === void 0 || task.status === status) return;
            if (!canTransition(task.status, status)) {
              showAlert(t("board.drag.forbidden", { from: t(COLUMN_KEYS[task.status]), to: t(COLUMN_KEYS[status]) }));
              return;
            }
            void controller.move(id, task.version, status);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-colhead", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-dot", "data-status": status }),
              t(COLUMN_KEYS[status]),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-colcount", children: columnTasks.length }),
              status === "in_progress" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-queuechip",
                  title: t("queue.panel.title"),
                  "data-bad": (state.queue?.depth ?? 0) > 0 ? "true" : void 0,
                  onClick: () => controller.openQueuePanel(),
                  children: t("board.queue.chip", { n: state.queue?.depth ?? 0 })
                }
              ),
              isDone && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-colfoldbtn",
                  title: t("board.column.collapseDone"),
                  onClick: () => controller.setDoneCollapsed(true),
                  children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { viewBox: "0 0 16 16", width: "12", height: "12", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M10 3.5a.5.5 0 0 0-.854-.354l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .854-.354v-8z" }) })
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-cards", children: [
              workspaceGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-ws-group", children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-atb-ws-group-head",
                    "aria-expanded": !controller.isWorkspaceGroupCollapsed(status, group.workspaceId),
                    "aria-label": t(controller.isWorkspaceGroupCollapsed(status, group.workspaceId) ? "board.workspace.expand" : "board.workspace.collapse", { name: group.workspaceName }),
                    title: group.workspaceName,
                    onClick: () => controller.toggleWorkspaceGroup(status, group.workspaceId),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { className: "dsh-atb-ws-group-chevron", viewBox: "0 0 16 16", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "m5 3 5 5-5 5" }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-ws-group-icon", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { viewBox: "0 0 16 16", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M1.5 3.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4L8 4.5h5.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8z" }) }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-ws-group-name", children: group.workspaceName }),
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-ws-group-count", children: group.tasks.length })
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-ws-group-cards", hidden: controller.isWorkspaceGroupCollapsed(status, group.workspaceId), children: group.tasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                  TaskCard,
                  {
                    task,
                    controller,
                    draggable: true,
                    now,
                    onAlert: showAlert
                  },
                  task.id
                )) })
              ] }, group.workspaceId ?? "unassigned")),
              columnTasks.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty", children: t("board.empty") }),
              isDone && !isSearching && columnTasks.length > doneLimit && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-done-foldbar", children: !doneExpanded ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-done-foldtip", children: t("board.done.folded", { n: foldedCount }) }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-atb-btn dsh-atb-done-foldbtn",
                    onClick: () => setDoneExpanded(true),
                    children: t("board.done.expandAll")
                  }
                )
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-atb-btn dsh-atb-done-foldbtn",
                  onClick: () => setDoneExpanded(false),
                  children: t("board.done.collapse")
                }
              ) })
            ] })
          ]
        },
        status
      );
    }) }),
    selected !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { ref: detailPanelRef, className: "dsh-atb-detailpanel", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TaskDetail, { task: selected, controller, now }, selected.id) }),
    state.composerOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      TaskFormModal,
      {
        controller,
        task: state.editingId === void 0 ? void 0 : state.ledger.tasks.find((t2) => t2.id === state.editingId)
      }
    ),
    state.diagOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(DiagnosticsPanel, { controller }),
    state.queueOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(QueuePanel, { controller, onAlert: showAlert }),
    state.settingsOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(SettingsModal, { controller }),
    state.importOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ImportModal, { controller }),
    state.tplManagerOpen && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TemplateManager, { controller }),
    alertEl
  ] });
}
function QueuePanel({ controller, onAlert }) {
  const t = useT();
  const state = controller.getSnapshot();
  const queue = state.queue;
  const [armed, setArmed] = (0, import_react12.useState)(false);
  const [busy, setBusy] = (0, import_react12.useState)(false);
  const depth = queue?.depth ?? 0;
  const wait = queue?.oldestWaitMinutes;
  const clear = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    const result = await controller.clearQueue();
    setBusy(false);
    setArmed(false);
    if (result !== void 0) {
      onAlert(t("queue.cleared", { n: result.cleared }));
      controller.closeQueuePanel();
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-modal-backdrop", onClick: (e) => {
    if (e.target === e.currentTarget) controller.closeQueuePanel();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-modal dsh-atb-queuepanel", role: "dialog", "aria-modal": "true", "aria-label": t("queue.panel.title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-modal-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-modal-headicon", children: "\u{1F4CB}" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-modal-headtext", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { children: t("queue.panel.title") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-modal-close", "aria-label": t("shared.close"), onClick: () => controller.closeQueuePanel(), children: "\u2715" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-modal-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-item", "data-bad": depth > 0 ? "true" : void 0, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { children: depth }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("queue.depth") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-item", "data-bad": wait !== void 0 && wait > 5 ? "true" : void 0, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("b", { children: [
            wait ?? 0,
            "m"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("queue.wait") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-queuepanel-actions", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-atb-btn",
          disabled: depth === 0 || busy,
          "data-armed": armed ? "true" : void 0,
          onClick: () => {
            void clear();
          },
          children: armed ? t("queue.confirm") : t("queue.clear")
        }
      ) })
    ] })
  ] }) });
}
function DiagnosticsPanel({ controller }) {
  const t = useT();
  const state = controller.getSnapshot();
  const diag = state.diagnostics;
  const wsName = (id) => {
    const ws = state.workspaces.find((w) => w.id === id);
    return ws?.title ?? ws?.path ?? id.slice(0, 8);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-modal-backdrop", onClick: (e) => {
    if (e.target === e.currentTarget) controller.closeDiagnostics();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-modal dsh-atb-diag", role: "dialog", "aria-modal": "true", "aria-label": t("diag.title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-modal-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-modal-headicon", children: "\u2699" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-modal-headtext", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { children: t("diag.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("diag.subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-modal-close", "aria-label": t("shared.close"), onClick: () => controller.closeDiagnostics(), children: "\u2715" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-modal-body", children: diag === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty2", children: t("shared.loading") }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { children: diag.revision }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("diag.revision") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { children: diag.tasks }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("diag.tasks") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-item", "data-bad": diag.staleRunning > 0 ? "true" : void 0, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { children: diag.staleRunning }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("diag.running") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-item", "data-bad": diag.orphanWorktrees.length > 0 ? "true" : void 0, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { children: diag.orphanWorktrees.length }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("diag.orphans") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h4", { children: t("diag.orphans.heading") }),
        diag.orphanWorktrees.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty2", children: t("diag.orphans.none") }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-diag-orphans", children: diag.orphanWorktrees.map((o) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-orphan", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dsh-atb-diag-orphan-path", title: o.path, children: [
            wsName(o.workspaceId),
            " \xB7 ",
            o.taskId
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "dsh-atb-btn", "data-danger": "true", onClick: () => void controller.cleanupOrphan(o.workspaceId, o.taskId), children: t("diag.orphans.cleanup") })
        ] }, o.path)) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty2", children: t("diag.orphans.hint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-diag-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h4", { children: t("diag.gitignore.heading") }),
        (diag.gitIgnoreSuggestions ?? []).length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty2", children: t("diag.gitignore.none") }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-diag-orphans", children: diag.gitIgnoreSuggestions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-diag-orphan", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dsh-atb-diag-orphan-path", title: s.workspacePath, children: [
          wsName(s.workspaceId),
          " \xB7 ",
          t("diag.gitignore.suggestA"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("code", { children: ".dsh-worktrees/" }),
          t("diag.gitignore.suggestB")
        ] }) }, s.workspaceId)) })
      ] })
    ] }) })
  ] }) });
}
function SecondaryTab({ controller, tasks }) {
  const t = useT();
  const [selecting, setSelecting] = (0, import_react12.useState)("none");
  const [batchBusy, setBatchBusy] = (0, import_react12.useState)(false);
  const [selected, setSelected] = (0, import_react12.useState)(() => /* @__PURE__ */ new Set());
  const trashed = tasks.filter((t2) => t2.trashedAt !== void 0);
  const archived = tasks.filter((t2) => t2.trashedAt === void 0 && t2.status === "archived");
  const canceled = tasks.filter((t2) => t2.trashedAt === void 0 && t2.status === "canceled");
  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (rows) => {
    setSelected((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      const next = new Set(prev);
      for (const r of rows) {
        if (allSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  };
  const runBatch = async (kind) => {
    const source = kind === "trashArchived" ? archived : trashed;
    const targets = source.filter((task) => selected.has(task.id));
    setBatchBusy(true);
    try {
      for (const task of targets) {
        try {
          await controller.remove(task.id, task.version, kind === "purgeTrashed");
        } catch {
        }
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    } finally {
      setBatchBusy(false);
      setSelecting("none");
      setSelected(/* @__PURE__ */ new Set());
    }
  };
  const cancelSelecting = () => {
    setSelecting("none");
    setSelected(/* @__PURE__ */ new Set());
  };
  const groups = [
    { label: t("status.column.canceled"), dot: "canceled", rows: canceled },
    { label: t("status.column.archived"), dot: "archived", rows: archived, action: "trashArchived" },
    { label: t("board.group.trashed"), dot: "trashed", rows: trashed, action: "purgeTrashed" }
  ];
  if (trashed.length + archived.length + canceled.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-secondary", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty", children: t("board.secondary.empty") }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-columns", children: groups.map((group) => {
    const selectingThis = selecting === group.action;
    const selectedCount = selectingThis ? group.rows.filter((r) => selected.has(r.id)).length : 0;
    const allSelected = group.rows.length > 0 && selectedCount === group.rows.length;
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-column", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-colhead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-dot", "data-status": group.dot }),
        group.label,
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-colcount", children: group.rows.length }),
        group.action && group.rows.length > 0 && (selectingThis ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-atb-btn",
              disabled: batchBusy,
              title: t("board.batch.confirmCancelTip"),
              onClick: cancelSelecting,
              children: t("board.batch.cancel")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
            "button",
            {
              type: "button",
              className: "dsh-atb-btn",
              "data-danger": "true",
              disabled: batchBusy || selectedCount === 0,
              title: selectedCount === 0 ? t("board.batch.noneSelected") : t("board.batch.confirmTip"),
              onClick: () => {
                void runBatch(group.action);
              },
              children: [
                t("board.batch.confirm"),
                "(",
                selectedCount,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "input",
            {
              type: "checkbox",
              className: "dsh-atb-selectall",
              checked: allSelected,
              disabled: batchBusy,
              title: t("board.batch.selectAll"),
              onClick: (e) => e.stopPropagation(),
              onChange: () => toggleAll(group.rows)
            }
          )
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-atb-btn",
            disabled: batchBusy,
            title: group.action === "trashArchived" ? t("board.batch.trashArchivedTip") : t("board.batch.purgeTrashedTip"),
            onClick: () => {
              setSelecting(group.action);
              setSelected(/* @__PURE__ */ new Set());
            },
            children: group.action === "trashArchived" ? t("board.batch.trashArchived") : t("board.batch.purgeTrashed")
          }
        ))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-cards", children: [
        (() => {
          const secSortBy = controller.getSnapshot().sortBy;
          const secGroupSortOrder = secSortBy === "updated" ? "updated" : secSortBy === "created" ? "created" : secSortBy === "urgency" ? "urgency" : "name";
          return groupAndSortTasksByWorkspace(
            group.rows,
            controller.getSnapshot().workspaces,
            t("board.workspace.unassigned"),
            secGroupSortOrder
          );
        })().map((wsGroup) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-ws-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
            "button",
            {
              type: "button",
              className: "dsh-atb-ws-group-head",
              "aria-expanded": !controller.isWorkspaceGroupCollapsed(group.dot, wsGroup.workspaceId),
              "aria-label": t(controller.isWorkspaceGroupCollapsed(group.dot, wsGroup.workspaceId) ? "board.workspace.expand" : "board.workspace.collapse", { name: wsGroup.workspaceName }),
              title: wsGroup.workspaceName,
              onClick: () => controller.toggleWorkspaceGroup(group.dot, wsGroup.workspaceId),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { className: "dsh-atb-ws-group-chevron", viewBox: "0 0 16 16", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "m5 3 5 5-5 5" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-ws-group-icon", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { viewBox: "0 0 16 16", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M1.5 3.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4L8 4.5h5.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8z" }) }) }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-ws-group-name", children: wsGroup.workspaceName }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dsh-atb-ws-group-count", children: wsGroup.tasks.length })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-ws-group-cards", hidden: controller.isWorkspaceGroupCollapsed(group.dot, wsGroup.workspaceId), children: wsGroup.tasks.map((task) => group.action && selectingThis ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dsh-atb-selrow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              "input",
              {
                type: "checkbox",
                className: "dsh-atb-selbox",
                checked: selected.has(task.id),
                disabled: batchBusy,
                onClick: (e) => e.stopPropagation(),
                onChange: () => toggleSelected(task.id)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TaskCard, { task, controller })
          ] }, task.id) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TaskCard, { task, controller }, task.id)) })
        ] }, wsGroup.workspaceId ?? "unassigned")),
        group.rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dsh-atb-empty", children: t("board.empty") })
      ] })
    ] }, group.label);
  }) });
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/window-inset.ts
function installWindowInset(view) {
  const update = () => {
    const platform = document.body.getAttribute("data-dsh-desktop-platform") ?? new URLSearchParams(window.location.search).get("dsh-desktop-platform");
    if (platform !== "win32") {
      delete view.dataset.dshAtbWindows;
      view.style.removeProperty("--dsh-atb-viewport-top");
      return;
    }
    view.dataset.dshAtbWindows = "";
    view.style.setProperty("--dsh-atb-viewport-top", `${view.getBoundingClientRect().top}px`);
  };
  let frame;
  const schedule = () => {
    if (frame !== void 0) return;
    frame = requestAnimationFrame(() => {
      frame = void 0;
      update();
    });
  };
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["class", "data-dsh-desktop-platform", "data-dsh-desktop-mode", "data-details-collapsed"]
  });
  mutations.observe(document.documentElement, { attributes: true, attributeFilter: ["data-dsh-atb-active"] });
  const resize = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(schedule);
  resize?.observe(view);
  if (view.parentElement !== null) resize?.observe(view.parentElement);
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    mutations.disconnect();
    resize?.disconnect();
    window.removeEventListener("resize", schedule);
    if (frame !== void 0) cancelAnimationFrame(frame);
    delete view.dataset.dshAtbWindows;
    view.style.removeProperty("--dsh-atb-viewport-top");
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/sidebar-entry.ts
var ENTRY_SELECTOR = "[data-dsh-atb-entry]";
var ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M10 2v12"/></svg>';
function sidebarRoot() {
  const column = document.querySelector(
    '[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopUpstreamSidebar, .dshDesktopSidebarSurface'
  );
  if (column === null) return void 0;
  const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
  return logoOwner ?? column.firstElementChild;
}
function newSessionButton(root) {
  const nested = root.querySelector('button[class*="newSession"]');
  if (nested !== null) return nested;
  for (const child of root.children) {
    if (child instanceof HTMLButtonElement && !child.matches(ENTRY_SELECTOR)) return child;
  }
  const byAria = root.querySelector(
    'button[aria-label="\u65B0\u5EFA\u4F1A\u8BDD"], button[aria-label="New Session"], button[aria-label*="\u65B0\u4F1A\u8BDD"], button[aria-label*="new session" i]'
  );
  if (byAria !== null) return byAria;
  const buttons = Array.from(root.querySelectorAll("button"));
  return buttons.find((button) => !button.matches(ENTRY_SELECTOR) && /新会话|新建会话|new session/i.test(button.textContent ?? ""));
}
function createEntry(controller) {
  const entry = document.createElement("button");
  entry.type = "button";
  entry.dataset.dshAtbEntry = "";
  entry.className = "dsh-atb-entry";
  entry.setAttribute("aria-label", translate("shared.entry.aria"));
  entry.innerHTML = `<span class="dsh-atb-entry-icon">${ICON}</span><span class="dsh-atb-entry-label">${translate("shared.entry.label")}</span><span class="dsh-atb-entry-stats"></span>`;
  entry.addEventListener("click", () => {
    controller.toggleBoard();
  });
  return entry;
}
function entryStats(controller) {
  let todo = 0;
  let inProgress = 0;
  let inReview = 0;
  for (const task of controller.getSnapshot().ledger.tasks) {
    if (task.trashedAt !== void 0) continue;
    if (task.status === "todo") todo++;
    else if (task.status === "in_progress") inProgress++;
    else if (task.status === "in_review") inReview++;
  }
  return [todo, inProgress, inReview];
}
function setRollValue(slot, value) {
  const text = String(value);
  if (slot.dataset.value === text) return;
  const previous = slot.dataset.value;
  slot.dataset.value = text;
  slot.style.minWidth = `${text.length}ch`;
  if (previous === void 0) {
    slot.textContent = text;
    return;
  }
  if (slot.dataset.busy === "1") {
    slot.dataset.busy = "";
    slot.dataset.anim = "";
  }
  const oldEl = document.createElement("span");
  oldEl.className = "dsh-atb-rn";
  oldEl.textContent = previous;
  const newEl = document.createElement("span");
  newEl.className = "dsh-atb-rn dsh-atb-rn-next";
  newEl.textContent = text;
  slot.replaceChildren(oldEl, newEl);
  slot.dataset.dir = value > Number(previous) ? "up" : "down";
  slot.dataset.busy = "1";
  requestAnimationFrame(() => {
    slot.dataset.anim = "1";
  });
  const finish = () => {
    if (slot.dataset.busy !== "1") return;
    slot.dataset.busy = "";
    slot.dataset.anim = "";
    slot.textContent = slot.dataset.value ?? "";
  };
  slot.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 400);
}
function wireStats(entry, controller) {
  const stats = entry.querySelector(".dsh-atb-entry-stats");
  if (stats === null) return () => {
  };
  const statKeys = ["todo", "in_progress", "in_review"];
  const slots = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "dsh-atb-entry-sep";
      sep.textContent = "|";
      stats.append(sep);
    }
    const slot = document.createElement("span");
    slot.className = "dsh-atb-roll";
    slot.dataset.stat = statKeys[i];
    stats.append(slot);
    slots.push(slot);
  }
  const update = () => {
    const [todo, inProgress, inReview] = entryStats(controller);
    setRollValue(slots[0], todo);
    setRollValue(slots[1], inProgress);
    setRollValue(slots[2], inReview);
    stats.title = translate("shared.stats.title", { todo, doing: inProgress, review: inReview });
  };
  return update;
}
function placeEntry(root, entry) {
  const button = newSessionButton(root);
  if (button === void 0) return false;
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]');
    const base = row !== null && row.parentElement === root ? row : button;
    const family = Array.from(root.children).filter(
      (el) => el instanceof HTMLElement && el.matches("[data-dsh-atb-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry]")
    );
    const anchor = family.length > 0 ? family[0] ?? null : base.nextElementSibling ?? null;
    root.insertBefore(entry, anchor);
  }
  return true;
}
function mountSidebarEntry(controller) {
  const entry = createEntry(controller);
  const debug = { attempts: 0, found: false, placed: false };
  const host = globalThis.location?.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    ;
    window.__atbDebug = debug;
  }
  let root;
  let placed = false;
  const tryPlace = () => {
    debug.attempts++;
    if (root !== void 0 && !root.isConnected) {
      rootObserver.disconnect();
      root = void 0;
      placed = false;
    }
    if (placed) {
      if (document.body.contains(entry)) return;
      rootObserver.disconnect();
      root = void 0;
      placed = false;
    }
    root ??= sidebarRoot();
    if (root === void 0) return;
    debug.found = newSessionButton(root) !== void 0;
    placed = placeEntry(root, entry);
    debug.placed = placed;
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true });
    }
  };
  const waitObserver = new MutationObserver(() => {
    tryPlace();
  });
  waitObserver.observe(document.body, { childList: true, subtree: true });
  const rootObserver = new MutationObserver(() => {
    if (root === void 0 || !root.isConnected) {
      placed = false;
      tryPlace();
      return;
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry);
    }
  });
  const retry = setInterval(() => {
    tryPlace();
  }, 2e3);
  const syncStats = wireStats(entry, controller);
  const syncActive = () => {
    if (controller.getSnapshot().boardOpen) entry.dataset.active = "true";
    else delete entry.dataset.active;
    syncStats();
  };
  const unsubscribe = controller.subscribe(syncActive);
  const unsubscribeLocale = localeStore.subscribe(() => {
    entry.setAttribute("aria-label", translate("shared.entry.aria"));
    const label = entry.querySelector(".dsh-atb-entry-label");
    if (label !== null) label.textContent = translate("shared.entry.label");
    syncStats();
  });
  syncActive();
  tryPlace();
  return () => {
    clearInterval(retry);
    waitObserver.disconnect();
    rootObserver.disconnect();
    unsubscribeLocale();
    unsubscribe();
    entry.remove();
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/board-mount.tsx
var import_client = require("react-dom/client");
var import_jsx_runtime12 = require("react/jsx-runtime");
var CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"], .dshDesktopConversationSurface';
var ACTIVE_ATTR = "data-dsh-atb-active";
var OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
var ACTIVATE_EVENT = "dsh-panel-activate";
var PANEL_NAME = "dsh-taskboard";
function conversationColumn() {
  return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
}
function mountBoard(controller) {
  let root;
  let container;
  let disposeWindowInset;
  const ensure = () => {
    if (container !== void 0) return;
    const column = conversationColumn();
    if (column === void 0) return;
    container = document.createElement("div");
    container.dataset.dshAtbView = "";
    container.className = "dsh-atb-view";
    column.appendChild(container);
    disposeWindowInset = installWindowInset(container);
    root = (0, import_client.createRoot)(container);
    root.render(/* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TaskBoard, { controller }));
  };
  const waitObserver = new MutationObserver(() => {
    ensure();
  });
  waitObserver.observe(document.body, { childList: true, subtree: true });
  const applyActive = () => {
    if (controller.getSnapshot().boardOpen) {
      for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
      document.documentElement.setAttribute(ACTIVE_ATTR, "");
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
    }
  };
  const onOtherActivate = (event) => {
    const detail = event.detail;
    if (detail !== PANEL_NAME && controller.getSnapshot().boardOpen) {
      controller.closeBoard();
    }
  };
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';
  const onClickSidebarRow = (event) => {
    if (!controller.getSnapshot().boardOpen) return;
    const target = event.target;
    if (target === null) return;
    if (target.closest(ENTRY_SELECTOR) !== null) return;
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.closeBoard();
  };
  document.addEventListener("click", onClickSidebarRow, true);
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
  const unsubscribe = controller.subscribe(applyActive);
  applyActive();
  ensure();
  return () => {
    document.removeEventListener("click", onClickSidebarRow, true);
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
    waitObserver.disconnect();
    unsubscribe();
    disposeWindowInset?.();
    document.documentElement.removeAttribute(ACTIVE_ATTR);
    root?.unmount();
    container?.remove();
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/official-panel.tsx
var OFFICIAL_PANEL_ID = "dsh-taskboard";
var PANEL_ROW_ORDER = 10;
var PROBE_ROUNDS = 3;
var PROBE_INTERVAL_MS = 350;
function officialSlots(ctx) {
  const slots = ctx.get?.("slots") ?? ctx.slots;
  if (slots === void 0 || typeof slots.register !== "function" || typeof slots.inject !== "function" || typeof slots.spec !== "function") return void 0;
  try {
    if (slots.spec("main") === void 0) return void 0;
    if (slots.spec("sidebar.panellist") === void 0) return void 0;
  } catch {
    return void 0;
  }
  return slots;
}
function makeBoardPage(controller) {
  return function OfficialBoardPage() {
    const ref = React.useCallback((element) => {
      if (element === null) return;
      const key = "__dshAtbInsetDispose";
      const bag = element;
      if (bag[key] !== void 0) return;
      bag[key] = installWindowInset(element);
    }, []);
    return React.createElement(
      "div",
      { "data-dsh-atb-panel-root": "", ref, className: "dsh-atb-panel-root" },
      React.createElement(TaskBoard, { controller })
    );
  };
}
function makePanelIcon(controller) {
  return function OfficialPanelIcon(props) {
    const size = typeof props.size === "number" ? props.size : 16;
    const subscribe = React.useCallback((listener) => controller.subscribe(listener), [controller]);
    const getSnapshot = React.useCallback(() => controller.getSnapshot(), [controller]);
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const counts = React.useMemo(() => {
      let todo = 0;
      let doing = 0;
      let review = 0;
      for (const task of state.ledger.tasks) {
        if (task.trashedAt !== void 0) continue;
        if (task.status === "todo") todo++;
        else if (task.status === "in_progress") doing++;
        else if (task.status === "in_review") review++;
      }
      return { todo, doing, review };
    }, [state.ledger]);
    const [wide, setWide] = React.useState(true);
    const glyphRef = React.useCallback((element) => {
      if (element === null || typeof ResizeObserver === "undefined") return;
      const row = element.closest("button");
      if (row === null) return;
      const observer = new ResizeObserver(() => {
        setWide(row.clientWidth > 44);
      });
      observer.observe(row);
    }, []);
    const title = translate("shared.stats.title", { todo: counts.todo, doing: counts.doing, review: counts.review });
    return React.createElement(
      "span",
      { className: "dsh-atb-pglyph", ref: glyphRef },
      // Icon + corner badge live in their own positioning layer: the badge
      // anchors to the ICON, while the stats strip (below, absolute) anchors
      // to the shell ROW through the stylesheet's :has() rule — the glyph
      // itself stays static so it never becomes the strip's containing block.
      React.createElement(
        "span",
        { className: "dsh-atb-picon" },
        React.createElement(
          "svg",
          {
            width: size,
            height: size,
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": 1.3,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "aria-hidden": true
          },
          React.createElement("rect", { x: 2, y: 2, width: 12, height: 12, rx: 2 }),
          React.createElement("path", { d: "M6 2v12M10 2v12" })
        ),
        !wide && counts.todo > 0 ? React.createElement("span", { className: "dsh-atb-pbadge", title, "aria-hidden": true }, counts.todo) : null
      ),
      // Stats at the ROW's right edge (legacy parity: margin-left:auto in the
      // injected entry), with the legacy | separators.
      wide && (counts.todo > 0 || counts.doing > 0 || counts.review > 0) ? React.createElement(
        "span",
        { className: "dsh-atb-pstats", title, "aria-hidden": true },
        React.createElement("span", { "data-stat": "todo" }, counts.todo),
        React.createElement("span", { className: "dsh-atb-psep" }, "|"),
        React.createElement("span", { "data-stat": "in_progress" }, counts.doing),
        React.createElement("span", { className: "dsh-atb-psep" }, "|"),
        React.createElement("span", { "data-stat": "in_review" }, counts.review)
      ) : null
    );
  };
}
function tryRegister(slots, ctx, controller) {
  const disposers = [];
  try {
    const layout = ctx.get?.("layout") ?? ctx.layout;
    controller.installCloseRequester(() => {
      layout?.selectPanel(null);
    });
    disposers.push(() => {
      controller.installCloseRequester(void 0);
    });
    const page = makeBoardPage(controller);
    disposers.push(slots.inject("main", () => slots.register(
      { name: "main", key: OFFICIAL_PANEL_ID },
      page
    )));
    const icon = makePanelIcon(controller);
    disposers.push(slots.inject("sidebar.panellist", () => slots.register(
      { name: "sidebar.panellist", id: OFFICIAL_PANEL_ID, order: PANEL_ROW_ORDER, label: () => translate("shared.entry.label") },
      icon
    )));
    console.info("[dsh-taskboard] official panel mode: registered", OFFICIAL_PANEL_ID);
  } catch (error) {
    console.error("[dsh-taskboard] official panel registration failed \u2014 falling back to legacy mounting:", error);
    for (const dispose of disposers.splice(0)) dispose();
    return void 0;
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}
function mountBoardCompat(ctx, controller) {
  const slots = officialSlots(ctx);
  if (slots !== void 0) {
    const dispose = tryRegister(slots, ctx, controller);
    if (dispose !== void 0) return dispose;
  }
  let legacyDisposers = [];
  const mountLegacy = () => {
    legacyDisposers = [mountSidebarEntry(controller), mountBoard(controller)];
  };
  mountLegacy();
  let round = 0;
  let upgraded;
  const timer = setInterval(() => {
    round++;
    const probed = officialSlots(ctx);
    if (probed !== void 0) {
      const dispose = tryRegister(probed, ctx, controller);
      if (dispose !== void 0) {
        upgraded = dispose;
        clearInterval(timer);
        for (const d of legacyDisposers.splice(0)) d();
        return;
      }
    }
    if (round >= PROBE_ROUNDS) clearInterval(timer);
  }, PROBE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    for (const d of legacyDisposers.splice(0)) d();
    upgraded?.();
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/session-jump.ts
function createSessionJumper(access) {
  const lookup = (sessions, workspaces, sessionId) => {
    const list = sessions.list.getSnapshot();
    if (list.byId[sessionId] === void 0) return "absent";
    const archived = workspaces?.list.getSnapshot().archivedSessionIds.includes(sessionId) ?? false;
    return archived ? "archived" : "openable";
  };
  const navigate = (sessions, sessionId) => {
    const nav = access.getUiWorkspace?.();
    if (typeof nav?.openSession === "function") {
      nav.openSession(sessionId);
      return true;
    }
    if (typeof sessions.open === "function") {
      sessions.open(sessionId);
      return true;
    }
    return false;
  };
  return async (sessionId) => {
    const sessions = access.getSessions();
    if (sessions === void 0) return "unavailable";
    try {
      let state = lookup(sessions, access.getWorkspaces(), sessionId);
      if (state === "absent") {
        try {
          await sessions.refresh();
        } catch {
        }
        state = lookup(sessions, access.getWorkspaces(), sessionId);
      }
      if (state === "archived") return "archived";
      if (state === "absent") return "missing";
      return navigate(sessions, sessionId) ? "opened" : "unavailable";
    } catch {
      return "unavailable";
    }
  };
}

// ../../.dsh/profiles/desktop/node_modules/dsh-taskboard/src/client/index.ts
var name = "dsh-taskboard/client";
var inject = ["connection"];
function apply(ctx) {
  try {
    injectStyles();
    initI18n(ctx.get?.("locale"), () => ctx.get?.("locale"));
    const client = createClient();
    const controller = new BoardController(client);
    controller.installModelCatalog(async () => {
      try {
        const modelDirs = ctx.get?.("modelDirectories") ?? ctx.modelDirectories;
        if (modelDirs?.catalog?.load !== void 0) {
          const res = await modelDirs.catalog.load();
          if (res?.groups !== void 0 && res.groups.length > 0) {
            const out = [];
            for (const group of res.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...model.description !== void 0 ? { description: model.description } : {},
                  ...model.reasoning !== void 0 ? { reasoning: model.reasoning } : {}
                });
              }
            }
            if (out.length > 0) return out;
          }
        }
      } catch {
      }
      try {
        const remote = ctx.get?.("remote") ?? ctx.remote;
        if (remote?.session?.modelCatalog !== void 0) {
          const res = await remote.session.modelCatalog();
          if (res.ok && res.value?.groups !== void 0 && res.value.groups.length > 0) {
            const out = [];
            for (const group of res.value.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...model.description !== void 0 ? { description: model.description } : {},
                  ...model.reasoning !== void 0 ? { reasoning: model.reasoning } : {}
                });
              }
            }
            if (out.length > 0) return out;
          }
        }
        if (remote?.llm?.models !== void 0) {
          const res = await remote.llm.models({});
          if (res.result.ok && res.result.value?.groups !== void 0 && res.result.value.groups.length > 0) {
            const out = [];
            for (const group of res.result.value.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...model.description !== void 0 ? { description: model.description } : {},
                  ...model.reasoning !== void 0 ? { reasoning: model.reasoning } : {}
                });
              }
            }
            if (out.length > 0) return out;
          }
        }
      } catch {
      }
      try {
        const connection = ctx.get?.("connection") ?? ctx.connection;
        if (connection?.api?.llm?.models !== void 0) {
          const res = await connection.api.llm.models({});
          if (res.result.ok && res.result.value?.groups !== void 0 && res.result.value.groups.length > 0) {
            const out = [];
            for (const group of res.result.value.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...model.description !== void 0 ? { description: model.description } : {},
                  ...model.reasoning !== void 0 ? { reasoning: model.reasoning } : {}
                });
              }
            }
            if (out.length > 0) return out;
          }
        }
      } catch {
      }
      try {
        const res = await client.modelCatalog();
        if (res.models !== void 0 && res.models.length > 0) {
          return res.models;
        }
      } catch {
      }
      return [];
    });
    controller.installPresetRoster(async () => {
      try {
        const remote = ctx.get?.("remote") ?? ctx.remote;
        if (remote?.agentPresets?.list !== void 0) {
          const res = await remote.agentPresets.list();
          const rawPresets = res.ok === true ? res.value.presets : res.result?.ok === true ? res.result.value.presets : void 0;
          if (rawPresets !== void 0 && rawPresets.length > 0) {
            const presets = rawPresets.map((p) => ({ id: p.id, name: p.name }));
            const def = rawPresets.find((p) => p.isDefault);
            return { presets, ...def !== void 0 ? { defaultId: def.id } : {} };
          }
        }
      } catch {
      }
      try {
        const connection = ctx.get?.("connection") ?? ctx.connection;
        if (connection?.api?.agentPresets?.list !== void 0) {
          const res = await connection.api.agentPresets.list({});
          if (res.result.ok && res.result.value?.presets !== void 0 && res.result.value.presets.length > 0) {
            const presets = res.result.value.presets.map((p) => ({ id: p.id, name: p.name }));
            const def = res.result.value.presets.find((p) => p.isDefault);
            return { presets, ...def !== void 0 ? { defaultId: def.id } : {} };
          }
        }
      } catch {
      }
      try {
        const res = await client.modelCatalog();
        if (res.presets !== void 0 && res.presets.length > 0) {
          return { presets: res.presets, ...res.defaultPresetId !== void 0 ? { defaultId: res.defaultPresetId } : {} };
        }
      } catch {
      }
      return { presets: [] };
    });
    controller.installSessionJumper(createSessionJumper({
      getSessions: () => ctx.get?.("sessions"),
      getWorkspaces: () => ctx.get?.("workspaces"),
      getUiWorkspace: () => ctx.get?.("uiWorkspace")
    }));
    controller.installSessionTitles(() => {
      const sessions = ctx.get?.("sessions");
      return sessions?.list.getSnapshot().byId ?? {};
    });
    controller.start();
    const disposers = [];
    try {
      disposers.push(mountBoardCompat(ctx, controller));
    } catch (error) {
      console.error("[dsh-taskboard] mount failed:", error);
    }
    ctx.effect?.(() => () => {
      for (const d of disposers.splice(0)) d();
      controller.dispose();
      disposeI18n();
    }, "dsh-taskboard: client mount");
  } catch (error) {
    console.error("[dsh-taskboard] client half failed to start:", error);
  }
}

    return module.exports;
  }
});
