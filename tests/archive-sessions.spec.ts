import { describe, expect, it, vi } from 'vitest'
import { archiveTaskSessions } from '../src/host/archive-sessions.ts'
import { workspaceFace } from '../src/host/tools.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'

const task = {
  createdBy: { kind: 'agent', sessionId: 'session-planner' }, claimedBy: 'session-holder',
  executions: [{ sessionId: 'session-one' }, { sessionId: 'session-two' }, { sessionId: 'session-one' }],
} as TaskRecord

describe('execution session archiving', () => {
  it('deduplicates execution sessions, reports partial failure, and retries idempotently', async () => {
    const archived = new Set<string>()
    let fail = true
    const archive = vi.fn(async (id: string) => {
      if (id === 'session-two' && fail) throw new Error('disk failure')
      archived.add(id)
    })
    expect(await archiveTaskSessions(task, archive)).toEqual({ archived: ['session-one'], failed: [{ sessionId: 'session-two', error: 'disk failure' }], unsupported: [] })
    expect(archive.mock.calls.map(([id]) => id)).toEqual(['session-one', 'session-two'])
    fail = false
    expect(await archiveTaskSessions(task, archive)).toEqual({ archived: ['session-one', 'session-two'], failed: [], unsupported: [] })
    expect([...archived]).toEqual(['session-one', 'session-two'])
  })

  it('reports unsupported hosts and exposes capability absence accurately', async () => {
    const face = workspaceFace({ list: () => [] } as never)
    expect(face.archiveSession).toBeUndefined()
    expect(await archiveTaskSessions(task, face.archiveSession)).toEqual({ archived: [], failed: [], unsupported: ['session-one', 'session-two'] })
  })

  it('preserves the registry receiver and propagates its failure', async () => {
    const registry = { value: 'registry', archiveSession: async function () { throw new Error(this.value) } }
    const face = workspaceFace(registry as never)
    await expect(face.archiveSession!('session-one')).rejects.toThrow('registry')
  })
})
