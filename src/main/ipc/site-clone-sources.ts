// IPC surface for the git-host repo picker behind "+ New Site".
//
// Follows ipc/site-bind.ts: a removeHandler prologue so a re-register cannot double up, and tagged
// results instead of exceptions so the renderer branches rather than catches.
//
// Note the asymmetry between the two channels. `providers` cannot fail per-provider — the registry
// already degrades a broken host into an unconfigured row — so an `ok: false` here means the whole
// lookup broke. `repos` returns `ok: true` with a populated `error` when a *configured* host was
// unreachable, and `ok: false` only when the renderer asked for a provider that does not exist.

import { ipcMain } from 'electron'
import type {
  CloneSourceListResult,
  CloneSourceProvider
} from '../../shared/site-clone-source-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import {
  isCloneSourceProviderId,
  listCloneSourceProviders,
  listCloneSourceRepos
} from '../sites/site-clone-sources'
import { failure } from './sites-result'

const SITE_CLONE_SOURCE_CHANNELS = ['siteCloneSources:providers', 'siteCloneSources:repos'] as const

export function registerSiteCloneSourceHandlers(store: Store): void {
  for (const channel of SITE_CLONE_SOURCE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'siteCloneSources:providers',
    async (): Promise<SiteResult<CloneSourceProvider[]>> => {
      try {
        return { ok: true, value: await listCloneSourceProviders() }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteCloneSources:repos',
    async (_event, args: unknown): Promise<SiteResult<CloneSourceListResult>> => {
      try {
        const input = (args ?? {}) as { provider?: unknown }
        // Validated against the known ids before it can reach a host module, so a malformed
        // renderer call is a result the picker can render instead of an unhandled rejection.
        if (!isCloneSourceProviderId(input.provider)) {
          throw new TypeError(
            'siteCloneSources:repos requires { provider: "bitbucket" | "github" }'
          )
        }
        // The store is what "already have it" is measured against, so the registry filters the
        // list before it ever reaches the picker.
        return { ok: true, value: await listCloneSourceRepos(store, input.provider) }
      } catch (error) {
        return failure(error)
      }
    }
  )
}
