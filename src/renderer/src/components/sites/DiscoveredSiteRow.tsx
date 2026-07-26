import { FolderGit2, Globe, HardDrive } from 'lucide-react'
import type React from 'react'
import type { DiscoveredSiteCandidate } from '../../../../shared/site-discovery-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'

type DiscoveredSiteRowProps = {
  candidate: DiscoveredSiteCandidate
  onConfigure: (candidate: DiscoveredSiteCandidate) => void
}

const KIND_ICONS = {
  localwp: HardDrive,
  wordpress: Globe,
  git: FolderGit2
} as const

/**
 * A folder found on disk that has no Site record yet.
 *
 * Deliberately not a `SiteRow`: it has no id, no environments, and nothing to deploy, so the
 * shared row's branch/environment furniture would render as a wall of "None". It is also not
 * persisted — the Sites page recomputes these every refresh, so nothing here survives a restart
 * until the user actually configures it.
 */
export function DiscoveredSiteRow({
  candidate,
  onConfigure
}: DiscoveredSiteRowProps): React.JSX.Element {
  const Icon = KIND_ICONS[candidate.kind]

  return (
    <button
      type="button"
      onClick={() => onConfigure(candidate)}
      className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left opacity-75 transition-colors hover:bg-accent hover:opacity-100"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{candidate.displayName}</span>
        <Badge variant="outline" className="shrink-0">
          {translate('auto.components.sites.DiscoveredSiteRow.notConfigured', 'Not configured')}
        </Badge>
      </div>
      <span className="truncate font-mono text-xs text-muted-foreground">{candidate.path}</span>
    </button>
  )
}

export default DiscoveredSiteRow
