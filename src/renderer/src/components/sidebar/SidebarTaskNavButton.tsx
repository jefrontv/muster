import React from 'react'
import { EyeOff, Github, Gitlab, List } from 'lucide-react'
import { JiraIcon } from '@/components/icons/JiraIcon'
import { LinearIcon } from '@/components/icons/LinearIcon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { getTaskPresetQuery, PER_REPO_FETCH_LIMIT } from '@/lib/new-workspace'
import { getLocalPreflightContext, localPreflightContextKey } from '@/lib/local-preflight-context'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import {
  DEFAULT_TASK_SOURCE,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider,
  resolveVisibleTaskProvider
} from '../../../../shared/task-providers'
import { canBrowseSidebarTasks } from './sidebar-tasks-browse'

function HideTaskSidebarMenu({ onHide }: { onHide: () => void }): React.JSX.Element {
  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={onHide}>
        <EyeOff className="size-3.5" />
        {translate('auto.components.sidebar.SidebarNav.d599269755', 'Hide from sidebar')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function TaskProviderShortcut({
  canBrowseTasks,
  label,
  onOpen,
  children
}: {
  canBrowseTasks: boolean
  label: string
  onOpen: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span
      role={canBrowseTasks ? 'button' : undefined}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        if (!canBrowseTasks) {
          return
        }
        onOpen()
      }}
      className={cn(
        'rounded p-0.5 text-muted-foreground/70',
        canBrowseTasks ? 'transition-colors hover:text-foreground' : 'cursor-default'
      )}
      aria-label={canBrowseTasks ? label : undefined}
      aria-hidden={canBrowseTasks ? undefined : true}
    >
      {children}
    </span>
  )
}

export function SidebarTaskNavButton(): React.JSX.Element | null {
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeView = useAppStore((s) => s.activeView)
  const repos = useAppStore((s) => s.repos)
  const repoMap = useRepoMap()
  const activeCollabConfigured = useAppStore((s) => s.activeCollabStatus?.configured === true)
  const canBrowseTasks = canBrowseSidebarTasks({
    repos,
    activeCollabConfigured
  })
  const showTasksButton = useAppStore((s) => s.settings?.showTasksButton !== false)
  const rawVisibleTaskProviders = useAppStore((s) => s.settings?.visibleTaskProviders)
  const defaultTaskSource = useAppStore((s) => s.settings?.defaultTaskSource ?? DEFAULT_TASK_SOURCE)
  const preflightStatus = useAppStore((s) => s.preflightStatus)
  const preflightStatusChecked = useAppStore((s) => s.preflightStatusChecked)
  const preflightStatusContextKey = useAppStore((s) => s.preflightStatusContextKey)
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)
  const expectedPreflightContextKey = useAppStore((s) =>
    localPreflightContextKey(getLocalPreflightContext(s))
  )
  const linearStatus = useAppStore((s) => s.linearStatus)
  const linearStatusChecked = useAppStore((s) => s.linearStatusChecked)
  const checkLinearConnection = useAppStore((s) => s.checkLinearConnection)
  const activeCollabStatusChecked = useAppStore((s) => s.activeCollabStatusChecked)
  const checkActiveCollabConnection = useAppStore((s) => s.checkActiveCollabConnection)
  const prefetchWorkItems = useAppStore((s) => s.prefetchWorkItems)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const defaultTaskViewPreset = useAppStore((s) => s.settings?.defaultTaskViewPreset ?? 'all')
  // Both read defensively. This row renders inside the sidebar shell, which is mounted against
  // partial store stand-ins in several suites and hydrates progressively at runtime; a bare
  // `s.activeCollabUnread.total` took the whole sidebar down when the slice was absent. No badge
  // is the honest answer while the slice has not arrived.
  const activeCollabUnreadTotal = useAppStore((s) => s.activeCollabUnread?.total ?? 0)
  const watchActiveCollabUnread = useAppStore((s) => s.watchActiveCollabUnread)
  // Why here: this button is the only place the count is shown, and it is mounted for the whole
  // session, so the subscription's lifetime matches the badge's rather than the Tasks page's —
  // the badge has to move while the user is somewhere else entirely.
  React.useEffect(() => watchActiveCollabUnread?.(), [watchActiveCollabUnread])
  const preferredVisibleTaskProviders = React.useMemo(
    () => normalizeVisibleTaskProviders(rawVisibleTaskProviders),
    [rawVisibleTaskProviders]
  )
  const preflightStatusCurrent = preflightStatusContextKey === expectedPreflightContextKey
  const visibleTaskProviders = React.useMemo(
    () =>
      restoreAvailableDefaultTaskProvider(
        preferredVisibleTaskProviders,
        {
          gitlabInstalled: preflightStatusCurrent && preflightStatus?.glab?.installed === true,
          linearConnected: linearStatus.connected === true
        },
        defaultTaskSource
      ),
    [
      defaultTaskSource,
      linearStatus.connected,
      preferredVisibleTaskProviders,
      preflightStatusCurrent,
      preflightStatus?.glab?.installed
    ]
  )
  const resolvedDefaultTaskSource = React.useMemo(
    () => resolveVisibleTaskProvider(defaultTaskSource, visibleTaskProviders),
    [defaultTaskSource, visibleTaskProviders]
  )

  React.useEffect(() => {
    if (!preflightStatusChecked || !preflightStatusCurrent) {
      void refreshPreflightStatus()
    }
    if (!linearStatusChecked) {
      void checkLinearConnection()
    }
    if (!activeCollabStatusChecked) {
      void checkActiveCollabConnection?.()
    }
  }, [
    activeCollabStatusChecked,
    checkActiveCollabConnection,
    checkLinearConnection,
    linearStatusChecked,
    preflightStatusChecked,
    preflightStatusCurrent,
    refreshPreflightStatus
  ])

  const handlePrefetch = React.useCallback(() => {
    if (!canBrowseTasks || resolvedDefaultTaskSource !== 'github') {
      return
    }
    const activeRepo = activeRepoId ? (repoMap.get(activeRepoId) ?? null) : null
    const activeGitRepo = activeRepo && isGitRepoKind(activeRepo) ? activeRepo : null
    const firstGitRepo = activeGitRepo ?? repos.find((r) => isGitRepoKind(r))
    if (firstGitRepo?.path) {
      prefetchWorkItems(
        firstGitRepo.id,
        firstGitRepo.path,
        PER_REPO_FETCH_LIMIT,
        getTaskPresetQuery(defaultTaskViewPreset)
      )
    }
  }, [
    activeRepoId,
    canBrowseTasks,
    defaultTaskViewPreset,
    prefetchWorkItems,
    repoMap,
    repos,
    resolvedDefaultTaskSource
  ])

  const hideTasksButton = React.useCallback(() => {
    void updateSettings({ showTasksButton: false })
  }, [updateSettings])

  if (!showTasksButton) {
    return null
  }

  const tasksActive = activeView === 'tasks'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (!canBrowseTasks) {
              return
            }
            openTaskPage()
          }}
          onPointerEnter={handlePrefetch}
          onFocus={handlePrefetch}
          aria-disabled={!canBrowseTasks}
          aria-current={tasksActive ? 'page' : undefined}
          data-contextual-tour-target="sidebar-tasks"
          className={cn(
            // Why: h-8 matches Automations / Agents / Sites so the nav column doesn't jitter by row.
            'group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium tracking-tight transition-colors',
            tasksActive
              ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
              : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
            !canBrowseTasks && 'cursor-not-allowed opacity-50 hover:bg-transparent'
          )}
        >
          <List
            className={cn('size-4 shrink-0', !tasksActive && 'text-worktree-sidebar-foreground/30')}
            strokeWidth={tasksActive ? 2.25 : 1.75}
          />
          <span className="flex-1">
            {translate('auto.components.sidebar.SidebarNav.fee535205b', 'Tasks')}
          </span>
          <span className="hidden items-center gap-1 group-hover:flex group-focus-within:flex">
            {visibleTaskProviders.includes('github') ? (
              <TaskProviderShortcut
                canBrowseTasks={canBrowseTasks}
                label={translate(
                  'auto.components.sidebar.SidebarNav.0ccba862b8',
                  'Open GitHub tasks'
                )}
                onOpen={() => openTaskPage({ taskSource: 'github' })}
              >
                <Github className="size-3.5" aria-hidden />
              </TaskProviderShortcut>
            ) : null}
            {visibleTaskProviders.includes('gitlab') ? (
              <TaskProviderShortcut
                canBrowseTasks={canBrowseTasks}
                label={translate(
                  'auto.components.sidebar.SidebarNav.196c1b5362',
                  'Open GitLab tasks'
                )}
                onOpen={() => openTaskPage({ taskSource: 'gitlab' })}
              >
                <Gitlab className="size-3.5" aria-hidden />
              </TaskProviderShortcut>
            ) : null}
            {visibleTaskProviders.includes('linear') ? (
              <TaskProviderShortcut
                canBrowseTasks={canBrowseTasks}
                label={translate(
                  'auto.components.sidebar.SidebarNav.c39ab10000',
                  'Open Linear tasks'
                )}
                onOpen={() => openTaskPage({ taskSource: 'linear' })}
              >
                <LinearIcon className="size-3.5" />
              </TaskProviderShortcut>
            ) : null}
            {visibleTaskProviders.includes('jira') ? (
              <TaskProviderShortcut
                canBrowseTasks={canBrowseTasks}
                label={translate(
                  'auto.components.sidebar.SidebarNav.e7ad3c540d',
                  'Open Jira tasks'
                )}
                onOpen={() => openTaskPage({ taskSource: 'jira' })}
              >
                <JiraIcon className="size-3.5" />
              </TaskProviderShortcut>
            ) : null}
          </span>
          {activeCollabUnreadTotal > 0 ? (
            // Why not inside the hover-only shortcut strip: the whole point is to be visible
            // without hovering. Rendered only above zero — a "0" badge is noise that trains the
            // eye to ignore the spot where a real count will appear.
            //
            // Why last: it used to sit before the strip, so revealing the strip on hover pushed the
            // count sideways. Pinned to the end, the flex-1 label absorbs the strip's width and the
            // badge does not move.
            <span
              className="ml-1 shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary"
              aria-label={translate(
                'auto.components.sidebar.SidebarNav.activeCollabUnread',
                '{{value0}} unread ActiveCollab changes',
                { value0: String(activeCollabUnreadTotal) }
              )}
            >
              {activeCollabUnreadTotal > 9 ? '9+' : activeCollabUnreadTotal}
            </span>
          ) : null}
        </button>
      </ContextMenuTrigger>
      <HideTaskSidebarMenu onHide={hideTasksButton} />
    </ContextMenu>
  )
}
