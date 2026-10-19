// `system` records: session init, status, compaction, retries, denials,
// subagent task lifecycle, thinking progress and notices.

import type { ChatEngineItem, ChatEnginePermissionMode } from '../../../shared/chat-engine-types'
import type { ChatEngineThread } from './chat-engine-thread'
import { appendItem } from './chat-engine-tree'
import { asRecord, asString, strings, type Rec } from './chat-engine-records'
import { applyTaskRecord, TASK_SUBTYPES } from './chat-engine-apply-task'

const PERMISSION_MODES = new Set<ChatEnginePermissionMode>([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'bypassPermissions'
])

export function asPermissionMode(value: unknown): ChatEnginePermissionMode | null {
  return typeof value === 'string' && PERMISSION_MODES.has(value as ChatEnginePermissionMode)
    ? (value as ChatEnginePermissionMode)
    : null
}

export function addNotice(
  thread: ChatEngineThread,
  now: number,
  id: string,
  level: 'info' | 'warning' | 'error',
  text: string
): void {
  const turn = thread.currentTurn(now)
  const notice: ChatEngineItem = { kind: 'notice', id, level, text }
  const existing = turn.items.findIndex((item) => item.id === id)
  if (existing === -1) {
    thread.replaceTurn(appendItem(turn, notice, null))
  } else {
    thread.updateItemAnywhere(id, () => notice)
  }
}

export function applySystemRecord(thread: ChatEngineThread, record: Rec, now: number): void {
  if (typeof record.subtype === 'string' && TASK_SUBTYPES.has(record.subtype)) {
    applyTaskRecord(thread, record, now)
    return
  }
  switch (record.subtype) {
    case 'init': {
      const mode = asString(record.permissionMode)
      thread.setMeta({
        session: {
          sessionId: asString(record.session_id),
          model: asString(record.model),
          permissionMode:
            mode && PERMISSION_MODES.has(mode as ChatEnginePermissionMode)
              ? (mode as ChatEnginePermissionMode)
              : null,
          cwd: asString(record.cwd),
          cliVersion: asString(record.claude_code_version),
          tools: strings(record.tools),
          slashCommands: strings(record.slash_commands),
          mcpServers: Array.isArray(record.mcp_servers)
            ? record.mcp_servers.flatMap((entry) => {
                const server = asRecord(entry)
                const name = asString(server?.name)
                return name ? [{ name, status: asString(server?.status) ?? 'unknown' }] : []
              })
            : []
        }
      })
      return
    }
    case 'status': {
      const mode = asString(record.permissionMode)
      const session = thread.getMeta().session
      thread.setMeta({
        compacting: record.status === 'compacting',
        ...(mode && PERMISSION_MODES.has(mode as ChatEnginePermissionMode)
          ? { session: { ...session, permissionMode: mode as ChatEnginePermissionMode } }
          : {})
      })
      return
    }
    case 'compact_boundary':
      addNotice(
        thread,
        now,
        `compact-${asString(record.uuid) ?? now}`,
        'info',
        'Older messages were summarised to free up context.'
      )
      return
    case 'api_retry': {
      const attempt = typeof record.attempt === 'number' ? record.attempt : null
      const max = typeof record.max_retries === 'number' ? record.max_retries : null
      const turn = thread.currentTurn(now)
      addNotice(
        thread,
        now,
        `retry-${turn.id}`,
        'warning',
        attempt && max ? `Retrying the request (${attempt} of ${max})` : 'Retrying the request'
      )
      return
    }
    case 'permission_denied': {
      const toolUseId = asString(record.tool_use_id)
      if (toolUseId) {
        thread.updateItemAnywhere(toolUseId, (item) =>
          item.kind === 'tool' ? { ...item, status: 'denied' } : item
        )
      }
      return
    }
    case 'thinking_tokens': {
      const tokens = typeof record.estimated_tokens === 'number' ? record.estimated_tokens : null
      const turn = thread.runningTurn()
      const thinking = turn?.items.findLast((item) => item.kind === 'thinking' && item.streaming)
      if (tokens !== null && thinking) {
        thread.updateItemAnywhere(thinking.id, (item) =>
          item.kind === 'thinking' ? { ...item, estimatedTokens: tokens } : item
        )
      }
      return
    }
    case 'notification':
    case 'informational': {
      const text = asString(record.text) ?? asString(record.content)
      if (text) {
        addNotice(
          thread,
          now,
          `note-${asString(record.uuid) ?? now}`,
          record.level === 'error' ? 'error' : 'info',
          text
        )
      }
      return
    }
    default:
      break
  }
}
