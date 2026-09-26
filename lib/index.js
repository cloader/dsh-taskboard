import { PROTOCOL_SECTION_NAME, TASKBOARD_PROTOCOL } from "./host/protocol-text.js";
import { dispatchIntervalMsOf, maxConcurrentOf, queueMaxAgeMinutesOf, scheduleMissedAfterMinutesOf } from "./shared/protocol.js";
import { createGitFace } from "./host/git.js";
import { createRepoScanner } from "./host/repos.js";
import { dshHomePath } from "./host/sdk.js";
import { ExecutionService } from "./host/execution.js";
import { scheduledSessionResumer } from "./host/scheduled-session.js";
import { AssetStore } from "./host/assets.js";
import { ERR, ToolError, registerTaskboardTools, workspaceFace } from "./host/tools.js";
import { registerTaskboardRoutes } from "./host/routes.js";
import { SchedulerService } from "./host/scheduler.js";
import { TaskStore } from "./host/store.js";
import { TemplateStore } from "./host/templates.js";
import { ExternalSessionSyncService } from "./host/session-sync.js";
import { STORAGE_CONFIG_FILE, StorageCoordinator } from "./host/storage.js";
//#region src/index.ts
/** Ledger file name under the active taskboard data directory. */
const LEDGER_FILE = "dsh-taskboard.json";
/** Task-template side file name under the active data directory. */
const TEMPLATES_FILE = "dsh-taskboard-templates.json";
/** Content-addressed image attachment directory under the active data directory. */
const ASSETS_DIR = "dsh-taskboard-assets";
/** Cordis plugin name. */
const name = "dsh-taskboard";
/** Required host services (tool registry + prompt assembly). */
const inject = ["tools", "systemPrompt"];
/**
* Mount the host half.
* @param ctx - the plugin context (tools + systemPrompt injected).
*/
function apply(ctx) {
	const storage = new StorageCoordinator({
		defaultDirectory: dshHomePath(),
		configFile: dshHomePath(STORAGE_CONFIG_FILE),
		ledgerName: LEDGER_FILE,
		templatesName: TEMPLATES_FILE,
		assetsName: ASSETS_DIR
	});
	const store = new TaskStore({
		file: storage.ledgerPath(),
		queue: storage.queue
	});
	const templates = new TemplateStore(storage.templatesPath(), storage.queue);
	const assets = new AssetStore(storage.assetsPath(), () => Date.now(), storage.queue);
	storage.attach({
		ledger: store,
		templates,
		assets
	});
	const storeReady = storage.ready().then(() => store.load());
	storeReady.then(() => assets.cleanup(JSON.stringify(store.snapshot())));
	const now = () => Date.now();
	const deploymentMaxConcurrent = Math.max(1, Number.parseInt(process.env.DSH_TASKBOARD_MAX_CONCURRENT ?? "", 10) || 3);
	const maxConcurrent = () => maxConcurrentOf(store.snapshot().settings, deploymentMaxConcurrent);
	const skipAfterMs = () => scheduleMissedAfterMinutesOf(store.snapshot().settings) * 6e4;
	const queueMaxAgeMs = () => queueMaxAgeMinutesOf(store.snapshot().settings) * 6e4;
	const dispatchIntervalMs = () => dispatchIntervalMsOf(store.snapshot().settings);
	const disposeSection = ctx.systemPrompt.section({
		name: PROTOCOL_SECTION_NAME,
		order: 180,
		text: TASKBOARD_PROTOCOL
	});
	ctx.effect(() => disposeSection, "dsh-taskboard: protocol section");
	let activeWorkspaces;
	let activeWorkspaceContext;
	const requireWorkspaces = () => {
		if (activeWorkspaces === void 0) throw new ToolError(ERR.notReady, "workspace service is not ready; retry after host startup completes");
		return activeWorkspaces;
	};
	const workspaces = {
		resolveByPath: (path) => requireWorkspaces().resolveByPath(path),
		get: (id) => requireWorkspaces().get(id),
		list: () => requireWorkspaces().list()
	};
	Object.defineProperty(workspaces, "archiveSession", {
		enumerable: true,
		get: () => activeWorkspaces?.archiveSession === void 0 ? void 0 : (sessionId) => requireWorkspaces().archiveSession(sessionId)
	});
	const modelProviders = () => {
		try {
			const llm = activeWorkspaceContext?.get("llm");
			return llm === void 0 || typeof llm.listProviders !== "function" ? void 0 : llm.listProviders().map((p) => p.id);
		} catch {
			return;
		}
	};
	const disposeTools = registerTaskboardTools(ctx, {
		store,
		workspaces,
		now,
		modelProviders,
		ready: async () => {
			if (activeWorkspaces === void 0) throw new ToolError(ERR.notReady, "workspace service is not ready; retry after host startup completes");
			await storeReady;
		}
	});
	ctx.effect(() => () => {
		for (const dispose of disposeTools.splice(0)) dispose();
	}, "dsh-taskboard: tools");
	ctx.inject(["workspaceRegistry"], (wsCtx) => {
		const workspaceDisposers = [];
		activeWorkspaces = workspaceFace(wsCtx.workspaceRegistry);
		activeWorkspaceContext = wsCtx;
		const events = { onSessionEvent: (listener) => wsCtx.on("session/event", (session, event) => {
			listener(session.id, event, session);
		}) };
		let agentSessions;
		const sessionSync = new ExternalSessionSyncService({
			store,
			workspaces: workspaceFace(wsCtx.workspaceRegistry),
			events,
			sessions: {
				get: (id) => {
					try {
						return (agentSessions ?? wsCtx.get("sessions") ?? wsCtx.get("sessionRegistry") ?? wsCtx.root?.get("sessions"))?.get?.(id);
					} catch {
						return;
					}
				},
				list: () => {
					try {
						return (agentSessions ?? wsCtx.get("sessions") ?? wsCtx.get("sessionRegistry") ?? wsCtx.root?.get("sessions"))?.list?.() ?? [];
					} catch {
						return [];
					}
				}
			},
			now
		});
		workspaceDisposers.push(() => sessionSync.dispose());
		const git = createGitFace();
		const scanner = createRepoScanner();
		wsCtx.inject(["agents"], (agentCtx) => {
			const agentDisposers = [];
			agentSessions = agentCtx.get("sessions");
			const execution = new ExecutionService({
				store,
				agents: {
					create: (options) => agentCtx.agents.create(options),
					resumeScheduled: scheduledSessionResumer({
						agents: {
							get: (id) => agentCtx.agents.get(id),
							resume: (options) => agentCtx.agents.resume(options)
						},
						persistence: () => agentCtx.get("sessionPersistence"),
						isArchived: (id) => wsCtx.workspaceRegistry.archivedSessionIds.includes(id)
					})
				},
				liveAgent: (sessionId) => agentCtx.agents.get(sessionId),
				workspaces: {
					get: (id) => workspaceFace(wsCtx.workspaceRegistry).get(id),
					attach: async (workspaceId, sessionId) => {
						const ws = wsCtx.workspaceRegistry.get(workspaceId);
						if (ws !== void 0) await ws.attachSession(sessionId);
					}
				},
				events,
				now,
				git,
				scanner,
				composeAgent: async (presetId) => {
					const presets = agentCtx.get("agentPresets");
					if (presets === void 0) return void 0;
					const resolved = await presets.resolve(presetId);
					return {
						agentPreset: resolved.id,
						setup: async (ctx) => {
							await presets.mount(ctx, resolved.id);
						}
					};
				},
				renameSession: (sessionId, title) => {
					try {
						const sessions = agentCtx.get("sessions");
						const sessionTitle = agentCtx.get("sessionTitle");
						const session = sessions?.get(sessionId);
						if (session !== void 0 && sessionTitle !== void 0) sessionTitle.rename(session, title);
					} catch {}
				},
				defaultModel: () => {
					try {
						const selection = agentCtx.get("agentDefaultModel");
						const read = selection?.currentSelection;
						return read === void 0 ? void 0 : read.call(selection);
					} catch {
						return;
					}
				},
				setPermission: (sessionId, permission) => {
					try {
						const permService = agentCtx.get("permissionPresets");
						const session = agentCtx.get("sessions")?.get(sessionId);
						if (session !== void 0 && permService !== void 0) permService.set(session, permission);
					} catch {}
				},
				maxConcurrent
			});
			const scheduler = new SchedulerService({
				store,
				execution,
				now,
				maxConcurrent,
				skipAfterMs,
				queueMaxAgeMs,
				dispatchIntervalMs
			});
			scheduler.start();
			agentDisposers.push(() => scheduler.dispose());
			let disposeRoutes;
			agentCtx.inject(["webServer"], (webCtx) => {
				disposeRoutes = registerTaskboardRoutes(webCtx, {
					store,
					workspaces: workspaceFace(wsCtx.workspaceRegistry),
					now,
					maxConcurrent,
					clearQueue: () => scheduler.clearQueue(),
					run: (taskId, runOptions) => execution.run(taskId, "manual", runOptions),
					cancel: (taskId) => execution.cancel(taskId),
					modelProviders,
					git,
					scanner,
					templates,
					assets,
					storage,
					ready: async () => {
						await storeReady;
					},
					promptCompletions: async () => {
						try {
							const skillsService = agentCtx.get("skills");
							const commandsService = agentCtx.get("commands");
							const rawSkills = skillsService?.list ? await skillsService.list().catch(() => []) : [];
							const rawCommands = commandsService?.list ? commandsService.list() : [];
							return {
								skills: Array.isArray(rawSkills) ? rawSkills.map((s) => ({
									name: s.name,
									description: s.description
								})) : [],
								commands: Array.isArray(rawCommands) ? rawCommands.map((c) => ({
									name: c.name,
									description: c.description,
									hint: c.input?.hint
								})) : []
							};
						} catch {
							return {
								skills: [],
								commands: []
							};
						}
					},
					modelCatalog: async () => {
						try {
							const models = [];
							const llm = agentCtx.get("llm") ?? wsCtx.get("llm");
							if (llm?.listProviders !== void 0 && llm.listModels !== void 0) {
								const providers = llm.listProviders();
								for (const p of providers) try {
									const list = await llm.listModels(p.id);
									for (const m of list) {
										let reasoning;
										try {
											const meta = llm.resolveModelInfo !== void 0 ? await llm.resolveModelInfo(p.id, m.id) : llm.resolveModel !== void 0 ? await llm.resolveModel(p.id, m.id) : void 0;
											if (meta?.reasoning !== void 0) reasoning = meta.reasoning;
										} catch {}
										models.push({
											provider: p.id,
											model: m.id,
											name: m.name,
											...m.description ? { description: m.description } : {},
											...reasoning !== void 0 ? { reasoning } : {}
										});
									}
								} catch {}
							}
							const presetsService = agentCtx.get("agentPresets");
							const presets = [];
							let defaultPresetId;
							if (presetsService?.list !== void 0) try {
								const raw = await presetsService.list();
								const list = raw.ok === true ? raw.value.presets : Array.isArray(raw) ? raw : [];
								for (const p of list) {
									presets.push({
										id: p.id,
										name: p.name
									});
									if (p.isDefault) defaultPresetId = p.id;
								}
							} catch {}
							return {
								models,
								presets,
								...defaultPresetId !== void 0 ? { defaultPresetId } : {}
							};
						} catch {
							return {
								models: [],
								presets: []
							};
						}
					}
				});
				return () => disposeRoutes?.();
			});
			execution.reconcile();
			agentDisposers.push(() => execution.dispose());
			return () => {
				disposeRoutes?.();
				agentSessions = void 0;
				for (const dispose of agentDisposers.splice(0)) dispose();
			};
		});
		return () => {
			if (activeWorkspaceContext === wsCtx) {
				activeWorkspaceContext = void 0;
				activeWorkspaces = void 0;
			}
			for (const dispose of workspaceDisposers.splice(0)) dispose();
		};
	});
}
//#endregion
export { ASSETS_DIR, LEDGER_FILE, TEMPLATES_FILE, apply, inject, name };

//# sourceMappingURL=index.js.map