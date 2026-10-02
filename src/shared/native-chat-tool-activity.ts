// The single place that decides how a tool call reads on each surface. Chat:
// plain sentences with file names, the model's own description instead of a
// command, never JSON. Code: verbs with relative paths, commands, real line
// counts from the structured patch, and a typed detail to expand.

import type { NativeChatToolCallBlock, NativeChatToolResultBlock } from './native-chat-types'
import {
  DESCRIBE_BASE as base,
  englishTranslate,
  type NativeChatActivityContext,
  type NativeChatDescribe as Describe,
  type NativeChatSurface,
  type NativeChatToolActivity
} from './native-chat-tool-activity-types'
import {
  describeCommand,
  describeEdit,
  describeRead,
  describeSearch
} from './native-chat-tool-activity-local'
import { describeAgent, describeOther, describeWeb } from './native-chat-tool-activity-delegated'
import { formatToolElapsed } from './native-chat-tool-elapsed'

export type { NativeChatSurface, NativeChatToolActivity } from './native-chat-tool-activity-types'

const PLAN_TOOLS = new Set(['TodoWrite'])
/** Harness plumbing a non-technical reader gains nothing from. */
const CHAT_HIDDEN_TOOLS = new Set(['ToolSearch'])

const DESCRIBERS: Record<string, Describe> = {
  Edit: describeEdit,
  MultiEdit: describeEdit,
  NotebookEdit: describeEdit,
  Write: describeEdit,
  Bash: describeCommand,
  BashOutput: describeCommand,
  Read: describeRead,
  Grep: describeSearch,
  Glob: describeSearch,
  LS: describeSearch,
  WebFetch: describeWeb,
  WebSearch: describeWeb,
  Task: describeAgent,
  Agent: describeAgent
}

export function describeToolActivity(
  call: NativeChatToolCallBlock | undefined,
  result: NativeChatToolResultBlock | undefined,
  surface: NativeChatSurface,
  context: NativeChatActivityContext = {}
): NativeChatToolActivity {
  const t = context.t ?? englishTranslate
  const failed = result?.isError === true
  if (!call) {
    // An orphan result (its call scrolled off the loaded window).
    return {
      ...base,
      group: 'other',
      icon: 'tool',
      verb: t('components.native-chat.activity.toolResult', 'Tool result'),
      object: '',
      meta: [],
      detail: surface === 'code' ? 'text' : 'none',
      failed,
      hidden: surface === 'chat',
      liveLabel: t('components.native-chat.activity.working', 'Working')
    }
  }
  const describe = DESCRIBERS[call.name] ?? describeOther
  const draft = describe({ call, result, surface, t, cwd: context.cwd ?? null })
  const elapsed =
    surface === 'code' && context.elapsedMs != null && context.elapsedMs >= 1_000
      ? [formatToolElapsed(context.elapsedMs)]
      : []
  const meta = [
    ...(draft.meta ?? []),
    ...elapsed,
    ...(failed && surface === 'code' ? [t('components.native-chat.activity.failed', 'failed')] : [])
  ]
  return {
    ...draft,
    meta,
    failed,
    hidden: PLAN_TOOLS.has(call.name) || (surface === 'chat' && CHAT_HIDDEN_TOOLS.has(call.name))
  }
}
