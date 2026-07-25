import { AlertTriangle, GitBranch, Server } from 'lucide-react'
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

const STACK_LABELS: Record<SiteSummary['site']['localStack'], string> = {
  plain: 'Plain',
  mamp: 'MAMP',
  localwp: 'LocalWP'
}

export function SiteRow({ summary, selected, onSelect }: SiteRowProps): React.JSX.Element {
  const { site, branch, resolvedEnvironment, pathExists } = summary
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
        {!pathExists ? (
          <AlertTriangle
            className="size-3.5 shrink-0 text-destructive"
            aria-label={translate(
              'auto.components.sites.SiteRow.missingPath',
              'Checkout folder is missing'
            )}
          />
        ) : null}
        <Badge variant="secondary" className="shrink-0">
          {STACK_LABELS[site.localStack]}
        </Badge>
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
