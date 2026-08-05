// Leaf controls for the right-sidebar Site tab, split out of SitePanel so the panel stays under
// the file-size cap while these pieces keep one shared visual definition.

import { DownloadCloud, UploadCloud } from 'lucide-react'
import type React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

// Why module scope: Intl.RelativeTimeFormat allocation is non-trivial; all rows share one.
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatRelativeTime(timestamp: number): string {
  const minutes = Math.round((timestamp - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) {
    return relativeTimeFormatter.format(minutes, 'minute')
  }
  if (Math.abs(minutes) < 60 * 24) {
    return relativeTimeFormatter.format(Math.round(minutes / 60), 'hour')
  }
  return relativeTimeFormatter.format(Math.round(minutes / (60 * 24)), 'day')
}

/** Label left, value right; mono for literal values like domains and paths. */
export function InfoRow({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 truncate text-right', mono && 'font-mono')} title={value}>
        {value}
      </span>
    </div>
  )
}

export function SectionHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>
}

export function QuickActionButton({
  icon: Icon,
  label,
  count,
  disabledReason,
  busy,
  onRun
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  /** Non-null disables the action; the reason surfaces as the tooltip. */
  disabledReason: string | null
  busy: boolean
  onRun: () => void
}): React.JSX.Element {
  const disabled = disabledReason !== null || busy
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Why aria-disabled + click guard instead of `disabled`: a DOM-disabled button loses
            pointer events in Chromium and the reason tooltip never shows (see ActionButton). */}
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', disabled && 'opacity-50 cursor-not-allowed')}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) {
              event.preventDefault()
              return
            }
            onRun()
          }}
        >
          <Icon className="size-3.5" />
          {label}
          <Badge variant="secondary">{count}</Badge>
        </Button>
      </TooltipTrigger>
      {disabledReason !== null ? (
        <TooltipContent side="top" sideOffset={4}>
          {disabledReason}
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}

/** Import/Deploy quick action carrying the group's standard icon and label. */
export function SiteRunQuickAction({
  group,
  count,
  disabledReason,
  busy,
  onRun
}: {
  group: 'import' | 'deploy'
  count: number
  disabledReason: string | null
  busy: boolean
  onRun: () => void
}): React.JSX.Element {
  return (
    <QuickActionButton
      icon={group === 'import' ? DownloadCloud : UploadCloud}
      label={
        group === 'import'
          ? translate('auto.components.right.sidebar.SitePanel.import', 'Import')
          : translate('auto.components.right.sidebar.SitePanel.deploy', 'Deploy')
      }
      count={count}
      disabledReason={disabledReason}
      busy={busy}
      onRun={onRun}
    />
  )
}
