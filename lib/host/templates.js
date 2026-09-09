import { BUILTIN_TEMPLATE_CONTENT, BUILTIN_TEMPLATE_IDS } from "../shared/builtin-templates.js";
import { readFile } from "node:fs/promises";
//#region src/host/templates.ts
/**
* Host-side task-template store (0.4.0): one JSON side file next to the
* ledger, seeded with the built-in templates on first load, mutated through
* the same atomic persist discipline as the ledger.
*
* Pure data, no Cordis deps — the routes layer owns it and tests drive it
* directly against a temp dir.
*
* @module dsh-taskboard/host/templates
*/
/**
* The built-in templates seeded when the side file does not exist yet.
* Seeded from the shared zh content (the side file is plain data; the client
* resolves the active locale at render time — see shared/builtin-templates.ts).
*/
const BUILTIN_TEMPLATES = BUILTIN_TEMPLATE_IDS.map((id) => ({
	id,
	name: BUILTIN_TEMPLATE_CONTENT.zh[id].name,
	task: BUILTIN_TEMPLATE_CONTENT.zh[id].task
}));
/** Mint a template id. */
function newTemplateId() {
	return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
/**
* The template store. NOT thread-synchronized like the ledger (template
* writes are rare, human-paced GUI operations; last-write-wins is fine).
*/
var TemplateStore = class {
	file;
	templates;
	loaded = false;
	/** @param file - absolute side-file path (next to the ledger). */
	constructor(file) {
		this.file = file;
	}
	/** Load once; a missing file seeds the built-ins; a corrupt file resets. */
	async ensure() {
		if (this.loaded) return;
		let parsed;
		try {
			const raw = await readFile(this.file, "utf8");
			const value = JSON.parse(raw);
			if (Array.isArray(value.templates)) parsed = value.templates.filter((t) => typeof t === "object" && t !== null && typeof t.id === "string" && typeof t.name === "string" && typeof t.task === "object");
		} catch {}
		if (parsed === void 0) {
			const now = Date.now();
			parsed = BUILTIN_TEMPLATES.map((t, i) => ({
				...t,
				task: { ...t.task },
				builtin: true,
				createdAt: now,
				updatedAt: now + i
			}));
			try {
				await this.persist(parsed);
			} catch {}
		}
		this.templates = parsed;
		this.loaded = true;
	}
	/** Atomic persist (temp + fsync + rename — S10, same discipline as the ledger). */
	async persist(templates) {
		const { mkdir, open, rename } = await import("node:fs/promises");
		const { dirname, join } = await import("node:path");
		await mkdir(dirname(this.file), { recursive: true });
		const temp = join(dirname(this.file), `.${Math.random().toString(36).slice(2)}.tmp`);
		const fh = await open(temp, "w");
		try {
			await fh.writeFile(JSON.stringify({ templates }, null, 2), "utf8");
			await fh.sync();
		} finally {
			await fh.close();
		}
		await rename(temp, this.file);
	}
	/** All templates (oldest first). */
	async list() {
		await this.ensure();
		return (this.templates ?? []).slice();
	}
	/**
	* Create or replace a template by id (a body without id creates).
	* @returns the stored template.
	*/
	async upsert(input) {
		await this.ensure();
		const templates = this.templates ?? [];
		const name = input.name.trim();
		if (name.length === 0 || name.length > 60) throw new Error("模板名必须 1..60 字符");
		const now = Date.now();
		const existing = input.id !== void 0 ? templates.find((t) => t.id === input.id) : void 0;
		if (existing?.builtin === true) throw new Error("内置模板不可覆盖；可删除后另建，或以新名称存为新模板");
		const stored = existing !== void 0 ? {
			...existing,
			name,
			task: input.task,
			updatedAt: now
		} : {
			id: input.id ?? newTemplateId(),
			name,
			task: input.task,
			createdAt: now,
			updatedAt: now
		};
		const index = existing !== void 0 ? templates.indexOf(existing) : -1;
		if (index >= 0) templates[index] = stored;
		else templates.push(stored);
		await this.persist(templates);
		return stored;
	}
	/** Delete a template by id; returns whether it existed. */
	async remove(id) {
		await this.ensure();
		const templates = this.templates ?? [];
		const index = templates.findIndex((t) => t.id === id);
		if (index < 0) return false;
		templates.splice(index, 1);
		await this.persist(templates);
		return true;
	}
};
//#endregion
export { BUILTIN_TEMPLATES, TemplateStore };

//# sourceMappingURL=templates.js.map