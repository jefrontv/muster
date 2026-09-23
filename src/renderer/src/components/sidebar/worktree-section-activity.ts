import type { AppState } from '@/store/types'
import { resolveWorktreeStatus } from '@/lib/worktree-status'
import type {
  FolderWorkspace,
  ProjectGroup,
  Repo,
  TerminalPaneLayoutNode,
  TerminalTab,
  Worktree,
  WorkspaceStatusDefinition
} from '../../../../shared/types'
import {
  getGroupKeysForWorktree,
  getProjectGroupHeaderKey,
  type ProjectGroupingModel,
  type WorktreeGroupBy,
  PINNED_GROUP_KEY
} from './worktree-list-groups'
import {
  selectLivePtyIdsForWorktree,
  selectRuntimePaneTitlesForWorktree,
  selectTerminalLayoutRootsForWorktrees
} from './worktree-card-status-inputs'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { selectWorktreeAgentActivitySummary } from './worktree-agent-activity-summary'
import type { BrowserActivityTab } from './visible-worktree-activity-inputs'

export type WorktreeSectionActivityState = Pick<
  AppState,
  | 'ptyIdsByTabId'
  | 'runtimePaneTitlesByTabId'
  | 'agentStatusEpoch'
  | 'agentStatusByPaneKey'
  | 'migrationUnsupportedByPtyId'
  | 'retainedAgentsByPaneKey'
> & {
  tabsByWorktree: Record<string, readonly Pick<TerminalTab, 'id' | 'title'>[]>
  browserTabsByWorktree: Record<string, readonly BrowserActivityTab[]>
  terminalLayoutRootsByTabId: Record<string, TerminalPaneLayoutNode | null | undefined>
}

export type WorktreeSectionActivitySummary = {
  runningCount: number
  /** Waiting, blocked or permission-seeking worktrees. */
  attentionCount: number
}

export const EMPTY_WORKTREE_SECTION_ACTIVITY: WorktreeSectionActivitySummary = {
  runningCount: 0,
  attentionCount: 0
}

type SectionGroupingArgs = {
  groupBy: WorktreeGroupBy
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  prCache: Record<string, unknown> | null
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  settings?: AppState['settings']
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
  folderWorkspaces?: readonly FolderWorkspace[]
  /** Only collect ids for these section keys. */
  sectionKeys?: ReadonlySet<string>
  /** Single-location pinning renders pinned worktrees only under the pinned header. */
  pinnedOnlyInPinnedSection?: boolean
}

export function groupWorktreeIdsBySection({
  groupBy,
  worktrees,
  repoMap,
  prCache,
  workspaceStatuses,
  settings,
  projectGroups,
  projectGrouping,
  folderWorkspaces = [],
  sectionKeys,
  pinnedOnlyInPinnedSection = false
}: SectionGroupingArgs): Map<string, string[]> {
  const idsBySection = new Map<string, string[]>()
  const add = (groupKey: string, worktreeId: string): void => {
    if (sectionKeys && !sectionKeys.has(groupKey)) {
      return
    }
    const ids = idsBySection.get(groupKey)
    if (ids) {
      ids.push(worktreeId)
    } else {
      idsBySection.set(groupKey, [worktreeId])
    }
  }

  for (const worktree of worktrees) {
    if (worktree.isPinned) {
      add(PINNED_GROUP_KEY, worktree.id)
      if (pinnedOnlyInPinnedSection) {
        continue
      }
    }
    for (const groupKey of getGroupKeysForWorktree(
      groupBy,
      worktree,
      repoMap,
      prCache,
      workspaceStatuses,
      settings,
      projectGroups,
      projectGrouping
    )) {
      add(groupKey, worktree.id)
    }
  }

  if (groupBy === 'repo' && folderWorkspaces.length > 0) {
    const groupsById = new Map(projectGroups.map((group) => [group.id, group]))
    for (const folderWorkspace of folderWorkspaces) {
      const visited = new Set<string>()
      let groupId: string | null = folderWorkspace.projectGroupId
      // Why: folder workspaces count toward every ancestor group, like repo worktrees.
      while (groupId && !visited.has(groupId) && groupsById.has(groupId)) {
        visited.add(groupId)
        add(getProjectGroupHeaderKey(groupId), folderWorkspaceKey(folderWorkspace.id))
        groupId = groupsById.get(groupId)?.parentGroupId ?? null
      }
    }
  }
  return idsBySection
}

export function summarizeWorktreeSectionActivity(
  state: WorktreeSectionActivityState,
  worktreeIds: readonly string[]
): WorktreeSectionActivitySummary {
  const summary = { ...EMPTY_WORKTREE_SECTION_ACTIVITY }
  for (const worktreeId of worktreeIds) {
    const status = getSectionWorktreeStatus(state, worktreeId)
    if (status === 'working') {
      summary.runningCount++
    } else if (status === 'permission') {
      summary.attentionCount++
    }
  }
  return summary
}

type SectionActivityStoreState = Pick<
  AppState,
  | 'tabsByWorktree'
  | 'browserTabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'ptyIdsByTabId'
  | 'runtimePaneTitlesByTabId'
  | 'agentStatusEpoch'
  | 'agentStatusByPaneKey'
  | 'migrationUnsupportedByPtyId'
  | 'retainedAgentsByPaneKey'
>

/** Store selector for one collapsed section; compare the result shallowly. */
export function selectWorktreeSectionActivity(
  state: SectionActivityStoreState,
  worktreeIds: readonly string[]
): WorktreeSectionActivitySummary {
  return summarizeWorktreeSectionActivity(
    {
      tabsByWorktree: state.tabsByWorktree,
      browserTabsByWorktree: state.browserTabsByWorktree,
      terminalLayoutRootsByTabId: selectTerminalLayoutRootsForWorktrees(state, worktreeIds),
      ptyIdsByTabId: state.ptyIdsByTabId,
      runtimePaneTitlesByTabId: state.runtimePaneTitlesByTabId,
      agentStatusEpoch: state.agentStatusEpoch,
      agentStatusByPaneKey: state.agentStatusByPaneKey,
      migrationUnsupportedByPtyId: state.migrationUnsupportedByPtyId,
      retainedAgentsByPaneKey: state.retainedAgentsByPaneKey
    },
    worktreeIds
  )
}

export function buildWorktreeSectionActivitySummaries({
  state,
  ...groupingArgs
}: SectionGroupingArgs & {
  state: WorktreeSectionActivityState
}): Map<string, WorktreeSectionActivitySummary> {
  const summaries = new Map<string, WorktreeSectionActivitySummary>()
  for (const [groupKey, worktreeIds] of groupWorktreeIdsBySection(groupingArgs)) {
    summaries.set(groupKey, summarizeWorktreeSectionActivity(state, worktreeIds))
  }
  return summaries
}

function getSectionWorktreeStatus(
  state: WorktreeSectionActivityState,
  worktreeId: string
): ReturnType<typeof resolveWorktreeStatus> {
  const agentSummary = selectWorktreeAgentActivitySummary(state, worktreeId)

  // Why: collapsed headers must mirror the card dot semantics exactly; otherwise
  // a hidden section can advertise different activity than its visible cards.
  return resolveWorktreeStatus({
    tabs: state.tabsByWorktree[worktreeId] ?? [],
    browserTabs: state.browserTabsByWorktree[worktreeId] ?? [],
    ptyIdsByTabId: selectLivePtyIdsForWorktree(state, worktreeId),
    runtimePaneTitlesByTabId: selectRuntimePaneTitlesForWorktree(state, worktreeId),
    agentStatusPaneIdsByTabId: agentSummary.agentStatusPaneIdsByTabId,
    terminalLayoutRootsByTabId: state.terminalLayoutRootsByTabId,
    hasPermission: agentSummary.hasPermission,
    hasLiveWorking: agentSummary.hasLiveWorking,
    hasLiveDone: agentSummary.hasLiveDone,
    hasRetainedDone: agentSummary.hasRetainedDone
  })
}
