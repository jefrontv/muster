import type React from 'react'
import { Badge } from '@/components/ui/badge'
import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import type { SettingsSearchEntry } from './settings-search'
import { matchesSettingsSearch } from './settings-search'

// Why: avoids threading `activeSectionId` through every <SettingsSection /> call
// site in Settings.tsx — the page wraps its content tree in this provider.
const ActiveSettingsSectionContext = createContext<string | null>(null)

export const ActiveSettingsSectionProvider = ActiveSettingsSectionContext.Provider

// Why: Settings paints its shell before pane bodies mount; this marks that first frame.
const SettingsPanesPendingContext = createContext(false)

export const SettingsPanesPendingProvider = SettingsPanesPendingContext.Provider

function SettingsSectionSkeleton(): React.JSX.Element {
  return (
    <div aria-hidden className="space-y-5">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="h-3 w-40 animate-pulse rounded-full bg-foreground/[0.07]" />
            <div className="h-2.5 w-64 animate-pulse rounded-full bg-foreground/[0.05]" />
          </div>
          <div className="h-5 w-9 animate-pulse rounded-full bg-foreground/[0.07]" />
        </div>
      ))}
    </div>
  )
}

type SettingsSectionProps = {
  id: string
  title: string
  description: string
  searchEntries?: SettingsSearchEntry[]
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  badge?: string
  badgeAccessory?: React.ReactNode
  forceVisible?: boolean
  /** When true, this section is the one currently selected in the sidebar.
   *  Sections render only when active. During search, the sidebar lists every
   *  match while the content pane stays focused on the selected match instead
   *  of mounting every matching settings surface at once. */
  isActive?: boolean
  /** Rendered in the section header's upper-right corner — intended for
   *  section-scoped actions (e.g. "Import from Ghostty") that would otherwise
   *  crowd the settings list as their own row. */
  headerAction?: React.ReactNode
}

export function SettingsSection({
  id,
  title,
  description,
  searchEntries,
  children,
  className,
  bodyClassName,
  badge,
  badgeAccessory,
  forceVisible = false,
  isActive,
  headerAction
}: SettingsSectionProps): React.JSX.Element | null {
  const query = useAppStore((state) => state.settingsSearchQuery)
  const activeFromContext = useContext(ActiveSettingsSectionContext)
  const panesPending = useContext(SettingsPanesPendingContext)
  const sectionIsActive = isActive ?? activeFromContext === id
  const hasQuery = query.trim() !== ''
  const matchesQuery = !searchEntries || matchesSettingsSearch(query, searchEntries)
  if (!forceVisible) {
    if (hasQuery) {
      if (!sectionIsActive || !matchesQuery) {
        return null
      }
    } else if (!sectionIsActive) {
      return null
    }
  }

  return (
    <section id={id} data-settings-section={id} className={cn('scroll-mt-8 space-y-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div className="min-w-0 space-y-2">
          <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight text-foreground">
            {title}
            {badge ? <Badge variant="muted">{badge}</Badge> : null}
            {badgeAccessory}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {/* Why: body content sits in a visually distinct band — a soft card with
          rounded corners and tight inner padding — so each row group reads as
          contained inside the section, not as a continuation of the sidebar. */}
      <div
        className={cn(
          'rounded-xl border border-border/50 bg-card/50 px-7 py-6 shadow-xs',
          bodyClassName
        )}
      >
        {panesPending && !children ? <SettingsSectionSkeleton /> : children}
      </div>
    </section>
  )
}
