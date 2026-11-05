import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IntegrationStatusPill, type IntegrationStatusTone } from '../integration-status-pill'
import { useIntegrationCardShellClass } from './integration-card-presentation'

export type IntegrationCardStatusTone = IntegrationStatusTone

export function IntegrationCardShell(props: {
  icon: React.ReactNode
  /** A node, not just a string, so a card can set trailing metadata on the title line. */
  name: React.ReactNode
  description: React.ReactNode
  statusLabel: string
  statusTone: IntegrationCardStatusTone
  checking?: boolean
  className?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}): React.JSX.Element {
  const shellClass = useIntegrationCardShellClass(props.className)
  const status = props.checking ? (
    <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
  ) : (
    <IntegrationStatusPill tone={props.statusTone}>{props.statusLabel}</IntegrationStatusPill>
  )

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="shrink-0 text-muted-foreground">{props.icon}</span>
        <div className="min-w-0 flex-1 basis-[16rem] space-y-0.5">
          <div className="text-sm font-medium">{props.name}</div>
          <p className="text-xs text-muted-foreground">{props.description}</p>
        </div>
        {/* Why: settings can be narrow with the sidebar open; controls need their
        own row before they squeeze provider copy into unreadable columns. */}
        <div className="flex basis-full shrink-0 flex-wrap items-center justify-start gap-1.5 min-[1100px]:ml-auto min-[1100px]:basis-auto min-[1100px]:justify-end">
          {props.actions}
          {status}
        </div>
      </div>
      {props.children}
    </div>
  )
}

export function IntegrationCardDetails(props: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('mt-4 space-y-2 border-t border-border/60 pt-4', props.className)}>
      {props.children}
    </div>
  )
}
