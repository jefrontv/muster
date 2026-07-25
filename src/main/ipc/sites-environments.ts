// Environment CRUD for a site. Split from ipc/sites.ts to stay under the 300-line cap and because
// environment mutations have one concern the rest of the site surface does not: secrets are keyed
// by environment name, so a rename or delete must move or drop them in lockstep with the config.

import { ipcMain } from 'electron'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment,
  type SiteSummary
} from '../../shared/site-types'
import type { Store } from '../persistence'
import {
  copySiteEnvironmentSecrets,
  deleteSiteEnvironmentSecrets
} from '../sites/site-secret-store'
import { buildSiteSummary } from '../sites/site-summary'
import { isSiteEnvironmentName, isSiteEnvironmentPatch } from './sites-payload-validation'
import { failure, requireSite, type SiteResult } from './sites-result'

const SITE_ENVIRONMENT_CHANNELS = [
  'sites:upsertEnvironment',
  'sites:renameEnvironment',
  'sites:removeEnvironment'
] as const

export function registerSiteEnvironmentHandlers(store: Store): void {
  for (const channel of SITE_ENVIRONMENT_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'sites:upsertEnvironment',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { siteId?: unknown; name?: unknown; patch?: unknown }
        if (typeof input.siteId !== 'string' || !isSiteEnvironmentName(input.name)) {
          throw new TypeError('sites:upsertEnvironment requires { siteId, name }')
        }
        if (input.patch !== undefined && !isSiteEnvironmentPatch(input.patch)) {
          throw new TypeError('patch contains an unknown environment field')
        }
        const site = requireSite(store, input.siteId)
        const base = site.environments[input.name] ?? createEmptySiteEnvironment()
        const updated = store.updateSite(site.id, {
          environments: { ...site.environments, [input.name]: { ...base, ...input.patch } },
          activeEnvironment: site.activeEnvironment || input.name
        })
        return { ok: true, value: await buildSiteSummary(updated ?? site) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'sites:renameEnvironment',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { siteId?: unknown; from?: unknown; to?: unknown }
        if (
          typeof input.siteId !== 'string' ||
          !isSiteEnvironmentName(input.from) ||
          !isSiteEnvironmentName(input.to)
        ) {
          throw new TypeError('sites:renameEnvironment requires { siteId, from, to }')
        }
        const site = requireSite(store, input.siteId)
        if (!(input.from in site.environments)) {
          throw new Error(`Unknown environment: ${input.from}`)
        }
        if (input.from !== input.to && input.to in site.environments) {
          throw new Error(`Environment already exists: ${input.to}`)
        }
        const environments: Record<string, SiteEnvironment> = {}
        for (const [name, environment] of Object.entries(site.environments)) {
          environments[name === input.from ? input.to : name] = environment
        }
        moveEnvironmentSecrets(site, input.from, input.to)
        const updated = store.updateSite(site.id, {
          environments,
          activeEnvironment:
            site.activeEnvironment === input.from ? input.to : site.activeEnvironment
        })
        return { ok: true, value: await buildSiteSummary(updated ?? site) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'sites:removeEnvironment',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as { siteId?: unknown; name?: unknown }
        if (typeof input.siteId !== 'string' || !isSiteEnvironmentName(input.name)) {
          throw new TypeError('sites:removeEnvironment requires { siteId, name }')
        }
        const site = requireSite(store, input.siteId)
        if (!(input.name in site.environments)) {
          throw new Error(`Unknown environment: ${input.name}`)
        }
        const environments = { ...site.environments }
        delete environments[input.name]
        deleteSiteEnvironmentSecrets(site.id, input.name)
        const remaining = Object.keys(environments)
        const updated = store.updateSite(site.id, {
          environments,
          activeEnvironment:
            site.activeEnvironment === input.name ? (remaining[0] ?? '') : site.activeEnvironment
        })
        return { ok: true, value: await buildSiteSummary(updated ?? site) }
      } catch (error) {
        return failure(error)
      }
    }
  )
}

function moveEnvironmentSecrets(site: Site, from: string, to: string): void {
  if (from === to) {
    return
  }
  copySiteEnvironmentSecrets(site.id, from, to)
  deleteSiteEnvironmentSecrets(site.id, from)
}
