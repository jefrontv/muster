// `system` task records (task_started, task_progress, task_updated,
// task_notification): the thread's task list for the review panel, plus the
// matching subagent block's status and live summary.

import type { ChatEngineTask } from '../../../shared/chat-engine-types'
import type { ChatEngineThread } from './chat-engine-thread'
import { asRecord, asString, type Rec } from './chat-engine-records'

export const TASK_SUBTYPES = new Set([
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification'
])

function finishedStatus(value: unknown): ChatEngineTask['status'] | null {
  switch (value) {
    case 'completed':
      return 'done'
    case 'failed':
      return 'error'
    case 'stopped':
    case 'killed':
      return 'stopped'
    default:
      return null
  }
}

function nextTask(
  existing: ChatEngineTask | undefined,
  record: Rec,
  taskId: string,
  now: number
): ChatEngineTask {
  const patch = record.subtype === 'task_updated' ? (asRecord(record.patch) ?? {}) : record
  const finished = record.subtype === 'task_started' ? null : finishedStatus(patch.status)
  const usage = asRecord(record.usage)
  const base: ChatEngineTask = existing ?? {
    taskId,
    toolUseId: null,
    type: null,
    description: '',
    subagentType: null,
    status: 'running',
    summary: null,
    startedAt: now,
    endedAt: null,
    toolUses: null
  }
  return {
    ...base,
    toolUseId: base.toolUseId ?? asString(record.tool_use_id),
    type: base.type ?? asString(record.task_type),
    description: asString(patch.description) || base.description,
    subagentType: base.subagentType ?? asString(record.subagent_type),
    summary: asString(record.summary) ?? base.summary,
    toolUses: typeof usage?.tool_uses === 'number' ? usage.tool_uses : base.toolUses,
    ...(finished && base.status === 'running' ? { status: finished, endedAt: now } : {})
  }
}

export function applyTaskRecord(thread: ChatEngineThread, record: Rec, now: number): void {
  const taskId = asString(record.task_id)
  if (taskId) {
    const tasks = thread.getMeta().tasks
    const index = tasks.findIndex((task) => task.taskId === taskId)
    const task = nextTask(tasks[index], record, taskId, now)
    thread.setMeta({
      tasks:
        index === -1 ? [...tasks, task] : tasks.map((entry, at) => (at === index ? task : entry))
    })
  }

  const toolUseId =
    asString(record.tool_use_id) ??
    thread.getMeta().tasks.find((task) => task.taskId === taskId)?.toolUseId ??
    null
  if (!toolUseId) {
    return
  }
  const summary = asString(record.summary)
  const description = asString(record.description)
  const finished = record.subtype === 'task_notification' ? finishedStatus(record.status) : null
  thread.updateItemAnywhere(toolUseId, (item) =>
    item.kind === 'agent'
      ? {
          ...item,
          status: finished ?? item.status,
          summary: summary ?? item.summary,
          description: item.description || description || '',
          subagentType: item.subagentType ?? asString(record.subagent_type)
        }
      : item
  )
}
