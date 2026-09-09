//#region src/host/locale.ts
/**
* Read the active GUI locale as a host-side hint. Absent / malformed settings
* (or no settings service in scope) fall back to `en` and never throw — a
* cosmetic log line must not break route boot.
*/
function activeHostLocale(ctx) {
	try {
		return (ctx.get("settings")?.get?.("locale"))?.preference === "zh" ? "zh" : "en";
	} catch {
		return "en";
	}
}
//#endregion
export { activeHostLocale };

//# sourceMappingURL=locale.js.map