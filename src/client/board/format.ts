/**
 * Pure display helpers shared by the board components.
 *
 * Review P2: these lived in TaskBoard.tsx and were imported back out by
 * TaskCard/TaskDetail/TaskFormModal, forming import cycles with the view
 * root. They have no component dependencies — they belong here.
 *
 * @module dsh-taskboard/client/board/format
 */
import type { TaskRecord } from '../../shared/protocol.ts'

/** Format an epoch ms as a short local stamp. */
export function fmtTime(ms: number | undefined): string {
  if (ms === undefined) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A running execution silent for longer than this is highlighted as stale (ms). */
export const STALE_CLAIM_MS = 30 * 60_000

/**
 * Whether a live execution is silent. `claimedAt` is a compatibility fallback
 * for records created before execution activity was persisted; it is not used
 * when a real activity timestamp exists.
 */
export function isStaleClaim(task: TaskRecord, now: number): boolean {
  if (task.status !== 'in_progress') return false
  const running = task.executions.filter(execution => execution.outcome === 'running')
  if (running.length === 0) return false
  const activity = Math.max(...running.map(execution => execution.lastActivityAt ?? task.claimedAt ?? -Infinity))
  return Number.isFinite(activity) && now - activity > STALE_CLAIM_MS
}

/** Check if a task requires human intervention or information. */
export function checkNeedsHuman(task: TaskRecord): { needs: boolean; reason?: string } {
  const anyTask = task as Record<string, unknown>
  if (anyTask.waitingForHuman === true) {
    return { needs: true, reason: typeof anyTask.waitingReason === 'string' ? anyTask.waitingReason : undefined }
  }

  const text = `${task.title} ${task.description} ${task.prompt}`.toLowerCase()
  const keywords: Array<{ word: string; label: string }> = [
    { word: '拍板', label: '需人类拍板/确认方案' },
    { word: '待确认', label: '待人工确认' },
    { word: '请确认', label: '请人工确认' },
    { word: '待提供', label: '待提供信息/参数' },
    { word: '请提供', label: '请提供配置/信息' },
    { word: '需人工', label: '需人工介入' },
    { word: '人工处理', label: '需人工处理' },
    { word: '输入key', label: '需输入 API Key' },
    { word: '配置key', label: '需配置 Key' },
    { word: '输入凭据', label: '需输入凭据' },
    { word: '扫码', label: '需人工扫码' },
    { word: '验证码', label: '需人工输入验证码' },
    { word: '登录', label: '需人工登录' },
    { word: '等待用户', label: '等待用户响应' },
    { word: '待用户', label: '等待用户操作' },
  ]
  for (const { word, label } of keywords) {
    if (text.includes(word)) return { needs: true, reason: label }
  }

  if (task.comments && task.comments.length > 0) {
    const lastComment = task.comments[task.comments.length - 1].body
    if (/请提供|等待输入|等待确认|需要您|请在浏览器|missing API key|需要人工/i.test(lastComment)) {
      return { needs: true, reason: '会话中等待用户提供信息' }
    }
  }

  const lastExec = task.executions && task.executions.length > 0 ? task.executions[task.executions.length - 1] : undefined
  if (lastExec?.error && /missing API key|需要提供|请提供|未配置|登录/i.test(lastExec.error)) {
    return { needs: true, reason: '执行缺少凭据或等待输入' }
  }

  return { needs: false }
}

