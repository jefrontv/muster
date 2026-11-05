// Background (async) subagents: the Agent tool call returns at once with a launch notice,
// and the agent's end arrives later as a <task-notification> user message.

const LAUNCH_PREFIX = 'Async agent launched'

/** The tool result is a background launch, not the agent's answer. */
export function isAsyncAgentLaunch(resultText: string, structured?: unknown): boolean {
  const status =
    typeof structured === 'object' && structured !== null
      ? (structured as Record<string, unknown>).status
      : undefined
  return status === 'async_launched' || resultText.trimStart().startsWith(LAUNCH_PREFIX)
}

export type ChatTaskNotification = {
  toolUseId: string
  status: 'done' | 'error' | 'stopped' | 'running'
  /** The agent's result, else the notification's own one-line summary. */
  summary: string | null
}

const tag = (text: string, name: string): string | null =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim() || null

function notificationStatus(value: string | null): ChatTaskNotification['status'] | null {
  switch (value) {
    case 'completed':
      return 'done'
    case 'failed':
      return 'error'
    case 'stopped':
    case 'killed':
      return 'stopped'
    case 'running':
      return 'running'
    default:
      return null
  }
}

export function parseTaskNotification(text: string): ChatTaskNotification | null {
  if (!text.trimStart().startsWith('<task-notification>')) {
    return null
  }
  const toolUseId = tag(text, 'tool-use-id')
  const status = notificationStatus(tag(text, 'status'))
  if (!toolUseId || !status) {
    return null
  }
  const summary = tag(text, 'result') ?? tag(text, 'summary')
  return { toolUseId, status, summary: summary ? summary.slice(0, 300) : null }
}
