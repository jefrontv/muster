// Rewrite worktree-keyed workspace session maps when a project path moves
// (LocalWP site shell → app/public). Kept separate from path resolution so the
// migrate module stays under the line budget.

import type { WorkspaceSessionState } from '../../shared/types'
import { parseWorkspaceKey, worktreeWorkspaceKey } from '../../shared/workspace-scope'

function rewriteWorktreeIdPrefix(
  worktreeId: string,
  previousPrefix: string,
  nextPrefix: string
): string {
  if (worktreeId === previousPrefix || worktreeId.startsWith(`${previousPrefix}::`)) {
    return `${nextPrefix}${worktreeId.slice(previousPrefix.length)}`
  }
  return worktreeId
}

function rewriteWorktreeKeyedRecord<T>(
  record: Record<string, T> | undefined,
  previousPrefix: string,
  nextPrefix: string
): Record<string, T> | undefined {
  if (!record) {
    return record
  }
  let changed = false
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    const rewritten = rewriteWorktreeIdPrefix(key, previousPrefix, nextPrefix)
    if (rewritten !== key) {
      changed = true
    }
    next[rewritten] = value
  }
  return changed ? next : record
}

/**
 * When a project path moves, worktree ids embed the path (`repoId::path`). Session state still
 * holds the old ids until hydration purge drops them — that is the flash of workspaces that then
 * vanish on startup. Rewrite session keys in lockstep with meta rekey.
 */
export function rewriteWorkspaceSessionWorktreePath(
  session: WorkspaceSessionState,
  previousPrefix: string,
  nextPrefix: string
): WorkspaceSessionState {
  if (previousPrefix === nextPrefix) {
    return session
  }
  const next = structuredClone(session)
  next.tabsByWorktree =
    rewriteWorktreeKeyedRecord(next.tabsByWorktree, previousPrefix, nextPrefix) ?? {}
  // Why: tab rows also stamp worktreeId; leave them pointing at the shell and they re-orphan.
  for (const tabs of Object.values(next.tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      if (typeof tab.worktreeId === 'string') {
        tab.worktreeId = rewriteWorktreeIdPrefix(tab.worktreeId, previousPrefix, nextPrefix)
      }
    }
  }
  next.openFilesByWorktree = rewriteWorktreeKeyedRecord(
    next.openFilesByWorktree,
    previousPrefix,
    nextPrefix
  )
  for (const files of Object.values(next.openFilesByWorktree ?? {})) {
    for (const file of files) {
      if (typeof file.worktreeId === 'string') {
        file.worktreeId = rewriteWorktreeIdPrefix(file.worktreeId, previousPrefix, nextPrefix)
      }
    }
  }
  next.activeFileIdByWorktree = rewriteWorktreeKeyedRecord(
    next.activeFileIdByWorktree,
    previousPrefix,
    nextPrefix
  )
  next.browserTabsByWorktree = rewriteWorktreeKeyedRecord(
    next.browserTabsByWorktree,
    previousPrefix,
    nextPrefix
  )
  next.activeBrowserTabIdByWorktree = rewriteWorktreeKeyedRecord(
    next.activeBrowserTabIdByWorktree,
    previousPrefix,
    nextPrefix
  )
  next.activeTabTypeByWorktree = rewriteWorktreeKeyedRecord(
    next.activeTabTypeByWorktree,
    previousPrefix,
    nextPrefix
  )
  next.activeTabIdByWorktree = rewriteWorktreeKeyedRecord(
    next.activeTabIdByWorktree,
    previousPrefix,
    nextPrefix
  )
  next.unifiedTabs = rewriteWorktreeKeyedRecord(next.unifiedTabs, previousPrefix, nextPrefix)
  next.tabGroups = rewriteWorktreeKeyedRecord(next.tabGroups, previousPrefix, nextPrefix)
  next.tabGroupLayouts = rewriteWorktreeKeyedRecord(
    next.tabGroupLayouts,
    previousPrefix,
    nextPrefix
  )
  next.activeGroupIdByWorktree = rewriteWorktreeKeyedRecord(
    next.activeGroupIdByWorktree,
    previousPrefix,
    nextPrefix
  )
  next.lastVisitedAtByWorktreeId = rewriteWorktreeKeyedRecord(
    next.lastVisitedAtByWorktreeId,
    previousPrefix,
    nextPrefix
  )
  next.defaultTerminalTabsAppliedByWorktreeId = rewriteWorktreeKeyedRecord(
    next.defaultTerminalTabsAppliedByWorktreeId,
    previousPrefix,
    nextPrefix
  )
  if (next.activeWorktreeId) {
    next.activeWorktreeId = rewriteWorktreeIdPrefix(
      next.activeWorktreeId,
      previousPrefix,
      nextPrefix
    )
  }
  if (next.activeWorkspaceKey) {
    const scope = parseWorkspaceKey(next.activeWorkspaceKey)
    if (scope?.type === 'worktree') {
      next.activeWorkspaceKey = worktreeWorkspaceKey(
        rewriteWorktreeIdPrefix(scope.worktreeId, previousPrefix, nextPrefix)
      )
    }
  }
  if (next.activeWorktreeIdsOnShutdown) {
    next.activeWorktreeIdsOnShutdown = next.activeWorktreeIdsOnShutdown.map((id) =>
      rewriteWorktreeIdPrefix(id, previousPrefix, nextPrefix)
    )
  }
  if (next.terminalSurfaceTombstonesByPaneKey) {
    for (const tombstone of Object.values(next.terminalSurfaceTombstonesByPaneKey)) {
      tombstone.worktreeId = rewriteWorktreeIdPrefix(
        tombstone.worktreeId,
        previousPrefix,
        nextPrefix
      )
    }
  }
  if (next.sleepingAgentSessionsByPaneKey) {
    for (const record of Object.values(next.sleepingAgentSessionsByPaneKey)) {
      record.worktreeId = rewriteWorktreeIdPrefix(record.worktreeId, previousPrefix, nextPrefix)
    }
  }
  return next
}
