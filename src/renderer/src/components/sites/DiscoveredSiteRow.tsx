import { FolderGit2, Globe, HardDrive } from 'lucide-react'
import type React from 'react'
import type { DiscoveredSiteCandidate } from '../../../../shared/site-discovery-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { formatSitePathForRow } from './site-path-display'

type DiscoveredSiteRowProps = {
  candidate: DiscoveredSiteCandidate
  /** Watched roots, so the row can drop the prefix every sibling repeats. */
  roots: readonly string[]
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
  roots,
  onConfigure
}: DiscoveredSiteRowProps): React.JSX.Element {
  const Icon = KIND_ICONS[candidate.kind]
  const location = formatSitePathForRow(candidate.path, roots)

  return (
    <button
      type="button"
      onClick={() => onConfigure(candidate)}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left opacity-70 transition-colors hover:bg-accent hover:opacity-100"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      {/* One line, not two: an unconfigured folder has nothing else worth a row of height, and at
          100+ candidates the second line was the difference between a list and a wall. */}
      <span className="truncate text-sm">
        {location.length > 0 ? <span className="text-muted-foreground">{location}</span> : null}
        {candidate.displayName}
      </span>
      <Badge variant="outline" className="ml-auto shrink-0">
        {translate('auto.components.sites.DiscoveredSiteRow.notConfigured', 'Not configured')}
      </Badge>
    </button>
  )
}

export default DiscoveredSiteRow
