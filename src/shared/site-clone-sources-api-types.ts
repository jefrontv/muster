// The renderer's view of the git-host repo picker. Lives in shared/ (like site-roots-api-types.ts)
// because the preload type surface is compiled into the browser project and must not reach into
// main, where the host modules and the stored credentials actually live.

import type {
  CloneSourceListResult,
  CloneSourceProvider,
  CloneSourceProviderId
} from './site-clone-source-types'
import type { SiteResult } from './site-types'

export type SiteCloneSourcesApi = {
  /** Every provider, configured or not, in a stable order. An unconfigured one carries a reason. */
  providers: () => Promise<SiteResult<CloneSourceProvider[]>>
  /**
   * Resolves `ok: false` only for an unknown provider. A configured host that could not be reached
   * resolves `ok: true` with an empty `repos` and a populated `error`.
   */
  repos: (args: { provider: CloneSourceProviderId }) => Promise<SiteResult<CloneSourceListResult>>
}
