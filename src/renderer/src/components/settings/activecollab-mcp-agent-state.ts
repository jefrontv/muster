// The per-agent copy for the MCP install card, kept out of the component so the four states are
// assertable without a DOM.
//
// "configured" is deliberately not a boolean here. An entry Muster wrote, an entry pointing at a
// different command, an agent with no entry, and an agent that is not installed at all are four
// different situations, and only one of them is done.

import type { IntegrationStatusTone } from '@/components/integration-status-pill'
import { translate } from '@/i18n/i18n'
import {
  ACTIVECOLLAB_MCP_SERVER_KEY,
  type ActiveCollabMcpAgentStatus,
  type ActiveCollabMcpBinary
} from '../../../../shared/activecollab-mcp-types'

export type ActiveCollabMcpAgentStateKind = 'missing-agent' | 'unconfigured' | 'stale' | 'current'

export type ActiveCollabMcpAgentState = {
  kind: ActiveCollabMcpAgentStateKind
  statusLabel: string
  tone: IntegrationStatusTone
  detail: string
  actionLabel: string
  actionVariant: 'default' | 'outline'
  /** Set for HTTP agents, whose entry is inert until the local MCP daemon runs. */
  transportNote: string | null
  /** Non-null disables the action and says why. */
  blockedReason: string | null
}

export function activeCollabMcpAgentStateKind(
  agent: ActiveCollabMcpAgentStatus
): ActiveCollabMcpAgentStateKind {
  if (agent.configured) {
    return agent.current ? 'current' : 'stale'
  }
  return agent.present ? 'unconfigured' : 'missing-agent'
}

type AgentStateCopy = Pick<
  ActiveCollabMcpAgentState,
  'statusLabel' | 'tone' | 'detail' | 'actionLabel' | 'actionVariant'
>

function agentStateCopy(kind: ActiveCollabMcpAgentStateKind): AgentStateCopy {
  switch (kind) {
    case 'missing-agent': {
      return {
        statusLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_missing_status',
          'Agent not detected'
        ),
        tone: 'neutral',
        detail: translate(
          'auto.components.settings.activecollab.mcp.agent_missing_detail',
          'Muster did not find this agent on this machine. Installing anyway writes the config file shown below, which the agent picks up once it exists.'
        ),
        actionLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_missing_action',
          'Install anyway'
        ),
        actionVariant: 'outline'
      }
    }
    case 'unconfigured': {
      return {
        statusLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_unconfigured_status',
          'Not configured by Muster'
        ),
        tone: 'attention',
        detail: translate(
          'auto.components.settings.activecollab.mcp.agent_unconfigured_detail',
          'Muster has not written its "{{value0}}" entry here. If you already added an ActiveCollab MCP server under a different key, Muster cannot see it — open the config below before installing so you do not end up with two.',
          { value0: ACTIVECOLLAB_MCP_SERVER_KEY }
        ),
        actionLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_unconfigured_action',
          'Install'
        ),
        actionVariant: 'default'
      }
    }
    case 'stale': {
      return {
        statusLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_stale_status',
          'Muster entry out of date'
        ),
        tone: 'attention',
        detail: translate(
          'auto.components.settings.activecollab.mcp.agent_stale_detail',
          'An "{{value0}}" entry is already here, but it points at a different command than Muster would write now.',
          { value0: ACTIVECOLLAB_MCP_SERVER_KEY }
        ),
        actionLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_stale_action',
          'Update entry'
        ),
        actionVariant: 'default'
      }
    }
    case 'current': {
      return {
        statusLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_current_status',
          'Installed and current'
        ),
        tone: 'connected',
        detail: translate(
          'auto.components.settings.activecollab.mcp.agent_current_detail',
          'The "{{value0}}" entry matches what Muster would write now.',
          { value0: ACTIVECOLLAB_MCP_SERVER_KEY }
        ),
        actionLabel: translate(
          'auto.components.settings.activecollab.mcp.agent_current_action',
          'Rewrite entry'
        ),
        actionVariant: 'outline'
      }
    }
  }
}

export function describeActiveCollabMcpAgent(
  agent: ActiveCollabMcpAgentStatus,
  binary: ActiveCollabMcpBinary
): ActiveCollabMcpAgentState {
  const kind = activeCollabMcpAgentStateKind(agent)
  // HTTP agents point at a loopback URL, so a missing binary is irrelevant to them.
  const blocked = !binary.found && !agent.requiresRunningServer
  return {
    kind,
    ...agentStateCopy(kind),
    transportNote: agent.requiresRunningServer
      ? translate(
          'auto.components.settings.activecollab.mcp.agent_http_note',
          'Connects over HTTP, so it needs no local binary — the entry stays inert until the MCP server is running.'
        )
      : null,
    blockedReason: blocked
      ? translate(
          'auto.components.settings.activecollab.mcp.agent_binary_required',
          'activecollab-mcp is not installed, so this agent would be pointed at nothing.'
        )
      : null
  }
}
