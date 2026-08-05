import type { ActiveCollabConnectionStatus } from '../../../../shared/activecollab-types'

export type ActiveCollabDerivedConnectionState = {
  /** True when the cached status was read for the currently selected provider runtime. */
  contextMatches: boolean
  checking: boolean
  connected: boolean
}

// Why: the settings card and the setup-guide "Connect ActiveCollab" step must
// agree on what "connected" means, so both derive it from this single helper.
export function deriveActiveCollabConnectionState(input: {
  status: ActiveCollabConnectionStatus
  statusChecked: boolean
  statusContextKey: string | null
  providerRuntimeContextKey: string
}): ActiveCollabDerivedConnectionState {
  const contextMatches = input.statusContextKey === input.providerRuntimeContextKey
  return {
    contextMatches,
    checking: !contextMatches || !input.statusChecked,
    connected: contextMatches && input.status.configured
  }
}
