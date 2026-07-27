import { LoaderCircle } from 'lucide-react'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import type {
  ActiveCollabMcpAgentStatus,
  ActiveCollabMcpBinary
} from '../../../../shared/activecollab-mcp-types'
import { describeActiveCollabMcpAgent } from './activecollab-mcp-agent-state'
import { ActiveCollabMcpNoticeText } from './activecollab-mcp-notice'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import type { ActiveCollabMcpNotice } from './use-activecollab-mcp-status'

export function ActiveCollabMcpAgentRow({
  agent,
  binary,
  busy,
  notice,
  onInstall
}: {
  agent: ActiveCollabMcpAgentStatus
  binary: ActiveCollabMcpBinary
  busy: boolean
  notice: ActiveCollabMcpNotice | null
  onInstall: () => void
}): React.JSX.Element {
  const state = describeActiveCollabMcpAgent(agent, binary)
  const rowClass = useIntegrationSubordinateRowClass('space-y-2')

  return (
    <div className={rowClass} data-agent-id={agent.id} data-agent-state={state.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{agent.label}</p>
        <IntegrationStatusPill tone={state.tone}>{state.statusLabel}</IntegrationStatusPill>
      </div>
      <p className="text-xs text-muted-foreground">{state.detail}</p>
      {state.transportNote ? (
        <p className="text-xs text-muted-foreground">{state.transportNote}</p>
      ) : null}
      <p
        className="truncate font-mono text-[11px] text-muted-foreground/80"
        title={agent.configPath}
      >
        {agent.configPath}
      </p>
      {agent.error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {agent.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={state.actionVariant}
          size="xs"
          disabled={busy || state.blockedReason !== null}
          title={state.blockedReason ?? undefined}
          onClick={onInstall}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          {state.actionLabel}
        </Button>
        {state.blockedReason ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">{state.blockedReason}</span>
        ) : null}
      </div>
      {notice ? <ActiveCollabMcpNoticeText notice={notice} /> : null}
    </div>
  )
}
