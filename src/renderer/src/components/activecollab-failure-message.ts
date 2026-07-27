import { translate } from '@/i18n/i18n'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'

/**
 * Maps a failure to recovery copy. Shared by the connect dialog and the settings card so the two
 * never disagree about what a kind means.
 *
 * `auth` and `not-configured` both end at the same form but are opposite states: `auth` had a token
 * the instance refused (reconnect), `not-configured` never had one (first connect). Trust `kind`
 * and not `status` — the main-process client already remaps ActiveCollab's HTTP 500-on-bad-password
 * onto `auth`, so the status code lies where the kind does not.
 */
export function describeActiveCollabFailure(failure: ActiveCollabFailure): string {
  switch (failure.kind) {
    case 'auth':
      return translate(
        'auto.components.activecollab.failure.auth',
        'ActiveCollab rejected those credentials. Enter your email and password again to reconnect.'
      )
    case 'not-configured':
      return translate(
        'auto.components.activecollab.failure.not_configured',
        'ActiveCollab is not connected yet. Exchange your instance URL, email, and password for a token to continue.'
      )
    case 'invalid-request':
      return translate(
        'auto.components.activecollab.failure.invalid_request',
        'ActiveCollab rejected the request. Check that the instance URL points at your ActiveCollab root.'
      )
    case 'api':
      return translate(
        'auto.components.activecollab.failure.api',
        'ActiveCollab returned an error that reconnecting will not fix: {{value0}}',
        { value0: failure.error }
      )
    case 'unknown':
      return translate(
        'auto.components.activecollab.failure.unknown',
        'Could not reach ActiveCollab: {{value0}}',
        { value0: failure.error }
      )
  }
}
