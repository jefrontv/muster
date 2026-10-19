// The chat engine's thread model: built in main from the Claude CLI's stream-json
// records (and transcript JSONL for history), sent to the renderer as a snapshot
// plus per-turn patches. The renderer draws it; it never derives it.

import type { ChatThreadMessageQueueSnapshot } from './chat-thread-stream-types'

export type ChatEngineThreadStatus =
  | 'idle'
  | 'starting'
  | 'working'
  | 'waiting'
  | 'error'
  | 'stopped'

export type ChatEnginePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'bypassPermissions'

export type ChatEngineEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ChatEngineMcpServer = {
  name: string
  /** connected, failed, needs-auth, pending or disabled. */
  status: string
  error?: string
  /** From mcp_status; system/init doesn't report it. */
  toolCount?: number
}

export type ChatEngineSession = {
  sessionId: string | null
  model: string | null
  permissionMode: ChatEnginePermissionMode | null
  cwd: string | null
  cliVersion: string | null
  tools: string[]
  slashCommands: string[]
  mcpServers: ChatEngineMcpServer[]
}

/** Structured tool output from `tool_use_result`, trimmed to what the UI draws. */
export type ChatEngineToolResult = {
  text: string
  isError: boolean
  truncated: boolean
  /** Edit/Write/MultiEdit: unified hunks from the CLI's structuredPatch. */
  patch?: ChatEnginePatchHunk[]
  /** Write made a new file; its patch is the file's first lines, all added. */
  created?: boolean
  additions?: number
  deletions?: number
  /** Bash. */
  stdout?: string
  stderr?: string
  interrupted?: boolean
  exitInterpretation?: string
  backgroundTaskId?: string
  fullOutputPath?: string
}

export type ChatEnginePatchHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export type ChatEngineToolStatus =
  | 'streaming'
  | 'running'
  | 'awaiting-approval'
  | 'done'
  | 'error'
  | 'denied'
  | 'interrupted'

export type ChatEngineItem =
  | { kind: 'text'; id: string; text: string; streaming: boolean }
  | { kind: 'thinking'; id: string; text: string; streaming: boolean; estimatedTokens?: number }
  | {
      kind: 'tool'
      id: string
      name: string
      input: unknown
      status: ChatEngineToolStatus
      result?: ChatEngineToolResult
      elapsedSeconds?: number
    }
  | {
      kind: 'agent'
      id: string
      description: string
      subagentType: string | null
      status: 'running' | 'done' | 'error' | 'stopped'
      summary: string | null
      items: ChatEngineItem[]
    }
  | { kind: 'notice'; id: string; level: 'info' | 'warning' | 'error'; text: string }
  /** A message the user sent into the running turn; `id` is its CLI uuid. */
  | { kind: 'steer'; id: string; text: string; imageCount: number; delivered: boolean }

export type ChatEngineUserMessage = {
  text: string
  imageCount: number
  sentAt: number
  /** local = written to stdin, delivered = replayed by the CLI (has a uuid). */
  delivery: 'local' | 'delivered'
  /** The CLI's uuid for this message; needed to rewind files to before it. */
  uuid: string | null
}

export type ChatEngineTurnStatus = 'running' | 'done' | 'error' | 'interrupted'

export type ChatEngineTurn = {
  id: string
  index: number
  user: ChatEngineUserMessage | null
  items: ChatEngineItem[]
  status: ChatEngineTurnStatus
  startedAt: number
  endedAt: number | null
  durationMs: number | null
  costUsd: number | null
  errorMessage: string | null
  /** CLI-written one-liners for groups of tool calls, newest last. */
  toolSummaries: string[]
}

export type ChatEnginePendingKind = 'permission' | 'question' | 'plan'

export type ChatEnginePending = {
  requestId: string
  kind: ChatEnginePendingKind
  toolName: string
  toolUseId: string | null
  input: unknown
  title: string | null
  description: string | null
  decisionReason: string | null
  blockedPath: string | null
  suggestions: unknown[]
}

export type ChatEngineTodo = {
  content: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type ChatEngineContextUsage = { usedTokens: number; maxTokens: number }

/** A subagent or background command the CLI runs as a task (task_started to task_notification). */
export type ChatEngineTask = {
  taskId: string
  toolUseId: string | null
  /** The CLI's task_type, e.g. local_agent or local_bash. */
  type: string | null
  description: string
  subagentType: string | null
  status: 'running' | 'done' | 'error' | 'stopped'
  summary: string | null
  startedAt: number
  endedAt: number | null
  toolUses: number | null
}

/** Everything about a thread except its turns (those travel separately). */
export type ChatEngineThreadMeta = {
  threadId: string
  status: ChatEngineThreadStatus
  session: ChatEngineSession
  pending: ChatEnginePending[]
  /** Mirror of the stream's message queue, which owns delivery. */
  queue: ChatThreadMessageQueueSnapshot
  todos: ChatEngineTodo[] | null
  suggestions: string[]
  contextUsage: ChatEngineContextUsage | null
  tasks: ChatEngineTask[]
  totalCostUsd: number
  compacting: boolean
  lastError: string | null
}

export type ChatEngineSnapshot = {
  version: number
  meta: ChatEngineThreadMeta
  turns: ChatEngineTurn[]
}

/** Changed turns are sent whole; unchanged ones keep their renderer identity. */
export type ChatEnginePatch = {
  threadId: string
  version: number
  meta?: ChatEngineThreadMeta
  turns?: ChatEngineTurn[]
}

export type ChatEngineCommand = { name: string; description: string; argumentHint: string }

export type ChatEngineModelOption = {
  value: string
  /** The full model id an alias points at (what system/init reports). */
  resolved: string | null
  displayName: string
  description: string
  effortLevels: ChatEngineEffort[]
}

/** What the CLI's `initialize` reported: fixed for the life of one process. */
export type ChatEngineCapabilities = {
  commands: ChatEngineCommand[]
  models: ChatEngineModelOption[]
  agents: { name: string; description: string }[]
  account: { email: string | null; organization: string | null; plan: string | null }
}

/** Renderer requests that map onto the CLI's control protocol for a live thread. */
export type ChatEngineControlAction =
  | { action: 'setModel'; model: string | null }
  | { action: 'setEffort'; effort: ChatEngineEffort | null }
  | { action: 'setPermissionMode'; mode: ChatEnginePermissionMode }
  | { action: 'interrupt' }
  | { action: 'contextUsage' }
  | { action: 'mcpStatus' }
  | { action: 'mcpReconnect'; serverName: string }
  | { action: 'mcpToggle'; serverName: string; enabled: boolean }
  | { action: 'fileSuggestions'; query: string }
  | { action: 'rewind'; userMessageId: string; dryRun: boolean }
  | { action: 'stopTask'; taskId: string }

export type ChatEngineControlResult = { ok: true; value: unknown } | { ok: false; error: string }

export const CHAT_ENGINE_PATCH_CHANNEL = 'chatEngine:patch'
