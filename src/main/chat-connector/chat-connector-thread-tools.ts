// Thread-scoped muster tools: rename, archive, and (confirm-gated) delete.
// Everything operates only on threads sharing the caller's workspace scope.

import type { ChatThread } from '../../shared/chat-mode-types'
import {
  MAX_CHAT_CONNECTOR_TITLE_LENGTH,
  toolFail,
  toolOk,
  type ChatConnectorCallContext,
  type ChatConnectorToolResult
} from './chat-connector-tool-context'

const DELETE_SUMMARY_TITLE_LIMIT = 5

export function renameThread(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatConnectorToolResult {
  const title =
    typeof args.title === 'string'
      ? args.title.trim().slice(0, MAX_CHAT_CONNECTOR_TITLE_LENGTH)
      : ''
  if (title === '') {
    return toolFail('title must be a non-empty string.')
  }
  const targetId = typeof args.threadId === 'string' ? args.threadId : ctx.thread.id
  const target = ctx.scopedThreads.find((t) => t.id === targetId)
  if (!target) {
    return toolFail(`No thread "${targetId}" in this chat's scope.`)
  }
  if (!ctx.deps.updateThread(target.id, { title })) {
    return toolFail('The thread could not be renamed (it may have been deleted).')
  }
  ctx.deps.broadcastChange()
  return toolOk(`Renamed "${target.title}" to "${title}".`)
}

export function archiveThreads(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatConnectorToolResult {
  const ids = Array.isArray(args.threadIds)
    ? args.threadIds.filter((id): id is string => typeof id === 'string')
    : []
  if (ids.length === 0) {
    return toolFail('threadIds must be a non-empty array of thread ids.')
  }
  const archived = args.archived !== false
  const scopeIds = new Set(ctx.scopedThreads.map((t) => t.id))
  const outOfScope = ids.filter((id) => !scopeIds.has(id))
  if (outOfScope.length > 0) {
    return toolFail(`These threads are not in this chat's scope: ${outOfScope.join(', ')}`)
  }
  for (const id of ids) {
    ctx.deps.updateThread(id, { archived })
  }
  ctx.deps.broadcastChange()
  return toolOk(
    `${archived ? 'Archived' : 'Unarchived'} ${ids.length} chat${ids.length === 1 ? '' : 's'}.`
  )
}

function deleteTargets(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): ChatThread[] | string {
  const ids = Array.isArray(args.threadIds)
    ? args.threadIds.filter((id): id is string => typeof id === 'string')
    : null
  const olderThanDays = typeof args.olderThanDays === 'number' ? args.olderThanDays : null
  if (ids === null && olderThanDays === null) {
    return 'Provide threadIds or olderThanDays.'
  }
  if (olderThanDays !== null && (!Number.isFinite(olderThanDays) || olderThanDays < 0)) {
    return 'olderThanDays must be a non-negative number.'
  }
  let targets = ctx.scopedThreads
  if (ids !== null) {
    const wanted = new Set(ids)
    targets = targets.filter((t) => wanted.has(t.id))
  }
  if (olderThanDays !== null) {
    const cutoff = Date.now() - olderThanDays * 86_400_000
    targets = targets.filter((t) => t.lastActivityAt <= cutoff)
  }
  // The calling thread is never deletable — it would kill its own session mid-call.
  return targets.filter((t) => t.id !== ctx.thread.id)
}

export async function deleteThreads(
  ctx: ChatConnectorCallContext,
  args: Record<string, unknown>
): Promise<ChatConnectorToolResult> {
  const targets = deleteTargets(ctx, args)
  if (typeof targets === 'string') {
    return toolFail(targets)
  }
  if (targets.length === 0) {
    return toolFail('No matching chats to delete (the current chat is never deleted).')
  }
  const titles = targets.slice(0, DELETE_SUMMARY_TITLE_LIMIT).map((t) => `"${t.title}"`)
  const extra = targets.length - titles.length
  const summary = `Delete ${targets.length} chat${targets.length === 1 ? '' : 's'}${
    ctx.workspace ? ` in "${ctx.workspace.name}"` : ''
  }: ${titles.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`
  const confirmed = await ctx.deps.confirm({ threadId: ctx.thread.id, summary })
  if (!confirmed) {
    return toolFail('The user did not confirm the deletion. Nothing was deleted.')
  }
  // Re-resolve after the (possibly long) confirm wait — threads may be gone.
  const liveIds = new Set(ctx.deps.getChatState().threads.map((t) => t.id))
  let deleted = 0
  for (const target of targets) {
    if (!liveIds.has(target.id)) {
      continue
    }
    ctx.deps.stopThreadStream(target.id)
    if (ctx.deps.deleteThread(target.id)) {
      deleted += 1
    }
  }
  ctx.deps.broadcastChange()
  return toolOk(`Deleted ${deleted} chat${deleted === 1 ? '' : 's'}.`)
}
