/**
 * Client-side localization of built-in task templates (0.6.4). Built-in
 * templates are seeded host-side with zh fallback text; this module resolves
 * the ACTIVE locale's content (name + task spec) so the new-task dropdown,
 * the template manager, and the create-form prefill follow the GUI language
 * live. Custom templates (no `builtin` flag) and unknown built-in ids pass
 * through untouched.
 *
 * @module dsh-taskboard/client/i18n/templates
 */
import type { TaskTemplate, TaskTemplateSpec } from '../../shared/api.ts'
import { builtinTemplateContent } from '../../shared/builtin-templates.ts'
import { localeStore } from './runtime.ts'

/** The localized display name for a template (stored name for custom ones). */
export function localizeBuiltinName(tpl: Pick<TaskTemplate, 'id' | 'name' | 'builtin'>): string {
  if (tpl.builtin !== true) return tpl.name
  return builtinTemplateContent(tpl.id, localeStore.getSnapshot().active)?.name ?? tpl.name
}

/** The localized task spec for a template (stored spec for custom ones). */
export function localizeBuiltinTask(tpl: Pick<TaskTemplate, 'id' | 'task' | 'builtin'>): TaskTemplateSpec {
  if (tpl.builtin !== true) return tpl.task
  return builtinTemplateContent(tpl.id, localeStore.getSnapshot().active)?.task ?? tpl.task
}
