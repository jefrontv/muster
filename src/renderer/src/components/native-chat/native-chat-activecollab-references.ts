// `AC#77` tokens in a message reference ActiveCollab tasks. The token stays in
// the text (it is the agent's context too); the row adds a clickable chip per
// unique task above the bubble.

import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import type { AppState } from '@/store/types'

const TASK_REF_RE = /(?:^|[\s([])AC#(\d{1,10})\b/g

export function parseActiveCollabTaskRefs(markdown: string): number[] {
  const ids = new Set<number>()
  for (const match of markdown.matchAll(TASK_REF_RE)) {
    const id = Number(match[1])
    if (Number.isFinite(id)) {
      ids.add(id)
    }
  }
  return [...ids]
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
