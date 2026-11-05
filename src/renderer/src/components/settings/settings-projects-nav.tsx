import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search, Server, X } from 'lucide-react'
import type { RepoIcon } from '../../../../shared/repo-icon'
import type { SettingsNavIcon } from '@/lib/settings-navigation-types'
import type { GitHubRepositoryIdentity } from '../../../../shared/types'
import { cn } from '@/lib/utils'
import { RepoIconGlyph } from '../repo/repo-icon'
import { RepoForkIndicator } from '../repo/repo-fork-indicator'
import { Button } from '../ui/button'
import { SEARCH_FIELD_INPUT, SEARCH_FIELD_SHELL } from '../ui/input'
import { translate } from '@/i18n/i18n'

export type RepoNavSection = {
  id: string
  title: string
  icon: SettingsNavIcon
  badgeColor?: string
  isRemote?: boolean
  repoIcon?: RepoIcon | null
  upstream?: GitHubRepositoryIdentity | null
}

type NavModifiers = { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

// Long project lists only get a filter once scanning by eye stops working.
const FILTER_THRESHOLD = 8
// Expanded, the group shows this many (plus the active one) until "Show all".
const PREVIEW_COUNT = 12

/** Projects group of the Settings nav: collapsed to a counted header so hundreds of repos don't bury the rest. */
export function SettingsProjectsNav({
  activeSectionId,
  repoSections,
  hasRepos,
  searchQuery,
  navItemClassName,
  onSelectSection
}: {
  activeSectionId: string
  repoSections: RepoNavSection[]
  hasRepos: boolean
  searchQuery: string
  navItemClassName: (isActive: boolean) => string
  onSelectSection: (sectionId: string, modifiers: NavModifiers) => void
}): React.JSX.Element {
  const activeIsProject = activeSectionId.startsWith('repo-')
  const [open, setOpen] = useState(activeIsProject)
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const searching = searchQuery.trim() !== ''
  const expanded = open || searching

  useEffect(() => {
    if (activeIsProject) {
      setOpen(true)
    }
  }, [activeIsProject])

  const needle = filter.trim().toLowerCase()
  const truncated = !searching && !needle && !showAll && repoSections.length > PREVIEW_COUNT
  const visibleSections = useMemo(() => {
    if (needle && !searching) {
      return repoSections.filter((section) => section.title.toLowerCase().includes(needle))
    }
    if (!truncated) {
      return repoSections
    }
    const preview = repoSections.slice(0, PREVIEW_COUNT)
    const active = repoSections.find((section) => section.id === activeSectionId)
    return active && !preview.includes(active) ? [...preview, active] : preview
  }, [activeSectionId, needle, repoSections, searching, truncated])

  const showFilter = expanded && !searching && repoSections.length > FILTER_THRESHOLD

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={expanded}
        disabled={searching}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground outline-none transition-colors hover:text-worktree-sidebar-foreground focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring disabled:cursor-default disabled:hover:text-muted-foreground"
      >
        <span>{translate('auto.components.settings.SettingsSidebar.5c9669ff9c', 'Projects')}</span>
        <span className="tracking-normal tabular-nums">{repoSections.length}</span>
        <ChevronRight
          aria-hidden
          className={cn(
            'ml-auto size-3.5 transition-transform duration-150',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {expanded ? (
        <>
          {showFilter ? (
            <div className={SEARCH_FIELD_SHELL}>
              <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label={translate(
                  'auto.components.settings.SettingsProjectsNav.filter',
                  'Filter projects'
                )}
                placeholder={translate(
                  'auto.components.settings.SettingsProjectsNav.filter',
                  'Filter projects'
                )}
                className={SEARCH_FIELD_INPUT}
              />
              {filter ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate(
                    'auto.components.settings.SettingsProjectsNav.clearFilter',
                    'Clear filter'
                  )}
                  onClick={() => setFilter('')}
                  className="-mr-1.5 size-5 text-muted-foreground"
                >
                  <X />
                </Button>
              ) : null}
            </div>
          ) : null}

          {visibleSections.length > 0 ? (
            <div className="space-y-1">
              {visibleSections.map((section) => {
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
                    <RepoIconGlyph
                      repoIcon={section.repoIcon}
                      color={section.badgeColor}
                      className="size-4 shrink-0 text-muted-foreground"
                      iconClassName="size-3.5"
                    />
                    <span className="truncate">{section.title}</span>
                    <RepoForkIndicator upstream={section.upstream} />
                    {section.isRemote && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <Server className="size-3" />
                        {translate('auto.components.settings.SettingsSidebar.e0900f83e7', 'SSH')}
                      </span>
                    )}
                  </button>
                )
              })}
              {truncated ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className={cn(navItemClassName(false), 'text-muted-foreground')}
                >
                  {translate(
                    'auto.components.settings.SettingsProjectsNav.showAll',
                    'Show all {{value0}}',
                    { value0: repoSections.length }
                  )}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="px-3 text-xs text-muted-foreground">
              {hasRepos
                ? translate(
                    'auto.components.settings.SettingsSidebar.3e483e256b',
                    'No matching project settings.'
                  )
                : translate(
                    'auto.components.settings.SettingsSidebar.df38d612b7',
                    'No projects added yet.'
                  )}
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}
