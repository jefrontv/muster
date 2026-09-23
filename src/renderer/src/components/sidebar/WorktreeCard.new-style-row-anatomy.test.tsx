import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import type { GlobalSettings, Repo, Worktree, WorktreeCardProperty } from '../../../../shared/types'
import type WorktreeCardComponent from './WorktreeCard'

let WorktreeCard: typeof WorktreeCardComponent
let settings: Partial<GlobalSettings> | null = null
let worktreeCardProperties: WorktreeCardProperty[] = ['status', 'inline-agents']
let sshConnectionStates = new Map<string, { status: string }>()
let mockInlineAgentRows: DashboardAgentRowData[] = []
let deleteModifierPressed = false

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      agentActivityDisplayMode: 'compact',
      deleteStateByWorktreeId: {},
      fetchHostedReviewForBranch: vi.fn(),
      fetchIssue: vi.fn(),
      fetchLinearIssue: vi.fn(),
      gitConflictOperationByWorktree: {},
      hostedReviewCache: {},
      issueCache: {},
      linearIssueCache: {},
      openModal: vi.fn(),
      projectGroups: [],
      remoteBranchConflictByWorktreeId: {},
      runtimeEnvironments: [],
      runtimeStatusByEnvironmentId: new Map(),
      removedSshTargetLabels: new Map(),
      settings,
      sshConnectionStates,
      sshStateByEnvironment: new Map(),
      sshTargetLabels: new Map(),
      sshTargetsHydrated: true,
      updateWorktreeMeta: vi.fn(),
      worktreesByRepo: {},
      worktreeCardProperties
    })
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockInlineAgentRows)
}))

vi.mock('./WorktreeCardAgents', () => ({
  default: ({ className }: { className?: string }) => (
    <div className={className} data-worktree-agents="" />
  )
}))

vi.mock('@/components/dashboard/useNow', () => ({
  useNow: vi.fn(() => 10 * 60_000)
}))

vi.mock('./workspace-delete-quick-action', () => ({
  canShowWorkspaceDeleteQuickAction: ({
    deleteModifierPressed: pressed
  }: {
    deleteModifierPressed: boolean
  }) => pressed,
  useWorkspaceDeleteModifierPressed: () => deleteModifierPressed
}))

vi.mock('./use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => 'idle'
}))

vi.mock('./SshDisconnectedDialog', () => ({
  SshDisconnectedDialog: () => null
}))

vi.mock('./WorktreeContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  CLOSE_ALL_CONTEXT_MENUS_EVENT: 'orca:test-close-context-menus',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-orca-context-menu-scope',
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu'
}))

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/repo',
    displayName: 'Repo',
    badgeColor: '#999999',
    addedAt: 1,
    ...overrides
  }
}

function makeWorktree(): Worktree {
  return {
    id: 'worktree-1',
    repoId: 'repo-1',
    path: '/repo/worktrees/one',
    displayName: 'Workspace one',
    branch: 'workspace-one',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1
  }
}

function makeAgent(startedAt: number): DashboardAgentRowData {
  return {
    startedAt,
    rowSource: 'live',
    state: 'working',
    entry: { state: 'working', stateStartedAt: startedAt }
  } as unknown as DashboardAgentRowData
}

function getTrailingCluster(markup: string): string {
  const start = markup.indexOf('data-worktree-card-trailing-cluster=""')
  expect(start).toBeGreaterThanOrEqual(0)
  return markup.slice(start, markup.indexOf('data-worktree-agents=""', start))
}

describe('WorktreeCard new-style row anatomy', () => {
  beforeAll(async () => {
    WorktreeCard = (await import('./WorktreeCard')).default
  }, 20_000)

  beforeEach(() => {
    settings = { experimentalNewWorktreeCardStyle: true }
    worktreeCardProperties = ['status', 'inline-agents']
    sshConnectionStates = new Map()
    mockInlineAgentRows = []
    deleteModifierPressed = false
  })

  it('shows the latest agent time in a fixed line-1 slot', () => {
    mockInlineAgentRows = [makeAgent(60_000), makeAgent(7 * 60_000)]

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
    )
    const cluster = getTrailingCluster(markup)

    expect(cluster).toContain('data-worktree-card-time-slot=""')
    expect(cluster).toContain('relative flex h-5 w-6 shrink-0')
    expect(cluster).toContain('text-[11px] leading-none tabular-nums')
    expect(cluster).toContain('>3m</span>')
    expect(cluster).not.toContain('data-has-action')
    expect(cluster).not.toContain('Delete workspace')
  })

  it('swaps the time for the delete action in the same slot on hover', () => {
    mockInlineAgentRows = [makeAgent(7 * 60_000)]
    deleteModifierPressed = true

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
    )
    const cluster = getTrailingCluster(markup)

    expect(cluster).toContain('data-has-action="true"')
    expect(cluster).toContain('group-hover/worktree-card:opacity-0')
    expect(cluster).toContain('aria-label="Delete workspace"')
    expect(cluster.indexOf('>3m</span>')).toBeLessThan(cluster.indexOf('Delete workspace'))
  })

  it('renders no time slot for rows without agent activity', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
    )

    expect(markup).not.toContain('data-worktree-card-time-slot')
  })

  it('moves the SSH host icon into the line-1 trailing cluster', () => {
    sshConnectionStates.set('ssh-1', { status: 'connected' })
    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree()}
        repo={makeRepo({ connectionId: 'ssh-1' })}
        isActive={false}
      />
    )
    const cluster = getTrailingCluster(markup)
    const titleIndex = markup.indexOf('Workspace one')

    expect(cluster).toContain('lucide-server size-3 text-worktree-sidebar-muted-foreground')
    expect(cluster).toContain('Project on SSH host')
    expect(markup.indexOf('Project on SSH host')).toBeGreaterThan(titleIndex)
  })

  it('keeps a disconnected SSH host destructive and the row dimmed', () => {
    sshConnectionStates.set('ssh-1', { status: 'disconnected' })

    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree()}
        repo={makeRepo({ connectionId: 'ssh-1' })}
        isActive={false}
      />
    )

    expect(getTrailingCluster(markup)).toContain('lucide-server-off size-3 text-destructive')
    expect(markup).toContain('opacity-60')
  })

  it('keeps the SSH icon before the title in the legacy card', () => {
    settings = null

    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree()}
        repo={makeRepo({ connectionId: 'ssh-1' })}
        isActive={false}
      />
    )

    expect(markup).not.toContain('data-worktree-card-trailing-cluster')
    expect(markup.indexOf('Project on SSH host')).toBeLessThan(markup.indexOf('Workspace one'))
  })

  it('leaves the active look to main.css in the new style', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive />
    )
    const surfaceTag = markup.slice(
      markup.lastIndexOf('<div', markup.indexOf('data-worktree-card-surface="true"')),
      markup.indexOf('>', markup.indexOf('data-worktree-card-surface="true"'))
    )

    expect(surfaceTag).toContain('data-worktree-card-style="new"')
    expect(surfaceTag).toContain('data-worktree-card-active="primary"')
    expect(surfaceTag).not.toContain('bg-black/[0.08]')
    expect(surfaceTag).not.toContain('shadow-[')
    expect(surfaceTag.split(/[\s"]/)).not.toContain('border')
    expect(surfaceTag).not.toContain('worktree-sidebar-card-hover')
  })

  it('keeps the legacy active classes when the new style is off', () => {
    settings = null

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive />
    )

    expect(markup).not.toContain('data-worktree-card-style')
    expect(markup).toContain('bg-black/[0.08]')
  })
})
