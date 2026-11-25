import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import type { TerminalTab, TuiAgent } from '../../../../shared/types'
import { FilledBellIcon } from '../sidebar/WorktreeCardHelpers'
import { ShellIcon } from './shell-icons'
import type { TerminalTabActivityStatus } from './terminal-tab-activity-status'
import { translate } from '@/i18n/i18n'

type TerminalTabLeadingIconProps = {
  agent: TuiAgent | null
  activityStatus: TerminalTabActivityStatus
  shell: TerminalTab['shellOverride']
  showUnreadActivity: boolean
  isActive: boolean
}

type TerminalTabAgentIdentityIconProps = {
  agent: TuiAgent
  isActive: boolean
  className?: string
}

/**
 * Map the container status to the shared state-dot vocabulary. `active` and
 * `inactive` carry no activity glyph — the tab falls through to its agent or
 * shell identity icon instead. Uses the same WorktreeStatus vocabulary as the
 * sidebar so live states read identically (tabs intentionally omit the card's
 * retained-done promotion, so a stale green check can differ after cleanup).
 */
function activityDotState(status: TerminalTabActivityStatus): AgentDotState | null {
  switch (status) {
    case 'working':
      return 'working'
    case 'permission':
      return 'permission'
    case 'done':
      return 'done'
    case 'active':
    case 'inactive':
      return null
  }
}

const STATE_BADGE_CLASSES =
  'absolute -right-1.5 -bottom-1 inline-flex rounded-full bg-card ring-1 ring-card'

/** Keep the provider glyph treatment identical across every terminal-tab state. */
function TerminalTabAgentIdentityIcon({
  agent,
  isActive,
  className
}: TerminalTabAgentIdentityIconProps): React.JSX.Element {
  return (
    <span
      className={cn('inline-flex', !isActive && 'opacity-70', className)}
      data-agent-icon={agent}
      aria-hidden
    >
      <AgentIcon agent={agent} size={12} />
    </span>
  )
}

/** Render a terminal tab's current state without hiding its agent or shell identity. */
export function TerminalTabLeadingIcon({
  agent,
  activityStatus,
  shell,
  showUnreadActivity,
  isActive
}: TerminalTabLeadingIconProps): React.JSX.Element {
  if (showUnreadActivity) {
    return (
      <span
        data-testid="tab-activity-bell"
        aria-label={translate(
          'auto.components.tab.bar.TerminalTabLeadingIcon.7ab2964bea',
          'Unread agent completion'
        )}
        className="relative inline-flex"
      >
        {agent ? (
          <>
            <TerminalTabAgentIdentityIcon agent={agent} isActive={isActive} />
            <FilledBellIcon className={cn(STATE_BADGE_CLASSES, 'size-2.5 text-status-attention')} />
          </>
        ) : (
          <FilledBellIcon className="size-3 text-status-attention drop-shadow-sm" />
        )}
      </span>
    )
  }

  const dotState = activityDotState(activityStatus)
  if (dotState) {
    return (
      <span
        data-testid="tab-agent-activity-indicator"
        data-agent-activity-status={activityStatus}
        className="relative inline-flex"
      >
        {/* Why: identity stays the main glyph; state rides as a corner badge so the slot never widens. */}
        {agent ? (
          <>
            <TerminalTabAgentIdentityIcon agent={agent} isActive={isActive} />
            <span className={STATE_BADGE_CLASSES}>
              <AgentStateDot state={dotState} size="sm" />
            </span>
          </>
        ) : (
          <AgentStateDot state={dotState} size="md" />
        )}
      </span>
    )
  }

  if (agent) {
    return <TerminalTabAgentIdentityIcon agent={agent} isActive={isActive} />
  }

  // Why: ShellIcon renders a colored brand-style tile for PowerShell, CMD,
  // Git Bash, and WSL while retaining the generic terminal fallback elsewhere.
  return (
    <span
      className={`inline-flex ${isActive ? '' : 'opacity-70'}`}
      data-shell-icon={shell ?? 'generic'}
      aria-hidden
    >
      <ShellIcon shell={shell} size={12} />
    </span>
  )
}
