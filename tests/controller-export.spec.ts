// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import type { StateResponse } from '../src/shared/api.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

function task(id: string, status: TaskRecord['status']): TaskRecord {
  return { id, title: id, status, description: '', prompt: '', workspaceId: 'ws-a', urgency: 'normal', blocked: false,
    execution: { mode: 'claim' }, version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'user' }, updatedBy: { kind: 'user' }, comments: [], executions: [] }
}

function fixture() {
  const ledger: StateResponse = { schemaVersion: 1, revision: 7,
    tasks: [task('t-todo', 'todo'), task('t-done', 'done'), task('t-archive', 'archived')],
    settings: { completedDisplayLimit: 10 }, doneCount: 1 }
  const state = vi.fn(async (options?: { excludeDone?: boolean }) => structuredClone({ ...ledger,
    tasks: options?.excludeDone ? ledger.tasks.filter(t => t.status !== 'done') : ledger.tasks }))
  const controller = new BoardController({ state, workspaces: async () => [] } as never)
  const download = vi.spyOn(controller as unknown as { download(name: string, body: string, type: string): void }, 'download').mockImplementation(() => {})
  return { controller, state, ledger, download }
}

it.each(['json', 'csv'] as const)('%s export includes completed tasks while keeping the board collapsed', async format => {
  const f = fixture()
  try {
    f.controller.setDoneCollapsed(true)
    await f.controller.refresh()
    expect(f.controller.getSnapshot().ledger.tasks.map(t => t.id)).toEqual(['t-todo', 't-archive'])
    // An export must also pick up host changes made after the last render.
    f.ledger.tasks.push(task('t-new', 'todo'))
    if (format === 'json') await f.controller.exportJson()
    else await f.controller.exportCsv()
    expect(f.state).toHaveBeenLastCalledWith({ excludeDone: false })
    expect(f.download).toHaveBeenCalledOnce()
    const body = f.download.mock.calls[0]![1]
    for (const id of ['t-todo', 't-done', 't-archive', 't-new']) expect(body).toContain(id)
    if (format === 'json') expect(JSON.parse(body).settings).toEqual(f.ledger.settings)
    expect(f.controller.getSnapshot().doneCollapsed).toBe(true)
    expect(f.controller.getSnapshot().ledger.tasks).toHaveLength(2)
  } finally { f.controller.dispose() }
})

it.each(['json', 'csv'] as const)('%s export reports a failed full fetch instead of downloading a partial backup', async format => {
  const f = fixture()
  try {
    await f.controller.refresh()
    f.state.mockRejectedValueOnce(new Error('storage unavailable'))
    if (format === 'json') await f.controller.exportJson()
    else await f.controller.exportCsv()
    expect(f.download).not.toHaveBeenCalled()
    expect(f.controller.getSnapshot().error).toContain('storage unavailable')
  } finally { f.controller.dispose() }
})
