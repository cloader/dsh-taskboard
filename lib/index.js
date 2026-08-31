import { PROTOCOL_SECTION_NAME, TASKBOARD_PROTOCOL } from "./host/protocol-text.js";
import { createGitFace } from "./host/git.js";
import { dshHomePath } from "./host/sdk.js";
import { ExecutionService } from "./host/execution.js";
import { registerTaskboardTools, workspaceFace } from "./host/tools.js";
import { registerTaskboardRoutes } from "./host/routes.js";
import { SchedulerService } from "./host/scheduler.js";
import { TaskStore } from "./host/store.js";
import { TemplateStore } from "./host/templates.js";
import { ExternalSessionSyncService } from "./host/session-sync.js";
//#region src/index.ts
/** Ledger file name under the DSH home. */
const LEDGER_FILE = "dsh-taskboard.json";
/** Task-template side file name under the DSH home (0.4.0). */
const TEMPLATES_FILE = "dsh-taskboard-templates.json";
/** Cordis plugin name. */
const name = "dsh-taskboard";
/** Required host services (tool registry + prompt assembly). */
const inject = ["tools", "systemPrompt"];
/**
* Mount the host half.
* @param ctx - the plugin context (tools + systemPrompt injected).
*/
function apply(ctx) {
	const store = new TaskStore({ file: dshHomePath(LEDGER_FILE) });
	const templates = new TemplateStore(dshHomePath(TEMPLATES_FILE));
	store.load();
	const now = () => Date.now();
	const maxConcurrent = Math.max(1, Number.parseInt(process.env.DSH_TASKBOARD_MAX_CONCURRENT ?? "", 10) || 3);
	const disposeSection = ctx.systemPrompt.section({
		name: PROTOCOL_SECTION_NAME,
		order: 180,
		text: TASKBOARD_PROTOCOL
	});
	ctx.effect(() => disposeSection, "dsh-taskboard: protocol section");
	ctx.inject(["workspaceRegistry"], (wsCtx) => {
		const disposers = [];
		const modelProviders = () => {
			try {
				const llm = wsCtx.get("llm");
				return llm === void 0 || typeof llm.listProviders !== "function" ? void 0 : llm.listProviders().map((p) => p.id);
			} catch {
				return;
			}
		};
		disposers.push(...registerTaskboardTools(wsCtx, {
			store,
			workspaces: workspaceFace(wsCtx.workspaceRegistry),
			now,
			modelProviders
		}));
		const events = { onSessionEvent: (listener) => wsCtx.on("session/event", (session, event) => {
			listener(session.id, event, session);
		}) };
		const sessionSync = new ExternalSessionSyncService({
			store,
			workspaces: workspaceFace(wsCtx.workspaceRegistry),
			events,
			now
		});
		disposers.push(() => sessionSync.dispose());
		const git = createGitFace();
		wsCtx.inject(["agents"], (agentCtx) => {
			const execution = new ExecutionService({
				store,
				agents: { create: (options) => agentCtx.agents.create(options) },
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
			let disposeRoutes;
			agentCtx.inject(["webServer"], (webCtx) => {
				disposeRoutes = registerTaskboardRoutes(webCtx, {
					store,
					workspaces: workspaceFace(wsCtx.workspaceRegistry),
					now,
					run: (taskId, runOptions) => execution.run(taskId, "manual", runOptions),
					cancel: (taskId) => execution.cancel(taskId),
					modelProviders,
					git,
					templates,
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
			const scheduler = new SchedulerService({
				store,
				execution,
				now,
				maxConcurrent
			});
			scheduler.start();
			disposers.push(() => scheduler.dispose());
			disposers.push(() => execution.dispose());
			return () => {
				disposeRoutes?.();
				for (const dispose of disposers.splice(0)) dispose();
			};
		});
		return () => {
			for (const dispose of disposers.splice(0)) dispose();
		};
	});
}
//#endregion
export { LEDGER_FILE, TEMPLATES_FILE, apply, inject, name };

//# sourceMappingURL=index.js.map