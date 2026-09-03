// Holds a received `muster://` bind link until the user explicitly confirms it.
//
// A link may never write anything on its own: the OS hands Muster a URL that anybody could have
// crafted, so this module only *stages* it. The renderer shows what would be written, the user
// picks the local checkout, and only then does confirm() touch the Site record or the keychain.
//
// The password is kept in a module-private slot keyed by request id — never in the PendingSiteBind
// that crosses IPC — and is wiped on confirm, dismiss, or replacement by a newer link.

import {
  createEmptySiteEnvironment,
  DEFAULT_SITE_ENVIRONMENT_NAME,
  type Site
} from '../../shared/site-types'
import type {
  PendingSiteBind,
  SiteBindApplied,
  SiteBindCandidate,
  SiteBindFields
} from '../../shared/site-bind-types'
import { isSitePath } from '../ipc/sites-payload-validation'
import { bitbucketCloneUrlForReponame, parseSiteBindUrl } from './site-bind-url'
import { repoSlug as bitbucketRepoSlug } from '../../shared/site-local-domain'

/** The slice of Store this module needs, so intake is testable without Electron or persistence. */
export type SiteBindIntakeStore = {
  listSites: () => Site[]
  getRepos: () => { id: string; path: string; displayName: string }[]
  findSiteByPath: (sitePath: string) => Site | null
  upsertSite: (site: Site) => Site
}

export type SiteBindIntakeDeps = {
  store: SiteBindIntakeStore
  directoryExists: (candidatePath: string) => boolean
  /** Throws when the OS keychain is unavailable; the site still binds, minus the password. */
  storeSecret: (siteId: string, environment: string, password: string) => void
  newId: () => string
  now?: () => number
}

export type SiteBindIntake = {
  receive: (url: unknown) => { ok: true; pending: PendingSiteBind } | { ok: false; error: string }
  getPending: () => PendingSiteBind | null
  dismiss: (requestId?: string) => void
  confirm: (requestId: string, targetPath: string) => SiteBindApplied
}

function pathSegments(value: string): string[] {
  return value.split(/[/\\]/).filter((segment) => segment.length > 0)
}

/**
 * Local checkouts whose folder name matches the link's repo slug. ocsites searched its configured
 * roots (cli.py:2246); Muster already knows every site and every repo, so it matches against those
 * instead of walking the filesystem.
 *
 * `exists` is probed per candidate rather than assumed: a Site or Repo record outlives the folder it
 * points at (deleted checkout, unmounted volume), and a candidate that claims to exist would offer
 * "confirming updates it" for a path confirm() then rejects. A missing folder must present as a new
 * site instead.
 */
function findCandidates(
  store: SiteBindIntakeStore,
  fields: SiteBindFields,
  directoryExists: (candidatePath: string) => boolean
): SiteBindCandidate[] {
  const slug = bitbucketRepoSlug(fields.reponame)
  const byPath = new Map<string, SiteBindCandidate>()

  for (const site of store.listSites()) {
    const name = pathSegments(site.path).at(-1) ?? ''
    if (slug.length > 0 && name.toLowerCase() !== slug) {
      continue
    }
    byPath.set(site.path, {
      path: site.path,
      displayName: site.displayName,
      siteId: site.id,
      repoId: site.repoId,
      exists: directoryExists(site.path)
    })
  }

  for (const repo of store.getRepos()) {
    const name = pathSegments(repo.path).at(-1) ?? ''
    if (slug.length === 0 || name.toLowerCase() !== slug) {
      continue
    }
    const existing = byPath.get(repo.path)
    if (existing) {
      byPath.set(repo.path, { ...existing, repoId: existing.repoId ?? repo.id })
      continue
    }
    byPath.set(repo.path, {
      path: repo.path,
      displayName: repo.displayName,
      siteId: null,
      repoId: repo.id,
      exists: directoryExists(repo.path)
    })
  }

  // Present reachable checkouts first so the dialog never preselects a stale record.
  return [...byPath.values()].sort((a, b) => Number(b.exists) - Number(a.exists))
}

/** Link fields overwrite the environment's connection details; toggles are the user's, so they stay. */
function mergeEnvironment(site: Site, environment: string, fields: SiteBindFields): Site {
  const existing = site.environments[environment] ?? createEmptySiteEnvironment()
  return {
    ...site,
    activeEnvironment: environment,
    environments: {
      ...site.environments,
      [environment]: {
        ...existing,
        hostname: fields.hostname,
        username: fields.username,
        rootPath: fields.rootPath,
        liveDomain: fields.liveDomain || existing.liveDomain,
        liveDomainProtocol: fields.liveDomainProtocol,
        deployCommand: fields.deployCommand || existing.deployCommand,
        themeDistPath: fields.themeDistPath || existing.themeDistPath
      }
    }
  }
}

function newSite(id: string, targetPath: string, repoId: string | null): Site {
  return {
    id,
    path: targetPath,
    repoId,
    displayName: pathSegments(targetPath).at(-1) ?? targetPath,
    localWpRoot: '',
    localDomain: '',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: DEFAULT_SITE_ENVIRONMENT_NAME,
    environments: {},
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
}

export function createSiteBindIntake(deps: SiteBindIntakeDeps): SiteBindIntake {
  const clock = deps.now ?? Date.now
  let pending: PendingSiteBind | null = null
  let pendingPassword = ''

  const clear = (): void => {
    pending = null
    pendingPassword = ''
  }

  return {
    receive(url) {
      const parsed = parseSiteBindUrl(url)
      if (!parsed.ok) {
        return { ok: false, error: parsed.error }
      }
      // A newer link replaces the old one outright so at most one password is ever held.
      pendingPassword = parsed.password
      pending = {
        requestId: deps.newId(),
        receivedAt: clock(),
        fields: parsed.fields,
        passwordProvided: parsed.password.length > 0,
        candidates: findCandidates(deps.store, parsed.fields, deps.directoryExists),
        suggestedCloneUrl: bitbucketCloneUrlForReponame(parsed.fields.reponame)
      }
      return { ok: true, pending }
    },

    getPending() {
      return pending
    },

    dismiss(requestId) {
      if (requestId === undefined || pending?.requestId === requestId) {
        clear()
      }
    },

    confirm(requestId, targetPath) {
      if (!pending || pending.requestId !== requestId) {
        throw new Error('That bind request is no longer pending.')
      }
      if (!isSitePath(targetPath)) {
        throw new TypeError('Choose an absolute folder to bind.')
      }
      if (!deps.directoryExists(targetPath)) {
        throw new Error(`That folder does not exist yet: ${targetPath}`)
      }

      const { fields } = pending
      const password = pendingPassword
      const environment = fields.environment || DEFAULT_SITE_ENVIRONMENT_NAME
      const existing = deps.store.findSiteByPath(targetPath)
      const matchedRepo = pending.candidates.find((entry) => entry.path === targetPath)
      const base = existing ?? newSite(deps.newId(), targetPath, matchedRepo?.repoId ?? null)

      const saved = deps.store.upsertSite({
        ...mergeEnvironment(base, environment, fields),
        // Ported from ocsites tui_deploy.py:341 — a link must not clobber a local domain the user
        // already chose; it only fills the blank.
        localDomain: base.localDomain || fields.localDomain,
        notes: base.notes || fields.notes
      })

      let secretStored = false
      let secretError = ''
      if (password.length > 0) {
        try {
          deps.storeSecret(saved.id, environment, password)
          secretStored = true
        } catch (error) {
          // The message comes from the secret store, which never includes the value.
          secretError = error instanceof Error ? error.message : String(error)
        }
      }
      clear()

      return {
        siteId: saved.id,
        path: saved.path,
        environment,
        created: existing === null,
        secretStored,
        secretError
      }
    }
  }
}
