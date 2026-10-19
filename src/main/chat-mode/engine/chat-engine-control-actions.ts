// Renderer control actions as CLI control requests, plus what each successful
// answer changes in the thread model.

import type {
  ChatEngineControlAction,
  ChatEngineEffort,
  ChatEnginePermissionMode,
  ChatEngineThreadMeta
} from '../../../shared/chat-engine-types'
import { asRecord, asString } from './chat-engine-records'

const EFFORTS = new Set<unknown>(['low', 'medium', 'high', 'xhigh', 'max'])
const MODES = new Set<unknown>(['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'])

function field(value: unknown, name: string): string {
  const text = asString(value)
  if (!text) {
    throw new Error(`chatEngine: ${name} must be a non-empty string`)
  }
  return text
}

/** Validates an action from the renderer; throws on anything malformed. */
export function parseControlAction(value: unknown): ChatEngineControlAction {
  const input = asRecord(value) ?? {}
  switch (input.action) {
    case 'setModel':
      return { action: 'setModel', model: asString(input.model) }
    case 'setEffort':
      return {
        action: 'setEffort',
        effort: EFFORTS.has(input.effort) ? (input.effort as ChatEngineEffort) : null
      }
    case 'setPermissionMode':
      if (!MODES.has(input.mode)) {
        throw new Error('chatEngine: unknown permission mode')
      }
      return { action: 'setPermissionMode', mode: input.mode as ChatEnginePermissionMode }
    case 'interrupt':
    case 'contextUsage':
    case 'mcpStatus':
      return { action: input.action }
    case 'mcpReconnect':
      return { action: 'mcpReconnect', serverName: field(input.serverName, 'serverName') }
    case 'mcpToggle':
      return {
        action: 'mcpToggle',
        serverName: field(input.serverName, 'serverName'),
        enabled: input.enabled === true
      }
    case 'fileSuggestions':
      return {
        action: 'fileSuggestions',
        query: typeof input.query === 'string' ? input.query : ''
      }
    case 'rewind':
      return {
        action: 'rewind',
        userMessageId: field(input.userMessageId, 'userMessageId'),
        dryRun: input.dryRun !== false
      }
    case 'stopTask':
      return { action: 'stopTask', taskId: field(input.taskId, 'taskId') }
    default:
      throw new Error('chatEngine: unknown control action')
  }
}

export function controlRequestFor(action: ChatEngineControlAction): {
  subtype: string
  fields: Record<string, unknown>
} {
  switch (action.action) {
    case 'setModel':
      return { subtype: 'set_model', fields: { model: action.model } }
    case 'setEffort':
      // Effort has no dedicated request; flag settings apply it to the live session.
      return {
        subtype: 'apply_flag_settings',
        fields: { settings: { effortLevel: action.effort } }
      }
    case 'setPermissionMode':
      return { subtype: 'set_permission_mode', fields: { mode: action.mode } }
    case 'interrupt':
      return { subtype: 'interrupt', fields: {} }
    case 'contextUsage':
      return { subtype: 'get_context_usage', fields: {} }
    case 'mcpStatus':
      return { subtype: 'mcp_status', fields: {} }
    case 'mcpReconnect':
      return { subtype: 'mcp_reconnect', fields: { serverName: action.serverName } }
    case 'mcpToggle':
      return {
        subtype: 'mcp_toggle',
        fields: { serverName: action.serverName, enabled: action.enabled }
      }
    case 'fileSuggestions':
      return { subtype: 'file_suggestions', fields: { query: action.query } }
    case 'rewind':
      return {
        subtype: 'rewind_files',
        fields: { user_message_id: action.userMessageId, dry_run: action.dryRun }
      }
    case 'stopTask':
      return { subtype: 'stop_task', fields: { task_id: action.taskId } }
  }
}

/** The model and effort the CLI is actually using, from a `get_settings` answer. */
export function appliedSessionSettings(
  response: unknown
): Partial<Pick<ChatEngineThreadMeta['session'], 'model' | 'effort'>> | null {
  const applied = asRecord(asRecord(response)?.applied)
  if (!applied) {
    return null
  }
  const model = asString(applied.model)
  return {
    ...(model ? { model } : {}),
    ...(EFFORTS.has(applied.effort) ? { effort: applied.effort as ChatEngineEffort } : {})
  }
}

/** Model and effort answers say only "ok"; the applied values come from get_settings. */
export function controlNeedsSettingsRefresh(action: ChatEngineControlAction): boolean {
  return action.action === 'setModel' || action.action === 'setEffort'
}

export function metaAfterControl(
  action: ChatEngineControlAction,
  response: unknown,
  meta: ChatEngineThreadMeta
): Partial<ChatEngineThreadMeta> | null {
  const fields = asRecord(response)
  switch (action.action) {
    case 'setModel':
      return { session: { ...meta.session, model: action.model } }
    case 'setPermissionMode':
      return { session: { ...meta.session, permissionMode: action.mode } }
    case 'contextUsage':
      return typeof fields?.totalTokens === 'number' && typeof fields.maxTokens === 'number'
        ? { contextUsage: { usedTokens: fields.totalTokens, maxTokens: fields.maxTokens } }
        : null
    case 'mcpStatus': {
      const servers = Array.isArray(fields?.mcpServers) ? fields.mcpServers : null
      return servers
        ? {
            session: {
              ...meta.session,
              mcpServers: servers.flatMap((entry) => {
                const server = asRecord(entry)
                const name = asString(server?.name)
                if (!name) {
                  return []
                }
                const error = asString(server?.error)
                return [
                  {
                    name,
                    status: asString(server?.status) ?? 'pending',
                    ...(error ? { error } : {}),
                    ...(Array.isArray(server?.tools) ? { toolCount: server.tools.length } : {})
                  }
                ]
              })
            }
          }
        : null
    }
    default:
      return null
  }
}
