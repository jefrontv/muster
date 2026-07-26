// IPC for the guided `muster://configure` setup wizard.
//
// Read-only by design: both channels answer "what could happen next", and neither writes anything.
// Every stage the plan describes is executed through the channel that already owns it —
// repos:clone, siteBind:confirm, siteStacks:runMigration, siteRuns:start — so there stays exactly
// one implementation of each action and the wizard is only ever a view over them.
//
// Follows ipc/site-bind.ts: a removeHandler prologue so a re-register cannot double-bind, tagged
// SiteResult unions instead of exceptions across the bridge, and bounded validation on every
// argument so a compromised renderer cannot push an unbounded string into a lookup.

import { ipcMain } from 'electron'
import type { SiteSetupCloneResolution, SiteSetupPlan } from '../../shared/site-setup-flow-types'
import type { Store } from '../persistence'
import { resolveSiteSetupCloneTargets } from '../sites/site-setup-clone-targets'
import { buildSiteSetupPlan } from '../sites/site-setup-plan'
import { failure, type SiteResult } from './sites-result'

const SITE_SETUP_CHANNELS = ['siteSetup:plan', 'siteSetup:cloneTargets'] as const

const MAX_FIELD_LENGTH = 256

export function registerSiteSetupHandlers(store: Store): void {
  for (const channel of SITE_SETUP_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'siteSetup:plan',
    async (_event, args: unknown): Promise<SiteResult<SiteSetupPlan>> => {
      try {
        const input = (args ?? {}) as { siteId?: unknown; reponame?: unknown; branch?: unknown }
        const branch = readOptionalField(input.branch, 'branch')
        return {
          ok: true,
          value: await buildSiteSetupPlan(store, {
            siteId: requireId(input.siteId),
            reponame: readOptionalField(input.reponame, 'reponame'),
            // Absent and empty both mean "no branch known", which environment resolution reads as
            // an unmatched branch — an empty string would instead match no environment by name.
            branch: branch || null
          })
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Split out from the plan so the dialog can retry just this stage after the user configures the
  // connector, without re-probing Local and the run planner for an answer that has not changed.
  ipcMain.handle(
    'siteSetup:cloneTargets',
    async (_event, args: unknown): Promise<SiteResult<SiteSetupCloneResolution>> => {
      try {
        const input = (args ?? {}) as { reponame?: unknown }
        return {
          ok: true,
          value: await resolveSiteSetupCloneTargets(readOptionalField(input.reponame, 'reponame'))
        }
      } catch (error) {
        return failure(error)
      }
    }
  )
}

function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError('siteId must be a non-empty string')
  }
  return value
}

/** Absent, null, and empty all collapse to '' — the caller decides what that means. */
function readOptionalField(value: unknown, name: string): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError(`${name} must be a string of at most ${MAX_FIELD_LENGTH} characters`)
  }
  return value.trim()
}
