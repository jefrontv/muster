// Moving a chat between workspaces, and promoting a loose chat into a new one.
//
// A move only ever touches the caller's own thread by default, and the workspace
// brief was injected at first message — so a moved chat keeps the brief it
// started with until it is relaunched. Every result says so rather than letting
// the agent report a cleaner outcome than actually happened.

import type { ChatThread, ChatWorkspace } from '../../shared/chat-mode-types'
import {
  MAX_CHAT_CONNECTOR_NAME_LENGTH,
  toolFail,
  toolOk,
  type ChatConnectorCallContext,
  type ChatConnectorToolResult
} from './chat-connector-tool-context'

const RELAUNCH_NOTE =
  'The chat keeps its original working folder and workspace brief until it is relaunched.'

function describeWorkspace(workspace: ChatWorkspace, threads: ChatThread[]): object {
  return {
    id: workspace.id,
    name: workspace.name,
    directories: workspace.directories,
    threadCount: threads.filter((t) => t.workspaceId === workspace.id).length
  }
}

export function listWorkspaces(ctx: ChatConnectorCallContext): ChatConnectorToolResult {
  const state = ctx.deps.getChatState()
  const rows = state.workspaces.map((workspace) => ({
    ...describeWorkspace(workspace, state.threads),
    ...(workspace.id === ctx.thread.workspaceId ? { isCurrentWorkspace: true } : {})
  }))
  const standaloneCount = state.threads.filter((t) => t.workspaceId === null).length
  return toolOk(JSON.stringify({ workspaces: rows, standaloneChatCount: standaloneCount }, null, 2))
}

/** Resolves a target from an explicit id or a name, case-insensitively. */
function resolveTarget(
  workspaces: ChatWorkspace[],
  args: Record<string, unknown>
): { workspace: ChatWorkspace } | { error: string } {
  if (typeof args.workspaceId === 'string' && args.workspaceId.trim() !== '') {
    const byId = workspaces.find((w) => w.id === args.workspaceId)
    return byId ? { workspace: byId } : { error: `No workspace with id "${args.workspaceId}".` }
  }
  if (typeof args.workspaceName === 'string' && args.workspaceName.trim() !== '') {
    const wanted = args.workspaceName.trim().toLowerCase()
    const matches = workspaces.filter((w) => w.name.trim().toLowerCase() === wanted)
    if (matches.length === 1) {
      return { workspace: matches[0]! }
    }
    if (matches.length > 1) {
      // Names are not unique, so an ambiguous match must ask rather than guess.
      return {
        error: `More than one workspace is named "${args.workspaceName}". Use workspaceId; ids: ${matches
          .map((w) => w.id)
          .join(', ')}`
      }
    }
    const available = workspaces.map((w) => w.name).join(', ')
    return {
      error: `No workspace named "${args.workspaceName}".${available ? ` Existing workspaces: ${available}` : ''}`
    }
  }
  return { error: 'Provide workspaceId, workspaceName, or workspaceId: null to ungroup the chat.' }
}

export function moveChatToWorkspace(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatConnectorToolResult {
  const { deps } = ctx
  const state = deps.getChatState()
  const threadId = typeof args.threadId === 'string' ? args.threadId : ctx.thread.id
  const thread = state.threads.find((t) => t.id === threadId)
  if (!thread) {
    return toolFail(`No chat with id "${threadId}".`)
  }

  // Explicit null is the documented way to pull a chat back out to the ungrouped list.
  if (args.workspaceId === null) {
    if (thread.workspaceId === null) {
      return toolOk(`"${thread.title}" is already an ungrouped chat.`)
    }
    if (!deps.moveThread(thread.id, null)) {
      return toolFail('The chat could not be moved (it may have been deleted).')
    }
    deps.broadcastChange()
    return toolOk(`Moved "${thread.title}" out to the ungrouped Chats list. ${RELAUNCH_NOTE}`)
  }

  const resolved = resolveTarget(state.workspaces, args)
  if ('error' in resolved) {
    return toolFail(resolved.error)
  }
  if (thread.workspaceId === resolved.workspace.id) {
    return toolOk(`"${thread.title}" is already in "${resolved.workspace.name}".`)
  }
  if (!deps.moveThread(thread.id, resolved.workspace.id)) {
    return toolFail('The chat could not be moved (it or the workspace may have been deleted).')
  }
  deps.broadcastChange()
  return toolOk(`Moved "${thread.title}" into "${resolved.workspace.name}". ${RELAUNCH_NOTE}`)
}

export function createWorkspaceFromChat(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatConnectorToolResult {
  const { deps } = ctx
  const name =
    typeof args.name === 'string' ? args.name.trim().slice(0, MAX_CHAT_CONNECTOR_NAME_LENGTH) : ''
  if (name === '') {
    return toolFail('name must be a non-empty string.')
  }

  let directories: string[] = []
  if (args.directories !== undefined) {
    const raw = args.directories
    if (!Array.isArray(raw) || raw.some((d) => typeof d !== 'string' || d === '')) {
      return toolFail('directories must be an array of non-empty absolute paths.')
    }
    directories = raw as string[]
    const missing = directories.filter((dir) => !deps.directoryExists(dir))
    if (missing.length > 0) {
      return toolFail(`These paths do not exist or are not directories: ${missing.join(', ')}`)
    }
  } else {
    // Inherit the current workspace's folders so promoting a grouped chat does
    // not silently drop the working directory it was launched against.
    directories = ctx.workspace?.directories ?? []
  }

  const moveChat = args.moveChat !== false
  const workspace = deps.createWorkspace({ name, directories })
  if (!moveChat) {
    deps.broadcastChange()
    return toolOk(
      `Created workspace "${workspace.name}" (id ${workspace.id}). This chat was left where it is.`
    )
  }
  if (!deps.moveThread(ctx.thread.id, workspace.id)) {
    deps.broadcastChange()
    return toolFail(
      `Created workspace "${workspace.name}", but this chat could not be moved into it.`
    )
  }
  deps.broadcastChange()
  const folders = directories.length > 0 ? directories.join(', ') : 'none yet'
  return toolOk(
    `Created workspace "${workspace.name}" (folders: ${folders}) and moved this chat into it. ${RELAUNCH_NOTE}`
  )
}
