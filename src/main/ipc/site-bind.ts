// IPC surface for the `muster://` bind flow and the Bitbucket workspace browser.
//
// Follows ipc/site-runs.ts: a removeHandler prologue so a re-register cannot double up, tagged-union
// results instead of exceptions, and sender.send for the push half guarded against a destroyed
// renderer.
//
// Nothing here ever carries the bind link's password. `handleSiteBindUrl` takes the raw URL, hands
// it straight to the intake (which keeps the secret in main), and returns only ok/error — so no
// caller, log line, or IPC payload can echo the credential.

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { ipcMain, type WebContents } from 'electron'
import type {
  BitbucketCredentialStatus,
  BitbucketRepoListResult,
  PendingSiteBind,
  SiteBindApplied,
  SiteBindFields
} from '../../shared/site-bind-types'
import type { SiteResult, SiteSummary } from '../../shared/site-types'
import type { Store } from '../persistence'
import {
  getBitbucketCredentialStatus,
  setBitbucketCredentials
} from '../sites/bitbucket-credential-store'
import {
  isBitbucketListingConfigured,
  resolveBitbucketListingCredentials
} from '../sites/bitbucket-listing-auth'
import {
  detectBitbucketWorkspace,
  fetchBitbucketJson,
  listBitbucketWorkspaceRepos
} from '../sites/bitbucket-workspace-repos'
import { createSiteBindIntake, type SiteBindIntake } from '../sites/site-bind-intake'
import { generateSiteBindUrl, parseSiteBindUrl } from '../sites/site-bind-url'
import { setSiteSecret } from '../sites/site-secret-store'
import { buildSiteSummary } from '../sites/site-summary'
import { failure, requireSite } from './sites-result'

const SITE_BIND_CHANNELS = [
  'siteBind:pending',
  'siteBind:dismiss',
  'siteBind:confirm',
  'siteBind:generate',
  'siteBitbucket:status',
  'siteBitbucket:setCredentials',
  'siteBitbucket:listRepos'
] as const

const REQUEST_EVENT_CHANNEL = 'siteBind:request'

const MAX_GENERATE_FIELD_LENGTH = 4_096
const MAX_WORKSPACE_LENGTH = 128
const MAX_APP_PASSWORD_LENGTH = 512

const GENERATE_FIELD_KEYS = [
  'reponame',
  'hostname',
  'username',
  'rootPath',
  'liveDomain',
  'environment',
  'deployCommand',
  'themeDistPath',
  'notes'
] as const

const subscribers = new Set<WebContents>()

let intake: SiteBindIntake | null = null

/**
 * On macOS `open-url` can fire before `whenReady`, so a cold-start link would otherwise be dropped.
 * Buffered raw and replayed once the intake exists; cleared immediately after.
 */
let bufferedUrl: string | null = null

/**
 * Fed by `app.on('open-url')` (macOS) and the `second-instance` argv elsewhere. Returns whether the
 * link was understood — never the link itself, which can carry a plaintext password.
 */
export function handleSiteBindUrl(url: string): { ok: boolean; error: string } {
  const active = intake
  if (!active) {
    bufferedUrl = url
    // Not an error: the link is staged and replayed as soon as the handlers register.
    return { ok: true, error: '' }
  }
  const received = active.receive(url)
  if (!received.ok) {
    return { ok: false, error: received.error }
  }
  for (const sender of subscribers) {
    if (sender.isDestroyed()) {
      subscribers.delete(sender)
      continue
    }
    sender.send(REQUEST_EVENT_CHANNEL, received.pending)
  }
  return { ok: true, error: '' }
}

function readGenerateFields(
  value: unknown
): (Partial<SiteBindFields> & { password?: string }) | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const input = value as Record<string, unknown>
  const fields: Partial<SiteBindFields> & { password?: string } = {}
  for (const key of GENERATE_FIELD_KEYS) {
    const entry = input[key]
    if (entry === undefined) {
      continue
    }
    if (typeof entry !== 'string' || entry.length > MAX_GENERATE_FIELD_LENGTH) {
      return null
    }
    fields[key] = entry
  }
  if (input.liveDomainProtocol !== undefined) {
    if (input.liveDomainProtocol !== 'http' && input.liveDomainProtocol !== 'https') {
      return null
    }
    fields.liveDomainProtocol = input.liveDomainProtocol
  }
  if (input.password !== undefined) {
    if (typeof input.password !== 'string' || input.password.length > MAX_GENERATE_FIELD_LENGTH) {
      return null
    }
    fields.password = input.password
  }
  return fields
}

export function registerSiteBindHandlers(store: Store): void {
  for (const channel of SITE_BIND_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  intake = createSiteBindIntake({
    store: {
      listSites: () => store.listSites(),
      getRepos: () => store.getRepos(),
      findSiteByPath: (sitePath) => store.findSiteByPath(sitePath),
      upsertSite: (site) => store.upsertSite(site)
    },
    directoryExists: (candidatePath) => existsSync(candidatePath),
    storeSecret: (siteId, environment, password) =>
      setSiteSecret(siteId, environment, 'ssh', password),
    newId: () => randomUUID()
  })
  const active = intake

  if (bufferedUrl !== null) {
    const replayed = bufferedUrl
    bufferedUrl = null
    active.receive(replayed)
  }

  // The catch-up call: a link can arrive before the renderer has mounted, so the dialog asks for
  // the pending request on mount and subscribes for later ones on the same call.
  ipcMain.handle('siteBind:pending', (event): SiteResult<PendingSiteBind | null> => {
    subscribers.add(event.sender)
    return { ok: true, value: active.getPending() }
  })

  ipcMain.handle('siteBind:dismiss', (_event, requestId: unknown): SiteResult<null> => {
    active.dismiss(typeof requestId === 'string' ? requestId : undefined)
    return { ok: true, value: null }
  })

  // The explicit-consent gate: a link stages a request, only this call writes anything.
  ipcMain.handle(
    'siteBind:confirm',
    async (
      _event,
      args: unknown
    ): Promise<SiteResult<{ applied: SiteBindApplied; summary: SiteSummary }>> => {
      try {
        const input = (args ?? {}) as { requestId?: unknown; path?: unknown }
        if (typeof input.requestId !== 'string' || typeof input.path !== 'string') {
          throw new TypeError('siteBind:confirm requires { requestId, path }')
        }
        const applied = active.confirm(input.requestId, input.path)
        const summary = await buildSiteSummary(requireSite(store, applied.siteId))
        return { ok: true, value: { applied, summary } }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Round-trips through the parser so a dashboard can never be handed a link Muster would reject.
  ipcMain.handle('siteBind:generate', (_event, args: unknown): SiteResult<string> => {
    try {
      const fields = readGenerateFields(args)
      if (!fields) {
        return { ok: false, error: 'Invalid bind link fields.' }
      }
      const url = generateSiteBindUrl(fields)
      const parsed = parseSiteBindUrl(url)
      return parsed.ok ? { ok: true, value: url } : { ok: false, error: parsed.error }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteBitbucket:status', (): SiteResult<BitbucketCredentialStatus> => {
    try {
      const stored = getBitbucketCredentialStatus()
      return {
        ok: true,
        value: {
          ...stored,
          configured: isBitbucketListingConfigured()
        }
      }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteBitbucket:setCredentials', (_event, args: unknown): SiteResult<null> => {
    try {
      const input = (args ?? {}) as {
        username?: unknown
        appPassword?: unknown
        workspace?: unknown
      }
      const update: { username?: string; appPassword?: string; workspace?: string } = {}
      if (input.username !== undefined) {
        if (typeof input.username !== 'string' || input.username.length > MAX_WORKSPACE_LENGTH) {
          throw new TypeError('username must be a short string')
        }
        update.username = input.username.trim()
      }
      if (input.appPassword !== undefined) {
        if (
          typeof input.appPassword !== 'string' ||
          input.appPassword.length > MAX_APP_PASSWORD_LENGTH
        ) {
          throw new TypeError('appPassword must be a short string')
        }
        update.appPassword = input.appPassword.trim()
      }
      if (input.workspace !== undefined) {
        if (typeof input.workspace !== 'string' || input.workspace.length > MAX_WORKSPACE_LENGTH) {
          throw new TypeError('workspace must be a short string')
        }
        update.workspace = input.workspace.trim()
      }
      setBitbucketCredentials(update)
      return { ok: true, value: null }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'siteBitbucket:listRepos',
    async (_event, args: unknown): Promise<SiteResult<BitbucketRepoListResult>> => {
      try {
        const input = (args ?? {}) as { workspace?: unknown; refresh?: unknown }
        const requested =
          typeof input.workspace === 'string' && input.workspace.length <= MAX_WORKSPACE_LENGTH
            ? input.workspace.trim()
            : ''
        const stored = getBitbucketCredentialStatus().workspace
        // A bind link naming `workspace/slug` lets the picker browse before anything is configured.
        const fromLink = detectBitbucketWorkspace(active.getPending()?.suggestedCloneUrl ?? '')
        return {
          ok: true,
          value: await listBitbucketWorkspaceRepos({
            workspace: requested || stored || fromLink,
            credentials: await resolveBitbucketListingCredentials(),
            fetchJson: fetchBitbucketJson,
            preferCache: input.refresh !== true
          })
        }
      } catch (error) {
        return failure(error)
      }
    }
  )
}
