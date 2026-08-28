// The shared custom-step library: read it, and install an entry onto a site.
//
// Authoring lives with the agent (the muster-sites MCP tools); this surface is what the Sites page
// needs — see what is in the library, and copy one onto a site. Install COPIES: a later library
// edit must never change what an already-installed step runs.

import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { SiteCustomStep, SiteSummary } from '../../shared/site-types'
import type { Store } from '../persistence'
import { buildSiteSummary } from '../sites/site-summary'
import { isSiteCustomStepArray } from './sites-payload-validation'
import { failure, requireSite, type SiteResult } from './sites-result'

const SITE_STEP_LIBRARY_CHANNELS = [
  'siteStepLibrary:list',
  'siteStepLibrary:set',
  'siteStepLibrary:install'
] as const

/** Appends after the highest order in the same (group, position) lane, as the MCP tools do. */
function nextOrder(steps: readonly SiteCustomStep[], template: SiteCustomStep): number {
  return steps
    .filter((step) => step.group === template.group && step.position === template.position)
    .reduce((highest, step) => Math.max(highest, step.order + 1), 0)
}

export function registerSiteStepLibraryHandlers(store: Store): void {
  for (const channel of SITE_STEP_LIBRARY_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('siteStepLibrary:list', (): SiteResult<SiteCustomStep[]> => {
    try {
      return { ok: true, value: store.getSiteStepLibrary() }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteStepLibrary:set', (_event, args: unknown): SiteResult<SiteCustomStep[]> => {
    try {
      const input = args as { steps?: unknown }
      if (!isSiteCustomStepArray(input.steps)) {
        throw new TypeError('siteStepLibrary:set requires a valid steps array')
      }
      store.setSiteStepLibrary(input.steps)
      return { ok: true, value: store.getSiteStepLibrary() }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'siteStepLibrary:install',
    async (_event, args: unknown): Promise<SiteResult<SiteSummary>> => {
      try {
        const input = args as {
          siteId?: unknown
          libraryStepId?: unknown
          enabled?: unknown
        }
        if (typeof input.siteId !== 'string' || typeof input.libraryStepId !== 'string') {
          throw new TypeError('siteStepLibrary:install requires { siteId, libraryStepId }')
        }
        const site = requireSite(store, input.siteId)
        const template = store
          .getSiteStepLibrary()
          .find((entry) => entry.id === input.libraryStepId)
        if (!template) {
          throw new Error(`No library step with id '${input.libraryStepId}'`)
        }
        const steps = [...(site.customSteps ?? [])]
        steps.push({
          ...template,
          id: randomUUID(),
          order: nextOrder(steps, template),
          enabled: input.enabled === undefined ? true : input.enabled === true,
          origin: { kind: 'library', libraryId: template.id }
        })
        const updated = store.updateSite(site.id, { customSteps: steps })
        return { ok: true, value: await buildSiteSummary(updated ?? site) }
      } catch (error) {
        return failure(error)
      }
    }
  )
}
