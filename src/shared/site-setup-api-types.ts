// The preload surface for the guided setup wizard.
//
// Separate from site-setup-flow-types.ts so that contract stays a pure description of the flow with
// no transport in it, and separate from preload/api-types.ts so the renderer and the bridge agree
// by construction rather than by two hand-copied shapes — the same split site-bind-types.ts makes.

import type { SiteSetupCloneResolution, SiteSetupPlan } from './site-setup-flow-types'
import type { SiteResult } from './site-types'

export type SiteSetupApi = {
  /** Read-only: what each stage could still do and what blocks it. Writes nothing. */
  plan: (args: {
    siteId: string
    /** From the link's `reponame=`; drives the clone stage only. */
    reponame?: string
    /** Omit or pass null when the checked-out branch is unknown. */
    branch?: string | null
  }) => Promise<SiteResult<SiteSetupPlan>>
  /** The clone stage on its own, so configuring the connector can be retried without a re-probe. */
  cloneTargets: (args: { reponame: string }) => Promise<SiteResult<SiteSetupCloneResolution>>
}
