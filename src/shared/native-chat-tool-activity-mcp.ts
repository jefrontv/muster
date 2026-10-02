// MCP tools (`mcp__server__tool`). Code mode names the server and tool; Chat
// mode says what happened in a sentence about the server, never the payload.

import type { NativeChatTranslate } from './native-chat-tool-activity-types'
import { inputField } from './native-chat-tool-input-fields'

export type McpToolName = { server: string; tool: string }

const SERVER_NAMES: Record<string, string> = {
  activecollab: 'ActiveCollab',
  'muster sites': 'Muster sites',
  'agent local': 'Agent Local',
  context7: 'Context7',
  figma: 'Figma',
  gmail: 'Gmail',
  slack: 'Slack'
}

/** Plugin servers carry a `plugin_<name>_` prefix and claude.ai connectors `claude_ai_`. */
export function parseMcpToolName(rawName: string): McpToolName | null {
  const match = /^mcp__([^_].*?)__(.+)$/.exec(rawName.trim())
  if (!match) {
    return null
  }
  const raw = match[1]!
    .replace(/^plugin_[^_]+_/i, '')
    .replace(/^claude_ai_/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  const server = SERVER_NAMES[raw.toLowerCase()] ?? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`
  return { server, tool: match[2]!.replace(/_+/g, ' ').trim() }
}

const READ_VERBS =
  /^(get|list|search|find|describe|read|query|fetch|resolve|whoami|health|preview)\b/
const WRITE_VERBS =
  /^(create|update|set|post|log|complete|delete|upload|add|remove|move|rename|run|send|restore|install)\b/

function taskSuffix(input: unknown): string {
  return inputField(input, 'task_id') ?? inputField(input, 'taskId') ?? ''
}

/** "Checked ActiveCollab task #77", "Updated Muster sites", "Used Figma". */
export function mcpChatSentence(mcp: McpToolName, input: unknown, t: NativeChatTranslate): string {
  const taskId = taskSuffix(input)
  if (READ_VERBS.test(mcp.tool)) {
    return taskId
      ? t('components.native-chat.activity.mcpCheckedTask', 'Checked {{server}} task #{{id}}', {
          server: mcp.server,
          id: taskId
        })
      : t('components.native-chat.activity.mcpChecked', 'Checked {{server}}', {
          server: mcp.server
        })
  }
  if (WRITE_VERBS.test(mcp.tool)) {
    return taskId
      ? t('components.native-chat.activity.mcpUpdatedTask', 'Updated {{server}} task #{{id}}', {
          server: mcp.server,
          id: taskId
        })
      : t('components.native-chat.activity.mcpUpdated', 'Updated {{server}}', {
          server: mcp.server
        })
  }
  return t('components.native-chat.activity.mcpUsed', 'Used {{server}}', { server: mcp.server })
}

export function mcpChatLiveLabel(mcp: McpToolName, t: NativeChatTranslate): string {
  return t('components.native-chat.activity.mcpLive', 'Checking {{server}}', {
    server: mcp.server
  })
}
