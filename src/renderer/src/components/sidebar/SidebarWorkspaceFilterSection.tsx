import React from 'react'
import { CalendarClock, GitBranch, Moon } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { MENU_LABEL, MENU_ROW } from '@/components/ui/menu-surface-classes'
import { SwitchTrack } from '@/components/ui/switch'

const SidebarWorkspaceFilterSection = React.memo(function SidebarWorkspaceFilterSection() {
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const setShowSleepingWorkspaces = useAppStore((s) => s.setShowSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const hideAutomationGeneratedWorkspaces = useAppStore((s) => s.hideAutomationGeneratedWorkspaces)
  const setHideAutomationGeneratedWorkspaces = useAppStore(
    (s) => s.setHideAutomationGeneratedWorkspaces
  )

  return (
    <>
      <div className="flex items-center justify-between">
        <span className={MENU_LABEL}>
          {translate('auto.components.sidebar.SidebarWorkspaceFilterSection.82594419ba', 'Filters')}
        </span>
      </div>
      <FilterToggleRow
        icon={<Moon className="size-3.5" />}
        label={translate(
          'auto.components.sidebar.SidebarWorkspaceFilterSection.ed1611b65b',
          'Hide sleeping'
        )}
        checked={!showSleepingWorkspaces}
        onChange={(hideSleeping) => setShowSleepingWorkspaces(!hideSleeping)}
      />
      <FilterToggleRow
        icon={<GitBranch className="size-3.5" />}
        label={translate(
          'auto.components.sidebar.SidebarWorkspaceFilterSection.c3fa13dc2e',
          'Hide default branch'
        )}
        checked={hideDefaultBranchWorkspace}
        onChange={setHideDefaultBranchWorkspace}
      />
      <FilterToggleRow
        icon={<CalendarClock className="size-3.5" />}
        label={translate(
          'auto.components.sidebar.SidebarWorkspaceFilterSection.automationCreated',
          'Hide automation-created'
        )}
        checked={hideAutomationGeneratedWorkspaces}
        onChange={setHideAutomationGeneratedWorkspaces}
      />
    </>
  )
})

function FilterToggleRow({
  icon,
  label,
  checked,
  onChange
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        MENU_ROW,
        'w-full justify-between hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]'
      )}
    >
      <span className="inline-flex items-center gap-2 text-foreground">
        {icon}
        {label}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  )
}

export default SidebarWorkspaceFilterSection
