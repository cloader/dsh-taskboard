import { taskAssociatedSessionIds } from "../shared/protocol.js";
//#region src/host/archive-sessions.ts
/** Idempotent best-effort archiving with explicit per-session outcomes. */
async function archiveTaskSessions(task, archive) {
	const sessionIds = taskAssociatedSessionIds(task);
	if (archive === void 0) return {
		archived: [],
		failed: [],
		unsupported: sessionIds
	};
	const result = {
		archived: [],
		failed: [],
		unsupported: []
	};
	for (const sessionId of sessionIds) try {
		await archive(sessionId);
		result.archived.push(sessionId);
	} catch (error) {
		result.failed.push({
			sessionId,
			error: error instanceof Error ? error.message : String(error)
		});
	}
	return result;
}
//#endregion
export { archiveTaskSessions };

//# sourceMappingURL=archive-sessions.js.map