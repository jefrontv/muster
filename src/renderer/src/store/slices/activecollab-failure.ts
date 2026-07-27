// Failure triage for the ActiveCollab slice. The runtime client is result-typed and never throws,
// so recovery is chosen from `kind` plus the credential-decrypt message that crosses IPC intact.
import type { ActiveCollabFailure } from '../../../../shared/activecollab-api-types'
import { isIntegrationCredentialDecryptionError } from '../../../../shared/integration-credential-errors'
import { translate } from '@/i18n/i18n'

/**
 * Only failures that can move connection state are worth a status round trip: an `api` fault or a
 * malformed request says nothing about the token, and refetching status on those just adds traffic.
 * A decrypt refusal is not a bad token — Settings must offer the Keychain prompt, not "reconnect".
 */
export function shouldRefreshStatusAfterFailure(failure: ActiveCollabFailure): boolean {
  return (
    failure.kind === 'auth' ||
    failure.kind === 'not-configured' ||
    isIntegrationCredentialDecryptionError(failure.error)
  )
}

/**
 * A connect that resolved after the runtime context moved. The token did land, but in the context
 * the user just left, so reporting success would show "connected" over an unwritten status.
 */
export function activeCollabSupersededFailure(): ActiveCollabFailure {
  return {
    ok: false,
    kind: 'unknown',
    error: translate(
      'auto.store.slices.activecollab.4b7e2a9c15',
      'ActiveCollab connection was superseded by a newer request.'
    ),
    status: null
  }
}
