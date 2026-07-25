import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import {
  createEmptySiteEnvironment,
  DEFAULT_SITE_ENVIRONMENT_NAME,
  type Site,
  type SiteSecretKind,
  type SiteSummary
} from '../../shared/site-types'
import type { Store } from '../persistence'
import { importOcsitesConfig } from '../sites/ocsites-config-import'
import { applyOcsitesImport, type OcsitesImportApplyResult } from '../sites/ocsites-import-apply'
import { deleteSiteSecrets, setSiteSecret } from '../sites/site-secret-store'
import { buildSiteSummaries, buildSiteSummary } from '../sites/site-summary'
import { registerSiteEnvironmentHandlers } from './sites-environments'
import {
  isSiteEnvironmentName,
  isSitePatch,
  isSitePath,
  isSiteSecretKind
} from './sites-payload-validation'
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
  'sites:importFromOcsites'
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

  ipcMain.handle(
    'sites:create',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { path?: unknown; displayName?: unknown; repoId?: unknown }
        if (!isSitePath(input.path)) {
          throw new TypeError('path must be a non-empty absolute path')
        }
        if (store.findSiteByPath(input.path)) {
          throw new Error(`A site already exists for ${input.path}`)
        }
        const segments = input.path.split(/[/\\]/)
        const fallbackName = segments.findLast((segment) => segment.length > 0) ?? input.path
        const site: Site = {
          id: randomUUID(),
          path: input.path,
          repoId: typeof input.repoId === 'string' ? input.repoId : null,
          displayName:
            typeof input.displayName === 'string' && input.displayName.trim().length > 0
              ? input.displayName.trim()
              : fallbackName,
          localWpRoot: '',
          localDomain: '',
          localStack: 'plain',
          dbUser: 'root',
          dbSocket: '',
          dbPort: null,
          phpVersion: '',
          activeEnvironment: DEFAULT_SITE_ENVIRONMENT_NAME,
          environments: { [DEFAULT_SITE_ENVIRONMENT_NAME]: createEmptySiteEnvironment() },
          notes: '',
          searchReplaceTimeoutSeconds: 600
        }
        return { ok: true, value: await buildSiteSummary(store.upsertSite(site)) }
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
    async (): Promise<SiteResult<OcsitesImportApplyResult & { found: boolean }>> => {
      try {
        const report = importOcsitesConfig()
        return { ok: true, value: { ...applyOcsitesImport(store, report), found: report.found } }
      } catch (error) {
        return failure(error)
      }
    }
  )

  registerSiteEnvironmentHandlers(store)
}
