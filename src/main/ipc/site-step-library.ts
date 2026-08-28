// The shared custom-step library: read it, and install an entry onto a site.
//
// Authoring lives with the agent (the muster-sites MCP tools); this surface is what the Sites page
// needs — see what is in the library, and copy one onto a site. Install COPIES: a later library
// edit must never change what an already-installed step runs.

import { ipcMain } from 'electron'
import type { SiteCustomStep, SiteSummary } from '../../shared/site-types'
import type { Store } from '../persistence'
import { buildSiteSummary } from '../sites/site-summary'
import { buildInstalledStep, buildLibraryEntry } from '../sites/custom-step-library'
import { isSiteCustomStepArray } from './sites-payload-validation'
import { failure, requireSite, type SiteResult } from './sites-result'

const SITE_STEP_LIBRARY_CHANNELS = [
  'siteStepLibrary:list',
  'siteStepLibrary:set',
  'siteStepLibrary:promote',
  'siteStepLibrary:install'
] as const

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

  // Promotion lives in main because embedding the script means reading the checkout, which the
  // renderer cannot do. Shared with the MCP tool so a UI promote cannot skip the embed and leave a
  // library entry with no script in it.
  ipcMain.handle(
    'siteStepLibrary:promote',
    async (_event, args: unknown): Promise<SiteResult<SiteCustomStep[]>> => {
      try {
        const input = args as { siteId?: unknown; stepId?: unknown }
        if (typeof input.siteId !== 'string' || typeof input.stepId !== 'string') {
          throw new TypeError('siteStepLibrary:promote requires { siteId, stepId }')
        }
        const site = requireSite(store, input.siteId)
        const original = (site.customSteps ?? []).find((step) => step.id === input.stepId)
        if (!original) {
          throw new Error(`No step with id '${input.stepId}' on this site`)
        }
        const library = store.getSiteStepLibrary()
        store.setSiteStepLibrary([...library, await buildLibraryEntry(site, original, library)])
        return { ok: true, value: store.getSiteStepLibrary() }
      } catch (error) {
        return failure(error)
      }
    }
  )

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
        // Same helper the MCP install uses: writes the embedded script into the checkout, drops it
        // from the record, and refuses rather than overwriting a different file already there.
        const { step: installed } = await buildInstalledStep(
          site,
          template,
          steps,
          input.enabled === undefined ? true : input.enabled === true
        )
        steps.push(installed)
        const updated = store.updateSite(site.id, { customSteps: steps })
        return { ok: true, value: await buildSiteSummary(updated ?? site) }
      } catch (error) {
        return failure(error)
      }
    }
  )
}
