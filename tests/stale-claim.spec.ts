import { describe, expect, it } from 'vitest'
import { isStaleClaim, STALE_CLAIM_MS } from '../src/client/board/format.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-stale', title: 'stale badge', description: '', prompt: '', workspaceId: 'project',
    urgency: 'normal', status: 'in_progress', blocked: false, isolation: 'none', execution: { mode: 'claim' },
    version: 1, createdAt: 0, updatedAt: 0, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    claimedBy: 'session-live', claimedAt: 0, comments: [],
    executions: [{ id: 'e-live', sessionId: 'session-live', trigger: 'manual', startedAt: 0, outcome: 'running' }],
    ...overrides,
  }
}

describe('isStaleClaim', () => {
  it('uses recent execution activity instead of the original claim time', () => {
    const now = STALE_CLAIM_MS + 10_000
    const current = task({ executions: [{ id: 'e-live', sessionId: 'session-live', trigger: 'manual', startedAt: 0, lastActivityAt: now - 1_000, outcome: 'running' }] })
    expect(isStaleClaim(current, now)).toBe(false)
  })

  it('does not flag a claim with no live execution', () => {
    const noLongerRunning = task({ executions: [{ id: 'e-ended', sessionId: 'session-live', trigger: 'manual', startedAt: 0, endedAt: 1, outcome: 'succeeded' }] })
    expect(isStaleClaim(noLongerRunning, STALE_CLAIM_MS + 1)).toBe(false)
  })

  it('falls back to claim age only for legacy running records without activity', () => {
    expect(isStaleClaim(task(), STALE_CLAIM_MS + 1)).toBe(true)
  })
})
