import type { CSSProperties, RefObject } from 'react'
import { SECTION_LABEL } from '../ui/section-label-classes'
import { Badge } from '@/components/ui/badge'
import { useMemo } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import type { SettingsNavIcon, SettingsNavInstallStatus } from '@/lib/settings-navigation-types'
import type { GlobalSettings } from '../../../../shared/types'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '../ShortcutKeyCombo'
import { cn } from '@/lib/utils'
import { SettingsProjectsNav } from './settings-projects-nav'
import type { RepoNavSection } from './settings-projects-nav'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { SetupGuideProgressRing } from '../setup-guide/SetupGuideProgressRing'
import { useSettingsSetupGuideProgress } from './settings-setup-guide-progress'
import type { SettingsSetupGuideProgress } from './settings-setup-guide-progress'
import { translate } from '@/i18n/i18n'
import { resolveLeftSidebarStyleVariables } from '@/lib/left-sidebar-appearance'
import { useSystemPrefersDark } from '../terminal-pane/use-system-prefers-dark'

type NavSection = {
  id: string
  title: string
  icon: SettingsNavIcon
  badge?: string
  installStatus?: SettingsNavInstallStatus
}

type NavGroup = {
  id: string
  title: string
  sections: NavSection[]
}

type SettingsSidebarProps = {
  activeSectionId: string
  settings: GlobalSettings | null
  generalGroups: NavGroup[]
  repoSections: RepoNavSection[]
  hasRepos: boolean
  searchQuery: string
  searchInputRef?: RefObject<HTMLInputElement | null>
  onBack: () => void
  onSearchChange: (query: string) => void
  onSelectSection: (
    sectionId: string,
    modifiers: {
      metaKey: boolean
      ctrlKey: boolean
      shiftKey: boolean
      altKey: boolean
    }
  ) => void
}

type SettingsSetupGuideRowProps = {
  progress: SettingsSetupGuideProgress
  setupActive: boolean
  onSelect: (modifiers: {
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
  }) => void
}

function SettingsSetupGuideNavRow({
  progress,
  setupActive,
  onSelect
}: SettingsSetupGuideRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-current={setupActive ? 'page' : undefined}
      aria-label={translate(
        'auto.components.settings.SettingsSidebar.setupGuideAria',
        'Setup guide, {{value0}} of {{value1}} done. Show setup guide.',
        { value0: progress.doneCount, value1: progress.total }
      )}
      onClick={(event) =>
        onSelect({
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey
        })
      }
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring',
        setupActive
          ? 'bg-worktree-sidebar-accent font-medium text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground'
      )}
    >
      <SetupGuideProgressRing
        done={progress.doneCount}
        total={progress.total}
        sizeClassName="size-4"
        tooltipLabel={`${progress.doneCount}/${progress.total} complete`}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium leading-4">
          {translate('auto.components.settings.SettingsSidebar.setupGuide', 'Setup guide')}
        </span>
      </span>
    </button>
  )
}

export function SettingsSidebar({
  activeSectionId,
  settings,
  generalGroups,
  repoSections,
  hasRepos,
  searchQuery,
  searchInputRef,
  onBack,
  onSearchChange,
  onSelectSection
}: SettingsSidebarProps): React.JSX.Element {
  const setupGuideProgress = useSettingsSetupGuideProgress(true)
  const systemPrefersDark = useSystemPrefersDark()
  const leftSidebarStyle = useMemo(
    () => resolveLeftSidebarStyleVariables(settings, systemPrefersDark),
    [settings, systemPrefersDark]
  ) as CSSProperties | undefined
  const setupActive = activeSectionId === 'setup-guide'
  // Why: "Hide from sidebar" only hides the top-left app sidebar prompt;
  // Settings should remain a stable place to reopen the checklist.
  const showSetupGuideTopRow =
    setupGuideProgress.ready && setupGuideProgress.doneCount < setupGuideProgress.total
  const searchShortcutCombos = useShortcutKeyComboDetails('settings.search')
  const navItemClassName = (isActive: boolean): string =>
    cn(
      'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring',
      isActive
        ? 'bg-worktree-sidebar-accent font-medium text-worktree-sidebar-accent-foreground ring-1 ring-worktree-sidebar-ring/25'
        : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-accent/60 hover:text-worktree-sidebar-foreground'
    )
  const installStatusLabel = (status: SettingsNavInstallStatus): string => {
    switch (status) {
      case 'install':
        return translate(
          'auto.components.settings.AgentSkillSetupPanel.5289300939',
          'Not installed'
        )
      case 'installed':
        return translate('auto.components.settings.AgentSkillSetupPanel.9fcebceb2a', 'Installed')
      case 'up-to-date':
        return translate('auto.components.skills.SkillFreshnessStatusPill.upToDate', 'Up to date')
      case 'update-available':
        return translate(
          'auto.components.skills.SkillFreshnessStatusPill.updateAvailable',
          'Update available'
        )
      case 'needs-attention':
        return translate(
          'auto.components.skills.SkillFreshnessStatusPill.needsAttention',
          'Needs attention'
        )
      case 'checking':
        return translate('auto.components.settings.AgentSkillSetupPanel.68a468752e', 'Checking…')
    }
  }
  const installStatusVariant = (
    status: SettingsNavInstallStatus
  ): 'success' | 'attention' | 'secondary' | 'muted' =>
    status === 'installed' || status === 'up-to-date'
      ? 'success'
      : status === 'update-available' || status === 'needs-attention'
        ? 'attention'
        : status === 'install'
          ? 'secondary'
          : 'muted'

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-r border-worktree-sidebar-border bg-worktree-sidebar"
      style={leftSidebarStyle}
    >
      <div className="border-b border-worktree-sidebar-border px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="w-full justify-start gap-2 text-[13px] text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          {translate('auto.components.settings.SettingsSidebar.60f8a673a7', 'Back to app')}
        </Button>
      </div>

      <div className="border-b border-worktree-sidebar-border px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={translate(
              'auto.components.settings.SettingsSidebar.dbceaa8840',
              'Search settings'
            )}
            className="pl-9 pr-14"
          />
          {searchQuery === '' ? (
            <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
              {searchShortcutCombos.map((combo) => (
                <ShortcutKeyCombo
                  key={combo.keys.join('-')}
                  keys={combo.keys}
                  doubleTap={combo.doubleTap}
                  className="inline-flex gap-0.5"
                  separatorClassName="text-[11px] text-muted-foreground"
                />
              ))}
            </span>
          ) : null}
        </div>
      </div>

      {showSetupGuideTopRow ? (
        <div className="border-b border-worktree-sidebar-border px-3 py-3">
          <SettingsSetupGuideNavRow
            progress={setupGuideProgress}
            setupActive={setupActive}
            onSelect={(modifiers) => onSelectSection('setup-guide', modifiers)}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-3 py-4">
        <div className="space-y-5">
          {generalGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              <p className={cn('px-3', SECTION_LABEL)}>{group.title}</p>
              <div className="space-y-1">
                {group.sections
                  .filter((section) => section.id !== 'setup-guide')
                  .map((section) => {
                    const Icon = section.icon
                    const isActive = activeSectionId === section.id

                    return (
                      <button
                        key={section.id}
                        aria-current={isActive ? 'page' : undefined}
                        data-current={isActive ? 'true' : undefined}
                        onClick={(event) =>
                          onSelectSection(section.id, {
                            metaKey: event.metaKey,
                            ctrlKey: event.ctrlKey,
                            shiftKey: event.shiftKey,
                            altKey: event.altKey
                          })
                        }
                        className={navItemClassName(isActive)}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{section.title}</span>
                        {section.installStatus ? (
                          <Badge
                            variant={installStatusVariant(section.installStatus)}
                            className="ml-auto"
                          >
                            {installStatusLabel(section.installStatus)}
                          </Badge>
                        ) : section.badge ? (
                          <Badge variant="muted" className="ml-auto">
                            {section.badge}
                          </Badge>
                        ) : null}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}

          <SettingsProjectsNav
            activeSectionId={activeSectionId}
            repoSections={repoSections}
            hasRepos={hasRepos}
            searchQuery={searchQuery}
            navItemClassName={navItemClassName}
            onSelectSection={onSelectSection}
          />
        </div>
      </div>
    </aside>
  )
}
