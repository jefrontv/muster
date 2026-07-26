import { GitBranch, Server } from 'lucide-react'
import type React from 'react'
import type { SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type SiteRowProps = {
  summary: SiteSummary
  selected: boolean
  onSelect: (siteId: string) => void
}

// Why only the managed stacks: "Plain" is the absence of a local stack, so badging it adds a chip
// to most rows while telling the user nothing. MAMP and LocalWP change how the site is run.
const STACK_LABELS: Partial<Record<SiteSummary['site']['localStack'], string>> = {
  mamp: 'MAMP',
  localwp: 'LocalWP'
}

export function SiteRow({ summary, selected, onSelect }: SiteRowProps): React.JSX.Element {
  const { site, branch, resolvedEnvironment } = summary
  const environmentCount = Object.keys(site.environments).length

  return (
    <button
      type="button"
      onClick={() => onSelect(site.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors',
        selected ? 'bg-accent' : 'hover:bg-accent'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{site.displayName}</span>
        {STACK_LABELS[site.localStack] ? (
          <Badge variant="secondary" className="shrink-0">
            {STACK_LABELS[site.localStack]}
          </Badge>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="truncate font-mono">{site.path}</span>
      </div>
      <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
        {branch ? (
          <span className="flex min-w-0 items-center gap-1">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate font-mono">{branch}</span>
          </span>
        ) : null}
        <span className="flex min-w-0 items-center gap-1">
          <Server className="size-3 shrink-0" />
          <span className="truncate">
            {resolvedEnvironment.environment ??
              translate('auto.components.sites.SiteRow.noEnvironment', 'No environment')}
          </span>
        </span>
        {environmentCount > 1 ? (
          <span className="shrink-0">
            {translate('auto.components.sites.SiteRow.environmentCount', '{{count}} envs', {
              count: environmentCount
            })}
          </span>
        ) : null}
      </div>
    </button>
  )
}
