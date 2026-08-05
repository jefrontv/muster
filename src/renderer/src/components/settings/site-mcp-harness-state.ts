// The per-harness copy for the muster-sites MCP install card, kept out of the component so the
// four states are assertable without a DOM. Mirrors activecollab-mcp-agent-state.ts.
//
// There is no binary state here: the server is Muster itself, so the only block on installing is
// the Site tools capability toggle — the caller passes that reason in.

import type { IntegrationStatusTone } from '@/components/integration-status-pill'
import { translate } from '@/i18n/i18n'
import type { SiteMcpHarnessStatus } from '../../../../shared/site-mcp-types'

export type SiteMcpHarnessStateKind = 'missing-harness' | 'unconfigured' | 'stale' | 'current'

export type SiteMcpHarnessState = {
  kind: SiteMcpHarnessStateKind
  statusLabel: string
  tone: IntegrationStatusTone
  detail: string
  actionLabel: string
  actionVariant: 'default' | 'outline'
  /** Non-null disables the action and says why. */
  blockedReason: string | null
}

export function siteMcpHarnessStateKind(harness: SiteMcpHarnessStatus): SiteMcpHarnessStateKind {
  if (harness.configured) {
    return harness.current ? 'current' : 'stale'
  }
  return harness.present ? 'unconfigured' : 'missing-harness'
}

type HarnessStateCopy = Pick<
  SiteMcpHarnessState,
  'statusLabel' | 'tone' | 'detail' | 'actionLabel' | 'actionVariant'
>

function harnessStateCopy(kind: SiteMcpHarnessStateKind): HarnessStateCopy {
  switch (kind) {
    case 'missing-harness': {
      return {
        statusLabel: translate(
          'auto.components.settings.siteMcp.harness_missing_status',
          'Harness not detected'
        ),
        tone: 'neutral',
        detail: translate(
          'auto.components.settings.siteMcp.harness_missing_detail',
          'Muster did not find this harness on this machine. Installing anyway writes the config file shown below, which the harness picks up once it exists.'
        ),
        actionLabel: translate(
          'auto.components.settings.siteMcp.harness_missing_action',
          'Install anyway'
        ),
        actionVariant: 'outline'
      }
    }
    case 'unconfigured': {
      return {
        statusLabel: translate(
          'auto.components.settings.siteMcp.harness_unconfigured_status',
          'Not configured by Muster'
        ),
        tone: 'attention',
        detail: translate(
          'auto.components.settings.siteMcp.harness_unconfigured_detail',
          'Muster has not written its "muster-sites" entry here. If you already added a site MCP server under a different key, Muster cannot see it — open the config below before installing so you do not end up with two.'
        ),
        actionLabel: translate(
          'auto.components.settings.siteMcp.harness_unconfigured_action',
          'Install'
        ),
        actionVariant: 'default'
      }
    }
    case 'stale': {
      return {
        statusLabel: translate(
          'auto.components.settings.siteMcp.harness_stale_status',
          'Muster entry out of date'
        ),
        tone: 'attention',
        detail: translate(
          'auto.components.settings.siteMcp.harness_stale_detail',
          'A "muster-sites" entry is already here, but it points at a different command than this build would write now — usually a moved or upgraded app.'
        ),
        actionLabel: translate(
          'auto.components.settings.siteMcp.harness_stale_action',
          'Update entry'
        ),
        actionVariant: 'default'
      }
    }
    case 'current': {
      return {
        statusLabel: translate(
          'auto.components.settings.siteMcp.harness_current_status',
          'Installed and current'
        ),
        tone: 'connected',
        detail: translate(
          'auto.components.settings.siteMcp.harness_current_detail',
          'The "muster-sites" entry matches what this build would write now.'
        ),
        actionLabel: translate(
          'auto.components.settings.siteMcp.harness_current_action',
          'Rewrite entry'
        ),
        actionVariant: 'outline'
      }
    }
  }
}

export function describeSiteMcpHarness(
  harness: SiteMcpHarnessStatus,
  blockedReason: string | null
): SiteMcpHarnessState {
  const kind = siteMcpHarnessStateKind(harness)
  return { kind, ...harnessStateCopy(kind), blockedReason }
}
