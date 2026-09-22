// The copy each extension status gets, kept out of the components so every state can be asserted
// without rendering, and so no status can quietly acquire two different labels in two places.

import type { IntegrationCardStatusTone } from '@/components/settings/integration-card-shell'
import type { IntegrationStatusTone } from '@/components/integration-status-pill'
import { translate } from '@/i18n/i18n'
import type {
  ExtensionHarnessState,
  ExtensionState,
  ExtensionStatus
} from '../../../../shared/extension-state-types'

export type ExtensionStatusCopy = {
  label: string
  tone: IntegrationCardStatusTone
}

export function describeExtensionStatus(status: ExtensionStatus): ExtensionStatusCopy {
  switch (status) {
    case 'outdated':
      return {
        label: translate('auto.components.extensions.status_outdated', 'Update available'),
        tone: 'attention'
      }
    case 'current':
      return {
        label: translate('auto.components.extensions.status_current', 'Up to date'),
        tone: 'connected'
      }
    case 'not-installed':
      return {
        label: translate('auto.components.extensions.status_available', 'Not installed'),
        tone: 'neutral'
      }
    case 'unknown':
      return {
        label: translate('auto.components.extensions.status_unknown', 'Version unknown'),
        tone: 'neutral'
      }
    case 'unsupported-platform':
      return {
        label: translate('auto.components.extensions.status_unsupported', 'Not for this system'),
        tone: 'neutral'
      }
    case 'no-access':
      return {
        label: translate('auto.components.extensions.status_no_access', 'No access'),
        tone: 'neutral'
      }
  }
}

/** The version line under the name. Null when there is nothing honest to put there. */
export function describeExtensionVersions(state: ExtensionState): string | null {
  if (state.status === 'outdated' && state.installedVersion && state.latestVersion) {
    return `${state.installedVersion} → ${state.latestVersion}`
  }
  if (state.installedVersion) {
    return state.installedVersion
  }
  if (!state.installed && state.latestVersion) {
    return translate('auto.components.extensions.version_latest', 'Latest {{version}}').replace(
      '{{version}}',
      state.latestVersion
    )
  }
  return null
}

export type ExtensionHarnessCopy = {
  kind: 'missing-harness' | 'unconfigured' | 'stale' | 'current'
  label: string
  tone: IntegrationStatusTone
  actionLabel: string
  actionVariant: 'default' | 'outline'
}

export function describeExtensionHarness(harness: ExtensionHarnessState): ExtensionHarnessCopy {
  if (harness.configured && harness.current) {
    return {
      kind: 'current',
      label: translate('auto.components.extensions.harness_current', 'Current'),
      tone: 'connected',
      actionLabel: translate('auto.components.extensions.harness_rewrite', 'Rewrite'),
      actionVariant: 'outline'
    }
  }
  if (harness.configured) {
    return {
      kind: 'stale',
      label: translate('auto.components.extensions.harness_stale', 'Out of date'),
      tone: 'attention',
      actionLabel: translate('auto.components.extensions.harness_update', 'Update entry'),
      actionVariant: 'default'
    }
  }
  return {
    kind: harness.present ? 'unconfigured' : 'missing-harness',
    label: harness.present
      ? translate('auto.components.extensions.harness_unconfigured', 'Not configured')
      : translate('auto.components.extensions.harness_absent', 'Not detected'),
    tone: harness.present ? 'attention' : 'neutral',
    actionLabel: harness.present
      ? translate('auto.components.extensions.harness_install', 'Install')
      : translate('auto.components.extensions.harness_install_anyway', 'Install anyway'),
    actionVariant: harness.present ? 'default' : 'outline'
  }
}
