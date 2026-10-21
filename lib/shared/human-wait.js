//#region src/shared/human-wait.ts
/** Apply the same validated three-state patch for GUI, agent tools and imports. */
function applyHumanWaitingPatch(task, patch) {
	if (patch.waitingForHuman !== void 0) if (patch.waitingForHuman === null) delete task.waitingForHuman;
	else if (typeof patch.waitingForHuman === "boolean") task.waitingForHuman = patch.waitingForHuman;
	else throw new Error("invalid_input: waitingForHuman must be boolean or null (automatic)");
	if (patch.waitingReason !== void 0) if (patch.waitingReason === null) delete task.waitingReason;
	else if (typeof patch.waitingReason !== "string" || patch.waitingReason.trim().length > 500) throw new Error("invalid_input: waitingReason must be a string of at most 500 characters or null");
	else if (patch.waitingReason.trim()) task.waitingReason = patch.waitingReason.trim();
	else delete task.waitingReason;
	if (task.waitingForHuman !== true) delete task.waitingReason;
}
/** Inference is a suggestion only; an explicit false always overrides it. */
function humanWaiting(task) {
	if (task.trashedAt !== void 0 || [
		"done",
		"archived",
		"canceled"
	].includes(task.status)) return { needs: false };
	if (typeof task.waitingForHuman === "boolean") return task.waitingForHuman ? {
		needs: true,
		source: "explicit",
		reason: task.waitingReason,
		reasonKey: "human.reason.manual"
	} : { needs: false };
	const lastExecution = task.executions.at(-1);
	const lastComment = task.comments.at(-1);
	const comment = lastComment !== void 0 && lastComment.createdAt >= (lastExecution?.endedAt ?? 0) ? lastComment.body : "";
	const error = lastExecution?.outcome === "failed" ? lastExecution.error ?? "" : "";
	const text = `${task.title}\n${task.description}\n${task.prompt}\n${comment}\n${error}`;
	const patterns = [
		[/(?:等待|待|请)(?:用户|您|人工|人类)?(?:提供|输入).{0,24}(?:key|凭据|配置|参数|信息)|missing\s+(?:api\s+)?key|please provide\b/i, "human.reason.input"],
		[/(?:等待|待|请)(?:用户|您|人工|人类)(?:操作|扫码|登录)|waiting for (?:the )?user to (?:log in|scan|act)/i, "human.reason.action"],
		[/(?:等待|待)(?:用户|您|人工|人类)?(?:确认|拍板|决策)|请(?:用户|您|人工|人类)(?:确认|拍板)|awaiting (?:user |human )?(?:confirmation|approval)|waiting for (?:user|human) (?:confirmation|approval)/i, "human.reason.decision"]
	];
	for (const sentence of text.split(/[\n。！？.!?;]/)) {
		if (/无需|不需要|无需再|不再|已(?:经)?(?:提供|确认|解决|完成)|no longer|already (?:provided|confirmed|resolved)/i.test(sentence)) continue;
		for (const [pattern, reasonKey] of patterns) if (pattern.test(sentence)) return {
			needs: true,
			source: "inferred",
			reasonKey
		};
	}
	return { needs: false };
}
//#endregion
export { applyHumanWaitingPatch, humanWaiting };

//# sourceMappingURL=human-wait.js.map