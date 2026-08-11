import React from 'react'
import {
  Bell,
  CalendarClock,
  Globe,
  LayoutDashboard,
  MessageCircleQuestion,
  Search
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import type { GlobalSettings } from '../../../../shared/types'
import { DASHBOARD_BUCKET_ORDER, type DashboardBucket } from '../../../../shared/dashboard-snapshot'
import { useAgentBucketCounts } from '@/components/dashboard/useAgentBucketCounts'
import { useActivityUnreadCount } from '@/components/activity/useActivityUnreadCount'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { SetupGuideSidebarEntry } from './SetupGuideSidebarEntry'
import { SidebarTaskNavButton } from './SidebarTaskNavButton'
import { HideSidebarMenu } from './sidebar-nav-controls'
import { ChatModeToggle } from '@/components/chat-mode/ChatModeToggle'
import { translate } from '@/i18n/i18n'

export { getSetupGuideSidebarEntryReady, shouldShowSetupGuideEntry } from './SetupGuideSidebarEntry'

export function shouldShowAgentsButton(
  settings: Pick<GlobalSettings, 'experimentalActivity'> | null | undefined
): boolean {
  return settings?.experimentalActivity === true
}

export function shouldShowAgentDashboardButton(
  settings: Pick<GlobalSettings, 'experimentalAgentDashboardPopout'> | null | undefined
): boolean {
  return settings?.experimentalAgentDashboardPopout === true
}

// Why: in-window is the default surface; only an explicit 'popout' choice opens
// the separate OS window.
function isAgentDashboardPopoutMode(
  settings: Pick<GlobalSettings, 'experimentalAgentDashboardMode'> | null | undefined
): boolean {
  return settings?.experimentalAgentDashboardMode === 'popout'
}

export function shouldShowAutomationsButton(
  settings: Pick<GlobalSettings, 'showAutomationsButton'> | null | undefined
): boolean {
  return settings?.showAutomationsButton !== false
}

const DASHBOARD_BUCKET_DOT_CLASS: Record<'working' | 'idle', string> = {
  working: 'bg-yellow-500',
  idle: 'bg-neutral-500/50'
}

// Shared chrome for Tasks / Automations / Agents / Sites so one row can't drift in height or type.
const SIDEBAR_NAV_ITEM_CLASS =
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium tracking-tight transition-colors'

function dashboardBucketLabel(bucket: DashboardBucket): string {
  switch (bucket) {
    case 'attention':
      return translate('dashboardPopout.bucket.attention', 'Needs You')
    case 'working':
      return translate('dashboardPopout.bucket.working', 'Working')
    case 'idle':
      return translate('dashboardPopout.bucket.idle', 'Idle')
  }
}

function DashboardBucketCounts({
  counts
}: {
  counts: Record<DashboardBucket, number>
}): React.JSX.Element | null {
  const active = DASHBOARD_BUCKET_ORDER.filter((bucket) => counts[bucket] > 0)
  if (active.length === 0) {
    return null
  }
  return (
    <span className="flex items-center gap-1.5">
      {active.map((bucket) => (
        <span
          key={bucket}
          aria-label={`${dashboardBucketLabel(bucket)}: ${counts[bucket]}`}
          className="inline-flex items-center gap-1 text-[10px] tabular-nums text-worktree-sidebar-foreground/55"
        >
          {bucket === 'attention' ? (
            <MessageCircleQuestion className="size-2.5 text-amber-500" aria-hidden />
          ) : (
            <span className={cn('size-1.5 rounded-full', DASHBOARD_BUCKET_DOT_CLASS[bucket])} />
          )}
          {counts[bucket]}
        </span>
      ))}
    </span>
  )
}

// Why: keep the dashboard's broad aggregate subscriptions out of SidebarNav so
// agent-status churn only updates this opt-in row, not the full navigation.
function AgentDashboardSidebarEntry(): React.JSX.Element {
  const dashboardBucketCounts = useAgentBucketCounts()
  const openAsPopout = useAppStore((s) => isAgentDashboardPopoutMode(s.settings))
  const drawerOpen = useAppStore((s) => s.agentDashboardDrawerOpen)
  const setAgentDashboardDrawerOpen = useAppStore((s) => s.setAgentDashboardDrawerOpen)

  return (
    <button
      type="button"
      onClick={() => {
        if (openAsPopout) {
          void window.api.dashboard.openPopout()
        } else {
          // Why: like the workspace board trigger, the entry toggles its
          // companion drawer — sidebar clicks do not auto-dismiss it.
          setAgentDashboardDrawerOpen(!drawerOpen)
        }
      }}
      className={cn(
        SIDEBAR_NAV_ITEM_CLASS,
        'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <LayoutDashboard
        className="size-4 shrink-0 text-worktree-sidebar-foreground/30"
        strokeWidth={1.75}
      />
      <span className="flex-1">{translate('dashboard.sidebar.label', 'Agent Dashboard')}</span>
      <DashboardBucketCounts counts={dashboardBucketCounts} />
    </button>
  )
}

const SidebarNav = React.memo(function SidebarNav() {
  // Why: this memo boundary needs its own language subscription, while
  // translate() preserves Orca's pseudo-localization behavior.
  useTranslation()
  const worktreePaletteShortcutCombos = useShortcutKeyComboDetails('worktree.palette')
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openActivityPage = useAppStore((s) => s.openActivityPage)
  const openSitesPage = useAppStore((s) => s.openSitesPage)
  const openModal = useAppStore((s) => s.openModal)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeView = useAppStore((s) => s.activeView)
  const showAgentsButton = useAppStore((s) => shouldShowAgentsButton(s.settings))
  const showAgentDashboardButton = useAppStore((s) => shouldShowAgentDashboardButton(s.settings))
  const showAutomationsButton = useAppStore((s) => shouldShowAutomationsButton(s.settings))
  const automationsActive = activeView === 'automations'
  const activityActive = activeView === 'activity'
  const sitesActive = activeView === 'sites'
  const activityUnreadCount = useActivityUnreadCount(showAgentsButton, 'sidebar-badge')
  const hideAutomationsButton = React.useCallback(() => {
    void updateSettings({ showAutomationsButton: false })
  }, [updateSettings])

  return (
    <div
      className="flex flex-col gap-0.5 px-2 pt-2 pb-1"
      data-contextual-tour-target="sidebar-navigation"
    >
      {/* px-1/pt-1 on top of the nav's px-2/pt-2 lands the toggle at the same
          12px inset the chat sidebar's p-3 gives it — no jump on mode switch.
          pb-2.5 + the parent's gap-0.5 (2px) makes the gap below 12px too, matching both the
          inset above and the chat sidebar's gap-3 under its own copy of this toggle. */}
      <div className="px-1 pt-1 pb-2.5 empty:hidden">
        <ChatModeToggle mode="code" />
      </div>
      <SetupGuideSidebarEntry />
      <button
        type="button"
        onClick={openSitesPage}
        aria-current={sitesActive ? 'page' : undefined}
        className={cn(
          SIDEBAR_NAV_ITEM_CLASS,
          sitesActive
            ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
            : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
        )}
      >
        <Globe
          className={cn('size-4 shrink-0', !sitesActive && 'text-worktree-sidebar-foreground/30')}
          strokeWidth={sitesActive ? 2.25 : 1.75}
        />
        <span className="flex-1">
          {translate('auto.components.sidebar.SidebarNav.sites', 'Sites')}
        </span>
      </button>
      <SidebarTaskNavButton />
      {showAutomationsButton ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              onClick={openAutomationsPage}
              aria-current={automationsActive ? 'page' : undefined}
              className={cn(
                SIDEBAR_NAV_ITEM_CLASS,
                automationsActive
                  ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
                  : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
              )}
            >
              <CalendarClock
                className={cn(
                  'size-4 shrink-0',
                  !automationsActive && 'text-worktree-sidebar-foreground/30'
                )}
                strokeWidth={automationsActive ? 2.25 : 1.75}
              />
              <span className="flex-1">
                {translate('auto.components.sidebar.SidebarNav.f323383e9a', 'Automations')}
              </span>
            </button>
          </ContextMenuTrigger>
          <HideSidebarMenu onHide={hideAutomationsButton} />
        </ContextMenu>
      ) : null}
      {showAgentDashboardButton ? <AgentDashboardSidebarEntry /> : null}
      {showAgentsButton ? (
        <button
          type="button"
          onClick={openActivityPage}
          aria-current={activityActive ? 'page' : undefined}
          className={cn(
            SIDEBAR_NAV_ITEM_CLASS,
            activityActive
              ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
              : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
          )}
        >
          <Bell
            className={cn(
              'size-4 shrink-0',
              !activityActive && 'text-worktree-sidebar-foreground/30'
            )}
            strokeWidth={activityActive ? 2.25 : 1.75}
          />
          <span className="flex-1">
            {translate('auto.components.sidebar.SidebarNav.9c95e1ce91', 'Agents')}
          </span>
          {activityUnreadCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
              {activityUnreadCount}
            </span>
          ) : null}
        </button>
      ) : null}
      {/* Why: Search is an action, not a destination — the hairline separates it from the stack of
          pages above so the two don't read as one list. */}
      <div
        role="separator"
        className="mx-1 mt-1.5 mb-1 border-t border-worktree-sidebar-border/70"
      />
      <button
        type="button"
        onClick={() => openModal('worktree-palette')}
        aria-label={translate(
          'auto.components.sidebar.SidebarNav.0c3395fd32',
          'Search worktrees and browser tabs'
        )}
        className="group relative flex h-8 w-full items-center rounded-md border border-worktree-sidebar-border/70 bg-worktree-sidebar-foreground/5 pl-7 pr-1.5 text-left text-[12px] font-medium tracking-tight text-worktree-sidebar-foreground/45 transition-colors hover:border-worktree-sidebar-border hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-worktree-sidebar-ring/50"
      >
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-worktree-sidebar-foreground/30"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">
          {translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
        </span>
        <span className="pointer-events-none ml-1.5 hidden shrink-0 items-center gap-1.5 group-hover:inline-flex group-focus-within:inline-flex">
          {worktreePaletteShortcutCombos.map((combo) => (
            <ShortcutKeyCombo
              key={combo.keys.join('-')}
              keys={combo.keys}
              doubleTap={combo.doubleTap}
              className="inline-flex gap-0.5"
              keyCapClassName="min-w-4 border-worktree-sidebar-border/80 bg-worktree-sidebar-foreground/8 px-1 py-px text-[9px] text-worktree-sidebar-foreground/55 shadow-none"
              separatorClassName="text-[9px] text-worktree-sidebar-foreground/45"
            />
          ))}
        </span>
      </button>
    </div>
  )
})

export default SidebarNav
