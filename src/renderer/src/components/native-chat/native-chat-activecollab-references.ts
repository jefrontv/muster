// `AC#77` tokens in a sent prompt reference ActiveCollab tasks. Like composer
// @-file references, the token is what the agent reads; the chat surface lifts
// it back out so the row shows a task chip instead of the raw token.

import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import type { AppState } from '@/store/types'

const TASK_REF_RE = /(^|[\s([])AC#(\d{1,10})\b/g
// A full attached-task context line (see formatActiveCollabTaskReference).
const TASK_CONTEXT_LINE_RE = /^\[AC#(\d{1,10})\b[^\]]*\]$/gm

/** The prompt-side form of an attached task: the AC# token plus enough context
 *  for the agent to resolve it through the ActiveCollab MCP unprompted. */
export function formatActiveCollabTaskReference(task: {
  taskId: number
  projectId: number
  name: string
}): string {
  // Brackets delimit the line for the display-side strip — keep them out of the name.
  const name = task.name.replace(/[[\]]/g, '').trim()
  return `[AC#${task.taskId} — ActiveCollab task "${name}" (task_id ${task.taskId}, project_id ${task.projectId}). Read or update it with the activecollab MCP tools, e.g. get_task_bundle with project_id ${task.projectId} and task_id ${task.taskId}.]`
}

export type NativeChatParsedTaskReferences = {
  /** Referenced task ids, in order of first appearance. */
  taskIds: number[]
  /** The prompt text with tokens and context lines removed — chips carry them. */
  text: string
}

export function parseActiveCollabTaskReferences(text: string): NativeChatParsedTaskReferences {
  const ids = new Set<number>()
  // Attached-task context lines first (they contain the token), then bare tokens.
  let next = text.replace(TASK_CONTEXT_LINE_RE, (_match, digits: string) => {
    const id = Number(digits)
    if (Number.isFinite(id)) {
      ids.add(id)
    }
    return ''
  })
  next = next.replace(TASK_REF_RE, (_match, lead: string, digits: string) => {
    const id = Number(digits)
    if (Number.isFinite(id)) {
      ids.add(id)
    }
    return lead
  })
  if (ids.size === 0) {
    return { taskIds: [], text }
  }
  return { taskIds: [...ids], text: next.replace(/[^\S\n]{2,}/g, ' ').trim() }
}

/** Best-effort task lookup across the polled page caches and detail cache —
 *  a chip renders with name + completion when found, bare `#id` otherwise. */
export function findActiveCollabTaskInCaches(
  state: Pick<AppState, 'activeCollabTaskPageCache' | 'activeCollabTaskDetailCache'>,
  taskId: number
): ActiveCollabTask | null {
  for (const entry of Object.values(state.activeCollabTaskDetailCache ?? {})) {
    const task = (entry as { value?: { task?: ActiveCollabTask } })?.value?.task
    if (task?.id === taskId) {
      return task
    }
  }
  for (const entry of Object.values(state.activeCollabTaskPageCache ?? {})) {
    const tasks = (entry as { value?: { tasks?: ActiveCollabTask[] } })?.value?.tasks
    const task = tasks?.find((candidate) => candidate.id === taskId)
    if (task) {
      return task
    }
  }
  return null
}
