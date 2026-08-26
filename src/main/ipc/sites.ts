import { ipcMain } from 'electron'
import type { SiteSecretKind, SiteSidebarSyncResult, SiteSummary } from '../../shared/site-types'
import type { Store } from '../persistence'
import { importOcsitesConfig } from '../sites/ocsites-config-import'
import { applyOcsitesImport, type OcsitesImportApplyResult } from '../sites/ocsites-import-apply'
import { deleteSiteSecrets, setSiteSecret } from '../sites/site-secret-store'
import { linkSitesToRepos, type SiteRepoLinkResult } from '../sites/site-repo-link'
import { addDiscoveredSitesToSidebar } from '../sites/site-sidebar-sync'
import { listCheckoutBranches } from '../sites/site-branches'
import { buildSiteSummaries, buildSiteSummary, resolveSiteCheckoutDir } from '../sites/site-summary'
import { registerSiteEnvironmentHandlers } from './sites-environments'
import {
  isSiteEnvironmentName,
  isSitePatch,
  isSitePath,
  isSiteSecretKind
} from './sites-payload-validation'
import { adoptOrCreateSite } from '../sites/site-create'
import { failure, requireSite, type SiteResult } from './sites-result'

export type { SiteResult } from './sites-result'

const SITE_CHANNELS = [
  'sites:list',
  'sites:get',
  'sites:create',
  'sites:update',
  'sites:remove',
  'sites:linkRepo',
  'sites:setSecret',
  'sites:importFromOcsites',
  'sites:linkRepos',
  'sites:addDiscoveredToSidebar',
  'sites:listBranches'
] as const

export function registerSiteHandlers(store: Store): void {
  for (const channel of SITE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('sites:list', async (): Promise<SiteResult<SiteSummary[]>> => {
    try {
      return { ok: true, value: await buildSiteSummaries(store.listSites()) }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('sites:get', async (_event, siteId: unknown): Promise<SiteResult<SiteSummary>> => {
    try {
      if (typeof siteId !== 'string') {
        throw new TypeError('siteId must be a string')
      }
      return { ok: true, value: await buildSiteSummary(requireSite(store, siteId)) }
    } catch (error) {
      return failure(error)
    }
  })

  // Suggestions only: a site without git answers [] (never an error), so the add-environment
  // dialog stays usable — resolution just has nothing to offer.
  ipcMain.handle(
    'sites:listBranches',
    async (_event, siteId: unknown): Promise<SiteResult<string[]>> => {
      try {
        if (typeof siteId !== 'string') {
          throw new TypeError('siteId must be a string')
        }
        const site = requireSite(store, siteId)
        return { ok: true, value: await listCheckoutBranches(resolveSiteCheckoutDir(site)) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'sites:create',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { path?: unknown; displayName?: unknown; repoId?: unknown }
        if (!isSitePath(input.path)) {
          throw new TypeError('path must be a non-empty absolute path')
        }
        return {
          ok: true,
          value: await buildSiteSummary(
            adoptOrCreateSite(store, {
              path: input.path,
              displayName: typeof input.displayName === 'string' ? input.displayName : undefined,
              repoId: typeof input.repoId === 'string' ? input.repoId : null
            })
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'sites:update',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { siteId?: unknown; patch?: unknown }
        if (typeof input.siteId !== 'string' || !isSitePatch(input.patch)) {
          throw new TypeError('sites:update requires { siteId, patch }')
        }
        const updated = store.updateSite(input.siteId, input.patch)
        if (!updated) {
          throw new Error(`Unknown site: ${input.siteId}`)
        }
        return { ok: true, value: await buildSiteSummary(updated) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle('sites:remove', (_event, siteId: unknown): SiteResult<null> => {
    try {
      if (typeof siteId !== 'string') {
        throw new TypeError('siteId must be a string')
      }
      requireSite(store, siteId)
      deleteSiteSecrets(siteId)
      store.removeSite(siteId)
      return { ok: true, value: null }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'sites:linkRepo',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { siteId?: unknown; repoId?: unknown }
        if (typeof input.siteId !== 'string') {
          throw new TypeError('siteId must be a string')
        }
        const updated = store.updateSite(input.siteId, {
          repoId: typeof input.repoId === 'string' ? input.repoId : null
        })
        if (!updated) {
          throw new Error(`Unknown site: ${input.siteId}`)
        }
        return { ok: true, value: await buildSiteSummary(updated) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Secrets are write-only across IPC: the renderer sets or clears one, never reads it back.
  ipcMain.handle('sites:setSecret', (_event, args: unknown): SiteResult<null> => {
    try {
      const input = args as {
        siteId?: unknown
        environment?: unknown
        kind?: unknown
        value?: unknown
      }
      if (
        typeof input.siteId !== 'string' ||
        !isSiteEnvironmentName(input.environment) ||
        !isSiteSecretKind(input.kind) ||
        typeof input.value !== 'string'
      ) {
        throw new TypeError('sites:setSecret requires { siteId, environment, kind, value }')
      }
      const site = requireSite(store, input.siteId)
      if (!(input.environment in site.environments)) {
        throw new Error(`Unknown environment: ${input.environment}`)
      }
      setSiteSecret(site.id, input.environment, input.kind as SiteSecretKind, input.value)
      return { ok: true, value: null }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'sites:importFromOcsites',
    async (): Promise<
      SiteResult<OcsitesImportApplyResult & { found: boolean; repos: SiteRepoLinkResult }>
    > => {
      try {
        const report = importOcsitesConfig()
        const applied = applyOcsitesImport(store, report)
        // Sites the user can actually open should appear in the sidebar without a second step.
        const repos = await linkSitesToRepos(store)
        return { ok: true, value: { ...applied, found: report.found, repos } }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Re-runnable on its own: picks up sites whose volume was offline at import time.
  ipcMain.handle('sites:linkRepos', async (): Promise<SiteResult<SiteRepoLinkResult>> => {
    try {
      return { ok: true, value: await linkSitesToRepos(store) }
    } catch (error) {
      return failure(error)
    }
  })

  // The button's action: adopt everything discovered under the roots, then link it all. Separate
  // from `sites:linkRepos`, which stays link-only for callers that must not mint site records
  // (the ocsites import already created exactly the ones it wants).
  ipcMain.handle(
    'sites:addDiscoveredToSidebar',
    async (): Promise<SiteResult<SiteSidebarSyncResult>> => {
      try {
        return { ok: true, value: await addDiscoveredSitesToSidebar(store) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  registerSiteEnvironmentHandlers(store)
}
