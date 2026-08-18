// Handlers behind the muster MCP tools. Every call re-resolves the calling
// thread and its workspace from the live store, so a thread moved between
// workspaces (or orphaned) is scoped correctly at call time, not launch time.

import type { ChatWorkspacePatch } from '../../shared/chat-mode-types'
import {
  normalizeChatWorkspaceEmails,
  normalizeChatWorkspaceNotes,
  normalizeChatWorkspaceUrls
} from '../../shared/chat-workspace-site-info'
import { normalizeRepoBadgeColor } from '../../shared/repo-badge-color'
import {
  MAX_CHAT_CONNECTOR_NAME_LENGTH,
  NO_WORKSPACE_ERROR,
  toolFail,
  toolOk,
  type ChatConnectorCallContext,
  type ChatConnectorToolDeps,
  type ChatConnectorToolResult
} from './chat-connector-tool-context'
import { archiveThreads, deleteThreads, renameThread } from './chat-connector-thread-tools'
import {
  createWorkspaceFromChat,
  listWorkspaces,
  moveChatToWorkspace
} from './chat-connector-workspace-tools'

export type { ChatConnectorToolDeps, ChatConnectorToolResult } from './chat-connector-tool-context'

function getSettings(ctx: ChatConnectorCallContext): ChatConnectorToolResult {
  const { workspace } = ctx
  if (!workspace) {
    return toolFail(NO_WORKSPACE_ERROR)
  }
  const threads = ctx.scopedThreads
  const settings = {
    workspaceId: workspace.id,
    name: workspace.name,
    color: workspace.color ?? null,
    notes: workspace.notes ?? null,
    urls: workspace.urls ?? [],
    clientEmails: workspace.clientEmails ?? [],
    directories: workspace.directories,
    defaultModel: ctx.deps.getDefaultModel() ?? 'CLI default (no explicit model set)',
    threadCount: threads.length,
    archivedThreadCount: threads.filter((t) => t.archived === true).length
  }
  return toolOk(JSON.stringify(settings, null, 2))
}

function listThreads(ctx: ChatConnectorCallContext): ChatConnectorToolResult {
  const rows = ctx.scopedThreads.map((t) => ({
    id: t.id,
    title: t.title,
    archived: t.archived === true,
    lastActivityAt: t.lastActivityAt,
    ...(t.id === ctx.thread.id ? { isCurrentChat: true } : {})
  }))
  return toolOk(JSON.stringify(rows, null, 2))
}

function updateSettings(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatConnectorToolResult {
  const { workspace, deps } = ctx
  if (!workspace) {
    return toolFail(NO_WORKSPACE_ERROR)
  }
  const patch: ChatWorkspacePatch = {}
  const changed: string[] = []
  if (args.name !== undefined) {
    const name =
      typeof args.name === 'string'
        ? args.name.trim().slice(0, MAX_CHAT_CONNECTOR_NAME_LENGTH)
        : ''
    if (name === '') {
      return toolFail('name must be a non-empty string.')
    }
    patch.name = name
    changed.push(`name → "${name}"`)
  }
  if (args.notes !== undefined) {
    if (typeof args.notes !== 'string') {
      return toolFail('notes must be a string (empty string clears).')
    }
    patch.notes = normalizeChatWorkspaceNotes(args.notes) ?? ''
    changed.push(patch.notes === '' ? 'notes cleared' : 'notes updated')
  }
  if (args.urls !== undefined) {
    if (!Array.isArray(args.urls)) {
      return toolFail('urls must be an array of strings.')
    }
    patch.urls = normalizeChatWorkspaceUrls(args.urls)
    changed.push(`urls → ${patch.urls.length} entr${patch.urls.length === 1 ? 'y' : 'ies'}`)
  }
  if (args.clientEmails !== undefined) {
    if (!Array.isArray(args.clientEmails)) {
      return toolFail('clientEmails must be an array of strings.')
    }
    patch.clientEmails = normalizeChatWorkspaceEmails(args.clientEmails)
    changed.push(`client emails → ${patch.clientEmails.length}`)
  }
  if (args.color !== undefined) {
    const color = normalizeRepoBadgeColor(args.color)
    if (color === null) {
      return toolFail('color must be a hex color like #e5484d.')
    }
    patch.color = color
    changed.push(`color → ${color}`)
  }
  if (changed.length === 0) {
    return toolFail('Nothing to update: provide name, notes, urls, clientEmails, or color.')
  }
  if (!deps.updateWorkspace(workspace.id, patch)) {
    return toolFail('The workspace could not be updated (it may have been deleted).')
  }
  deps.broadcastChange()
  return toolOk(`Updated workspace settings: ${changed.join(', ')}.`)
}

function setDirectories(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatConnectorToolResult {
  const { workspace, deps } = ctx
  if (!workspace) {
    return toolFail(NO_WORKSPACE_ERROR)
  }
  const raw = args.directories
  if (!Array.isArray(raw) || raw.some((d) => typeof d !== 'string' || d === '')) {
    return toolFail('directories must be an array of non-empty absolute paths.')
  }
  const directories = raw as string[]
  const missing = directories.filter((dir) => !deps.directoryExists(dir))
  if (missing.length > 0) {
    return toolFail(`These paths do not exist or are not directories: ${missing.join(', ')}`)
  }
  if (!deps.updateWorkspace(workspace.id, { directories })) {
    return toolFail('The workspace could not be updated (it may have been deleted).')
  }
  deps.broadcastChange()
  return toolOk(
    `Workspace folders set to: ${directories.join(', ') || '(none)'}. This takes effect on newly launched chats — existing chat sessions keep their original folders.`
  )
}

async function setDefaultModel(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): Promise<ChatConnectorToolResult> {
  const model = typeof args.model === 'string' ? args.model.trim() : ''
  if (model === '') {
    return toolFail('model must be a non-empty model id string.')
  }
  const known = Object.keys(await ctx.deps.listLearnedModels())
  if (!known.includes(model)) {
    return toolFail(
      known.length > 0
        ? `Unknown model "${model}". Models this app has seen: ${known.join(', ')}`
        : `Unknown model "${model}", and the app has not learned any model ids yet.`
    )
  }
  ctx.deps.setDefaultModel(model)
  return toolOk(
    `Default chat model set to ${model}. It applies to new chats and to this chat after a relaunch.`
  )
}

export async function callChatConnectorTool(args: {
  name: string
  args: Record<string, unknown>
  threadId: string
  deps: ChatConnectorToolDeps
}): Promise<ChatConnectorToolResult> {
  const state = args.deps.getChatState()
  const thread = state.threads.find((t) => t.id === args.threadId)
  if (!thread) {
    return toolFail('This chat no longer exists in the app, so muster tools are unavailable.')
  }
  const workspace =
    thread.workspaceId !== null
      ? (state.workspaces.find((w) => w.id === thread.workspaceId) ?? null)
      : null
  const ctx: ChatConnectorCallContext = {
    deps: args.deps,
    thread,
    workspace,
    scopedThreads: state.threads.filter((t) => t.workspaceId === thread.workspaceId)
  }
  try {
    switch (args.name) {
      case 'workspace_get_settings':
        return getSettings(ctx)
      case 'list_threads':
        return listThreads(ctx)
      case 'workspace_update_settings':
        return updateSettings(ctx, args.args)
      case 'workspace_set_directories':
        return setDirectories(ctx, args.args)
      case 'set_default_model':
        return await setDefaultModel(ctx, args.args)
      case 'rename_thread':
        return renameThread(ctx, args.args)
      case 'archive_threads':
        return archiveThreads(ctx, args.args)
      case 'delete_threads':
        return await deleteThreads(ctx, args.args)
      case 'list_workspaces':
        return listWorkspaces(ctx)
      case 'move_chat_to_workspace':
        return moveChatToWorkspace(ctx, args.args)
      case 'create_workspace_from_chat':
        return createWorkspaceFromChat(ctx, args.args)
      default:
        return toolFail(`Unknown tool "${args.name}".`)
    }
  } catch (error) {
    return toolFail(error instanceof Error ? error.message : String(error))
  }
}
