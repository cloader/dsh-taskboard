import { describe, expect, it } from 'vitest'
import { applyHumanWaitingPatch, humanWaiting } from '../src/shared/human-wait.ts'
import { summarize, validateImportedTask, type TaskRecord } from '../src/shared/protocol.ts'

function task(extra: Partial<TaskRecord> = {}): TaskRecord {
  return { id: 't-human', title: 'Ordinary task', description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status: 'todo', blocked: true, execution: { mode: 'claim' }, version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' }, comments: [], executions: [], ...extra }
}

describe('human waiting semantics', () => {
  it('marks, clears and restores automatic recognition independently of blocking', () => {
    const t = task({ title: '等待用户确认部署方案' })
    expect(humanWaiting(t)).toMatchObject({ needs: true, source: 'inferred' })
    applyHumanWaitingPatch(t, { waitingForHuman: true, waitingReason: '  请确认目标环境  ' })
    expect(humanWaiting(t)).toMatchObject({ needs: true, source: 'explicit', reason: '请确认目标环境' })
    applyHumanWaitingPatch(t, { waitingForHuman: false })
    expect(humanWaiting(t).needs).toBe(false)
    expect(t.waitingReason).toBeUndefined()
    expect(t.blocked).toBe(true)
    applyHumanWaitingPatch(t, { waitingForHuman: null })
    expect(humanWaiting(t).source).toBe('inferred')
  })

  it.each(['修复登录页样式', '验证码模块已完成', '无需人工处理', '已确认部署方案，无需等待用户确认', 'No longer waiting for user approval'])('does not flag business or resolved wording: %s', title => {
    expect(humanWaiting(task({ title })).needs).toBe(false)
  })

  it.each(['done', 'archived', 'canceled'] as const)('excludes %s even with an explicit flag', status => {
    expect(humanWaiting(task({ status, waitingForHuman: true })).needs).toBe(false)
  })

  it('uses recent failure evidence and ignores a comment predating a successful rerun', () => {
    const t = task({ comments: [{ id: 'c-1', body: '请提供 API key', createdAt: 2, version: 1 }],
      executions: [{ id: 'e-1', trigger: 'manual', startedAt: 3, endedAt: 4, outcome: 'succeeded' }] })
    expect(humanWaiting(t).needs).toBe(false)
    t.executions[0]!.outcome = 'failed'
    t.executions[0]!.error = 'missing API key'
    expect(humanWaiting(t)).toMatchObject({ needs: true, source: 'inferred', reasonKey: 'human.reason.input' })
  })

  it('round-trips explicit false and reasons through JSON import and compact summaries', () => {
    for (const waitingForHuman of [true, false]) {
      const source = task({ waitingForHuman, waitingReason: waitingForHuman ? 'Approve the target' : undefined })
      const imported = validateImportedTask(JSON.parse(JSON.stringify(source)), 10)
      expect(imported.ok).toBe(true)
      if (!imported.ok) throw new Error(imported.reason)
      expect(imported.task.waitingForHuman).toBe(waitingForHuman)
      expect(summarize(imported.task).waitingForHuman).toBe(waitingForHuman)
      expect(imported.task.waitingReason).toBe(source.waitingReason)
    }
    expect(validateImportedTask(task(), 10).ok).toBe(true)
    expect(validateImportedTask({ ...task(), waitingForHuman: 'true' }, 10).ok).toBe(false)
  })
})
