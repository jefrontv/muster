// `AC#77` tokens in a sent prompt reference ActiveCollab tasks. Like composer
// @-file references, the token is what the agent reads; the chat surface lifts
// it back out so the row shows a task chip instead of the raw token.

import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import type { AppState } from '@/store/types'

const TASK_REF_RE = /(^|[\s([])AC#(\d{1,10})\b/g

export type NativeChatParsedTaskReferences = {
  /** Referenced task ids, in order of first appearance. */
  taskIds: number[]
  /** The prompt text with the tokens removed — the chips carry the tasks. */
  text: string
}

export function parseActiveCollabTaskReferences(text: string): NativeChatParsedTaskReferences {
  const ids = new Set<number>()
  const next = text.replace(TASK_REF_RE, (_match, lead: string, digits: string) => {
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
