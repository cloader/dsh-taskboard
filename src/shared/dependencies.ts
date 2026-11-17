import { normalizeBlockedBy, type BoardSettings, type TaskLedger, type TaskRecord } from './protocol.ts'

export type DependencyGate = 'agent' | 'manual' | 'scheduled' | 'review'
export function gateEnabled(settings: BoardSettings | undefined, gate: DependencyGate): boolean {
  return settings?.dependencyGates?.[gate] ?? true
}
export function dependencyState(tasks: readonly TaskRecord[], task: TaskRecord) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  return (task.blockedBy ?? []).map(id => {
    const prerequisite = byId.get(id)
    const satisfied = prerequisite !== undefined && prerequisite.workspaceId === task.workspaceId && prerequisite.trashedAt === undefined
      && (prerequisite.status === 'in_review' || prerequisite.status === 'done')
    return { id, title: prerequisite?.title ?? id, status: prerequisite?.status ?? 'missing', satisfied }
  })
}
export function dependencyError(tasks: readonly TaskRecord[], task: TaskRecord): string | undefined {
  const waiting = dependencyState(tasks, task).filter(d => !d.satisfied)
  return waiting.length ? `dependency_blocked: ${waiting.map(d => `${d.title} (${d.id}, ${d.status})`).join(', ')}` : undefined
}
export function validateDependencies(tasks: readonly TaskRecord[], task: TaskRecord, raw: unknown = task.blockedBy ?? []): string[] {
  const ids = normalizeBlockedBy(raw)
  const byId = new Map(tasks.map(t => [t.id, t]))
  byId.set(task.id, { ...task, blockedBy: ids })
  for (const id of ids) {
    const prior = byId.get(id)
    if (id === task.id) throw new Error('dependency cannot reference itself')
    if (!prior || prior.trashedAt !== undefined) throw new Error(`dependency not found: ${id}`)
    if (prior.workspaceId !== task.workspaceId) throw new Error(`dependency must belong to the same project: ${id}`)
    const pending = [id]
    const seen = new Set<string>()
    while (pending.length) {
      const current = pending.pop()!
      if (current === task.id) throw new Error(`dependency cycle involving ${id}`)
      if (seen.has(current)) continue
      seen.add(current)
      pending.push(...(byId.get(current)?.blockedBy ?? []))
    }
  }
  return ids
}
export function referencingTasks(tasks: readonly TaskRecord[], id: string): TaskRecord[] {
  return tasks.filter(t => t.id !== id && (t.blockedBy ?? []).includes(id))
}
export function assertNotReferenced(ledger: TaskLedger, id: string): void {
  const refs = referencingTasks(ledger.tasks, id)
  if (refs.length) throw new Error(`task is referenced by: ${refs.map(t => `${t.title} (${t.id})`).join(', ')}`)
}
