// Tool name to renderer. Unknown tools, MCP ones included, fall back to the
// generic card; lookupToolRenderer adds the `mcp__<server>__` prefix match.

import { ChatBashBody } from './ChatBashBody'
import { ChatDiffBody } from './ChatDiffBody'
import { ChatGenericToolBody } from './ChatGenericToolBody'
import { ChatQuestionBody } from './ChatQuestionBody'
import { ChatTodoBody } from './ChatTodoBody'
import type { ChatToolRenderer } from './chat-tool-body-types'
import { lookupToolRenderer } from './chat-tool-renderer-lookup'

const failed = (item: Parameters<ChatToolRenderer['openByDefault']>[0]): boolean =>
  item.status === 'error'

const generic: ChatToolRenderer = { Body: ChatGenericToolBody, openByDefault: failed }
const diff: ChatToolRenderer = {
  Body: ChatDiffBody,
  openByDefault: (item) => item.status !== 'denied'
}
const always: (Body: ChatToolRenderer['Body']) => ChatToolRenderer = (Body) => ({
  Body,
  openByDefault: () => true
})

const TOOL_RENDERERS = new Map<string, ChatToolRenderer>([
  ['Bash', { Body: ChatBashBody, openByDefault: failed }],
  ['Edit', diff],
  ['MultiEdit', diff],
  ['Write', diff],
  ['TodoWrite', always(ChatTodoBody)],
  ['AskUserQuestion', always(ChatQuestionBody)]
])

export function chatToolRenderer(name: string): ChatToolRenderer {
  return lookupToolRenderer(TOOL_RENDERERS, name, generic)
}
