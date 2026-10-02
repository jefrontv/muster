// Shapes for describing tool activity per surface. Chat mode is for people who
// never read code; Code mode is for developers. Both read from one description
// so the work log, fold label, changes card and approvals cannot drift.

import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock,
  NativeChatToolSource
} from './native-chat-types'

export type NativeChatSurface = 'chat' | 'code'

/** Same contract as the renderer's translate(); shared code takes it injected. */
export type NativeChatTranslate = (
  key: string,
  fallback: string,
  params?: Record<string, string | number>
) => string

/** English fallback with {{name}} interpolation, for tests and main-process callers. */
export const englishTranslate: NativeChatTranslate = (_key, fallback, params) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    params && name in params ? String(params[name]) : match
  )

/** What a collapsed row may expand to; Chat mode rows never expand. */
export type NativeChatActivityDetail =
  | 'diff'
  | 'terminal'
  | 'files'
  | 'sources'
  | 'fields'
  | 'text'
  | 'none'

/** Bucket for fold counts and grouping. */
export type NativeChatActivityGroup =
  | 'edit'
  | 'command'
  | 'read'
  | 'search'
  | 'web'
  | 'agent'
  | 'mcp'
  | 'question'
  | 'other'

export type NativeChatActivityIcon =
  | 'pen'
  | 'file-plus'
  | 'terminal'
  | 'file'
  | 'search'
  | 'globe'
  | 'bot'
  | 'plug'
  | 'question'
  | 'sparkles'
  | 'tool'

export type NativeChatToolActivity = {
  group: NativeChatActivityGroup
  icon: NativeChatActivityIcon
  /** Leading words, e.g. "Edited", "Ran", "Asked a helper to". */
  verb: string
  /** What it acted on; '' when the verb says it all. */
  object: string
  /** Render the object as literal text (paths, commands, patterns). */
  objectIsCode: boolean
  meta: string[]
  detail: NativeChatActivityDetail
  /** The file a row is about, absolute as the tool saw it. */
  path: string | null
  additions?: number
  deletions?: number
  sources?: NativeChatToolSource[]
  /** The result reported an error. */
  failed: boolean
  /** Drawn elsewhere (TodoWrite is the plan checklist) or plumbing in Chat mode. */
  hidden: boolean
  /** Present tense for the live status line ("Running a command"). */
  liveLabel: string
}

export type NativeChatActivityContext = {
  t?: NativeChatTranslate
  /** Paths under this folder show relative to it. */
  cwd?: string | null
  /** Wall time between the call and its result, when the transcript has both timestamps. */
  elapsedMs?: number | null
}

/** A describer's output before the shared failed/hidden/elapsed pass. */
export type NativeChatActivityDraft = Omit<NativeChatToolActivity, 'failed' | 'hidden' | 'meta'> & {
  meta?: string[]
}

export type NativeChatDescribe = (args: {
  call: NativeChatToolCallBlock
  result: NativeChatToolResultBlock | undefined
  surface: NativeChatSurface
  t: NativeChatTranslate
  cwd: string | null
}) => NativeChatActivityDraft

export const DESCRIBE_BASE = { objectIsCode: false, detail: 'none', path: null } as const
