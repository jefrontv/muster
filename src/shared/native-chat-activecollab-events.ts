// Maps ActiveCollab MCP write-tools to human task events, so a chat turn shows
// "Completed task #77" instead of a generic wrench row. Read-only tools return
// null and keep the ordinary tool treatment.

export type ActiveCollabToolEvent = {
  /** Which visual family the chip uses: emerald done, sky change, muted note. */
  kind: 'complete' | 'reopen' | 'comment' | 'update' | 'create' | 'time'
  label: string
  taskId: number | null
}

const EVENT_TOOLS: Record<string, ActiveCollabToolEvent['kind']> = {
  complete_task: 'complete',
  reopen_task: 'reopen',
  post_task_comment: 'comment',
  update_task: 'update',
  set_task_labels: 'update',
  create_task: 'create',
  log_time: 'time'
}

function readTaskId(input: unknown): number | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  const id = record.task_id ?? record.taskId
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

function readLabels(input: unknown): string | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const labels = (input as Record<string, unknown>).labels
  if (!Array.isArray(labels) || labels.length === 0) {
    return null
  }
  const names = labels.filter((label): label is string => typeof label === 'string')
  return names.length > 0 ? names.join(', ') : null
}

export function activeCollabToolEvent(
  toolName: string,
  input: unknown
): ActiveCollabToolEvent | null {
  const match = /^mcp__activecollab__(.+)$/.exec(toolName.trim())
  if (!match) {
    return null
  }
  const kind = EVENT_TOOLS[match[1]!]
  if (!kind) {
    return null
  }
  const taskId = readTaskId(input)
  const task = taskId !== null ? `task #${taskId}` : 'a task'
  switch (kind) {
    case 'complete':
      return { kind, taskId, label: `Completed ${task}` }
    case 'reopen':
      return { kind, taskId, label: `Reopened ${task}` }
    case 'comment':
      return { kind, taskId, label: `Commented on ${task}` }
    case 'create':
      return { kind, taskId, label: 'Created a task' }
    case 'time':
      return { kind, taskId, label: `Logged time on ${task}` }
    case 'update': {
      const labels = match[1] === 'set_task_labels' ? readLabels(input) : null
      return { kind, taskId, label: labels ? `Labeled ${task} ${labels}` : `Updated ${task}` }
    }
  }
}
