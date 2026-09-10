import type { SessionArchiveResult } from '../shared/api.ts'
import { taskAssociatedSessionIds, type TaskRecord } from '../shared/protocol.ts'

/** Idempotent best-effort archiving with explicit per-session outcomes. */
export async function archiveTaskSessions(task: TaskRecord, archive?: (id: string) => Promise<void>): Promise<SessionArchiveResult> {
  const sessionIds = taskAssociatedSessionIds(task)
  if (archive === undefined) return { archived: [], failed: [], unsupported: sessionIds }
  const result: SessionArchiveResult = { archived: [], failed: [], unsupported: [] }
  for (const sessionId of sessionIds) {
    try {
      await archive(sessionId)
      result.archived.push(sessionId)
    } catch (error) {
      result.failed.push({ sessionId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
