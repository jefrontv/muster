// The Sites page Local fields: what serves the site, where it answers, its PHP and database.
// Drawn as the same label-above boxes as the editable fields under them, so the section reads as
// one form rather than a card dropped onto it.

import { ExternalLink } from 'lucide-react'
import type React from 'react'
import { useId } from 'react'
import type { LocalWpStackDetection } from '../../../../shared/site-stack-types'
import type { Site, SiteLocalStack } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** host:port · name for TCP stacks, "socket" for LocalWP. Never a password. */
export function siteStackDatabaseLabel(
  stack: SiteLocalStack,
  detection: LocalWpStackDetection | null
): string {
  if (stack === 'localwp') {
    return detection?.socketPath
      ? translate('auto.components.sites.SiteLocalStackCard.databaseSocket', 'socket')
      : '—'
  }
  if (detection?.databaseHost && detection.databasePort) {
    const endpoint = `${detection.databaseHost}:${detection.databasePort}`
    return detection.databaseName ? `${endpoint} · ${detection.databaseName}` : endpoint
  }
  return detection?.databaseName || '—'
}

// Matches a locked SiteEditableField's input, minus the pointer: these values come from the stack.
const BOX =
  'flex h-9 min-w-0 items-center rounded-md border border-input px-3 text-sm text-muted-foreground shadow-xs dark:bg-input/30'
const SKELETON = 'h-3 animate-pulse rounded bg-muted/60'

export function SiteLocalStackField({
  label,
  title,
  children
}: {
  label: string
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1">
      <Label id={id} className="text-xs whitespace-nowrap">
        {label}
      </Label>
      <div role="group" aria-labelledby={id} className={BOX} title={title}>
        {children}
      </div>
    </div>
  )
}

function labels(): { site: string; php: string; database: string } {
  return {
    site: translate('auto.components.sites.SiteLocalStackCard.site', 'Site'),
    php: translate('auto.components.sites.SiteLocalStackCard.php', 'PHP'),
    database: translate('auto.components.sites.SiteLocalStackCard.database', 'Database')
  }
}

/** Site, PHP and Database cells; the stack picker is the grid's first cell, owned by the card. */
export function SiteLocalStackDetails({
  site,
  detection,
  servedDomain,
  siteUrl
}: {
  site: Pick<Site, 'localStack' | 'phpVersion'>
  detection: LocalWpStackDetection | null
  servedDomain: string
  siteUrl: string
}): React.JSX.Element {
  const text = labels()
  const database = siteStackDatabaseLabel(site.localStack, detection)
  return (
    <>
      <SiteLocalStackField label={text.site} title={siteUrl || undefined}>
        {siteUrl ? (
          <button
            type="button"
            className="group flex min-w-0 items-center gap-1.5 rounded-sm text-foreground outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onClick={() => void window.api.shell.openUrl(siteUrl)}
          >
            <span className="truncate">{servedDomain}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          </button>
        ) : (
          <span>—</span>
        )}
      </SiteLocalStackField>
      <SiteLocalStackField label={text.php}>
        <span className="truncate">{detection?.phpVersion || site.phpVersion || '—'}</span>
      </SiteLocalStackField>
      <SiteLocalStackField label={text.database} title={database}>
        <span className="truncate">{database}</span>
      </SiteLocalStackField>
    </>
  )
}

/** The same three cells at their final size, so nothing moves when detection answers. */
export function SiteLocalStackDetailsLoading(): React.JSX.Element {
  const text = labels()
  return (
    <>
      {(
        [
          [text.site, 'w-40'],
          [text.php, 'w-8'],
          [text.database, 'w-44']
        ] as const
      ).map(([label, width]) => (
        <SiteLocalStackField key={label} label={label}>
          <span aria-hidden className={cn(SKELETON, width)} />
        </SiteLocalStackField>
      ))}
    </>
  )
}
