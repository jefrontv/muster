import type { NotificationDispatchRequest } from '../../shared/types'

const NOTIFICATION_AGENT_LABEL_MAX_LENGTH = 40
const NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH = 80
const NOTIFICATION_BODY_PREVIEW_MAX_LENGTH = 180

const AGENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  claude: 'Claude',
  openclaude: 'OpenClaude',
  codex: 'Codex',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  aider: 'Aider',
  pi: 'Pi',
  omp: 'OMP',
  droid: 'Droid',
  grok: 'Grok',
  hermes: 'Hermes'
}

export function buildNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
  silent?: boolean
  sound?: string
} {
  if (args.source === 'terminal-bell') {
    return {
      title: `Bell in ${args.worktreeLabel ?? 'workspace'}`,
      body: args.repoLabel ? `${args.repoLabel} · Attention requested` : 'Attention requested'
    }
  }

  if (args.source === 'site-run-complete') {
    const run = args.siteRun
    const verb = run?.group === 'deploy' ? 'Deploy' : 'Import'
    const outcome = run?.status === 'succeeded' ? 'finished' : (run?.status ?? 'ended')
    return {
      title: `${verb} ${outcome}: ${run?.siteName ?? 'site'}`,
      body: run?.environment ? `Environment: ${run.environment}` : 'WordPress site run'
    }
  }

  if (args.source.startsWith('activecollab-')) {
    return buildActiveCollabNotificationOptions(args)
  }

  if (args.source === 'test') {
    return {
      title: 'Muster notifications are on',
      body: 'This is a test notification from Muster.'
    }
  }

  const richOptions = buildAgentTaskCompleteNotificationOptions(args)
  if (richOptions) {
    return richOptions
  }

  return buildAgentTaskCompleteFallbackNotificationOptions(args)
}

/**
 * Task name first: it is the only part that tells the reader WHICH of their tasks this is, and a
 * macOS banner truncates the tail. The project follows in the body, because two tasks called
 * "Homepage" in two projects are otherwise the same notification.
 */
function buildActiveCollabNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
} {
  const task = args.activeCollab
  const name = normalizeNotificationText(task?.taskName, NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH)
  const taskName = name.length > 0 ? name : 'a task'
  const project = normalizeNotificationText(
    task?.projectName,
    NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
  )
  const body = project.length > 0 ? project : 'ActiveCollab'
  if (args.source === 'activecollab-comments') {
    const count = task?.newComments ?? 1
    return {
      title: `${count} new comment${count === 1 ? '' : 's'}: ${taskName}`,
      body
    }
  }
  if (args.source === 'activecollab-due') {
    return { title: `${task?.duePhrase ?? 'Due soon'}: ${taskName}`, body }
  }
  if (args.source === 'activecollab-updated') {
    return { title: `Task updated: ${taskName}`, body }
  }
  return {
    title: `Assigned to you: ${taskName}`,
    body: task?.duePhrase ? `${body} · ${task.duePhrase}` : body
  }
}

function buildAgentTaskCompleteNotificationOptions(
  args: NotificationDispatchRequest
): { title: string; body: string } | null {
  if (!hasAgentNotificationSnapshot(args)) {
    return null
  }

  const agentLabel = formatNotificationAgentLabel(args.agentType)
  const worktreeContext = formatNotificationWorktreeContext(args)
  const statusText =
    args.agentState === 'blocked' || args.agentState === 'waiting'
      ? 'needs input'
      : args.agentState === 'done' && args.agentInterrupted
        ? 'stopped'
        : 'finished'

  return {
    title: `${worktreeContext} - ${agentLabel} ${statusText}`,
    body: buildAgentTaskCompleteRichBody(args) ?? `${agentLabel} ${statusText}.`
  }
}

function formatNotificationWorktreeContext(args: NotificationDispatchRequest): string {
  const worktreeLabel = normalizeNotificationText(
    args.worktreeLabel,
    NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
  )
  const repoLabel = normalizeNotificationText(args.repoLabel, NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH)
  if (args.hasMultipleActiveRepos && repoLabel && worktreeLabel) {
    return normalizeNotificationText(
      `${repoLabel} / ${worktreeLabel}`,
      NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
    )
  }
  return worktreeLabel || repoLabel || 'workspace'
}

function hasAgentNotificationSnapshot(args: NotificationDispatchRequest): boolean {
  return Boolean(
    args.agentType ||
    args.agentState ||
    args.agentPrompt ||
    args.agentToolName ||
    args.agentToolInput ||
    args.agentLastAssistantMessage ||
    args.agentInterrupted
  )
}

function buildAgentTaskCompleteRichBody(args: NotificationDispatchRequest): string | null {
  const assistantMessage = normalizeNotificationText(
    args.agentLastAssistantMessage,
    NOTIFICATION_BODY_PREVIEW_MAX_LENGTH
  )
  if (assistantMessage) {
    return assistantMessage
  }

  const toolName = normalizeNotificationText(args.agentToolName, 60)
  const toolInput = normalizeNotificationText(
    args.agentToolInput,
    NOTIFICATION_BODY_PREVIEW_MAX_LENGTH
  )
  if (toolName && toolInput) {
    return `Using ${toolName}: ${toolInput}`
  }
  if (toolName) {
    return `Using ${toolName}`
  }
  if (toolInput) {
    return `Tool input: ${toolInput}`
  }

  return null
}

function buildAgentTaskCompleteFallbackNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
} {
  return {
    title: `Task complete in ${args.worktreeLabel ?? 'workspace'}`,
    body: buildAgentTaskCompleteFallbackBody(args)
  }
}

function buildAgentTaskCompleteFallbackBody(args: NotificationDispatchRequest): string {
  return args.repoLabel
    ? `${args.repoLabel}${args.terminalTitle ? ` · ${args.terminalTitle}` : ''}`
    : (args.terminalTitle ?? 'A coding agent finished working.')
}

function formatNotificationAgentLabel(agentType: string | null | undefined): string {
  const normalized = normalizeNotificationText(agentType, NOTIFICATION_AGENT_LABEL_MAX_LENGTH)
  if (!normalized || normalized === 'unknown') {
    return 'Agent'
  }
  return AGENT_TYPE_LABELS[normalized] ?? normalized
}

function normalizeNotificationText(value: string | null | undefined, maxLength: number): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length <= maxLength) {
    return normalized
  }
  const truncated = normalized.slice(0, maxLength - 1)
  const lastCode = truncated.charCodeAt(truncated.length - 1)
  const safeTruncated =
    lastCode >= 0xd800 && lastCode <= 0xdbff ? truncated.slice(0, -1) : truncated
  return `${safeTruncated}…`
}
