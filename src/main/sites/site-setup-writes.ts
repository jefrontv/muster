// Approved project and site setup writes, run in the GUI process over the site write bridge.
// Each op first spends a one-time approval for its own action, so the bridge alone cannot skip the
// card. Project writes go through the runtime, the same path the `muster` CLI uses, so the sidebar
// updates the same way.

import { randomBytes } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import type { SiteLocalStack } from '../../shared/site-types'
import type { SiteSetupWriteOp } from '../../shared/site-setup-bridge-ops'
import type { RepoIcon } from '../../shared/repo-icon'
import { fetchFaviconAsDataUrl } from '../favicon-fetch'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { adoptOrCreateSite } from './site-create'
import { addConfiguredSiteRoot } from './site-roots-config'
import { derivePrimarySiteRoot } from './site-roots-watcher'
import { startSiteSetupJob } from './site-setup-jobs'
import { openAgentSiteSetup } from './site-setup-agent-open'

export type SiteSetupWriteDeps = {
  store: Store
  runtime: () => OrcaRuntimeService | null
  consumeApproval: (approvalId: string, action: string) => boolean
  onSiteChanged: (siteId: string) => void
  /** Refetch sites and projects in the window, for records it has never seen. */
  onSitesAdded: () => void
  detectStack: (path: string, preferred: SiteLocalStack) => Promise<LocalWpStackDetection>
  /** Runs `siteStacks:runMigration`'s logic; `log` gets redacted progress lines. */
  runStackSetup: (args: Record<string, unknown>, log: (message: string) => void) => Promise<unknown>
  importOcsites: () => Promise<unknown>
  stageBindLink: (url: string) => { ok: boolean; error: string }
  republishSiteRoots: () => void
  fetchFavicon?: typeof fetchFaviconAsDataUrl
}

/** The tool name each op is approved under; the card and the write must agree. */
export const SITE_SETUP_WRITE_ACTIONS: Record<SiteSetupWriteOp, string> = {
  'create-project': 'create_project',
  'register-site': 'register_site',
  'add-site-root': 'add_site_root',
  'remove-project': 'remove_project',
  'create-worktree': 'create_worktree',
  'update-project': 'update_project',
  'set-up-local-site': 'set_up_local_site',
  'import-ocsites': 'import_site_config',
  // Staging a link only opens Muster's own bind prompt, which is the approval.
  'stage-bind-link': '',
  // Opens the Set up dialog; nothing is written until the user presses its Set up site.
  'open-agent-setup': ''
}

const MAX_FIELD_LENGTH = 2048

function field(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError(`${name} must be a string of at most ${MAX_FIELD_LENGTH} characters`)
  }
  return value.trim()
}

function absolutePath(args: Record<string, unknown>, name: string): string {
  const path = field(args, name)
  if (!path || !isAbsolute(path)) {
    throw new TypeError(`${name} must be an absolute path`)
  }
  return path
}

function requireRuntime(deps: SiteSetupWriteDeps): OrcaRuntimeService {
  const runtime = deps.runtime()
  if (!runtime) {
    throw new Error('Muster is still starting. Try again in a moment.')
  }
  return runtime
}

async function createProject(deps: SiteSetupWriteDeps, args: Record<string, unknown>) {
  const runtime = requireRuntime(deps)
  const cloneUrl = field(args, 'cloneUrl')
  if (cloneUrl) {
    const parent = field(args, 'parentDir') || derivePrimarySiteRoot(deps.store)
    if (!parent || !isAbsolute(parent)) {
      throw new TypeError(
        'parentDir must be an absolute path (no site root is set up to default to)'
      )
    }
    const name =
      cloneUrl
        .replace(/\.git$/, '')
        .split(/[/:]/)
        .at(-1) || cloneUrl
    // A clone takes minutes on a real repo; the agent polls get_setup_job and the window shows progress.
    const jobId = startSiteSetupJob('', `Cloning ${name}`, async (log, progress) => {
      log(`git clone ${cloneUrl} into ${parent}`)
      const repo = await runtime.cloneRepo(cloneUrl, parent, undefined, (update) =>
        progress(update.phase, update.percent)
      )
      deps.store.flushOrThrow()
      return {
        ok: true,
        id: repo.id,
        name: repo.displayName,
        path: repo.path,
        kind: repo.kind ?? 'git'
      }
    })
    return { job_id: jobId, status: 'cloning' }
  }
  const kind = field(args, 'kind') || 'auto'
  if (kind !== 'git' && kind !== 'folder' && kind !== 'auto') {
    throw new TypeError('kind must be "git", "folder" or "auto"')
  }
  const repo = await runtime.addRepo(absolutePath(args, 'path'), kind)
  return { id: repo.id, name: repo.displayName, path: repo.path, kind: repo.kind ?? 'git' }
}

function registerSite(deps: SiteSetupWriteDeps, args: Record<string, unknown>) {
  const { store } = deps
  const path = absolutePath(args, 'path')
  const repoId =
    field(args, 'repoId') || store.getRepos().find((repo) => repo.path === path)?.id || null
  const existing = store.findSiteByPath(path)
  let site = adoptOrCreateSite(store, {
    path,
    displayName: field(args, 'name') || undefined,
    repoId
  })
  // An adopted site keeps its record; only fill a missing project link.
  if (existing && !existing.repoId && repoId) {
    site = store.updateSite(site.id, { repoId }) ?? site
  }
  deps.onSiteChanged(site.id)
  deps.onSitesAdded()
  return {
    site_id: site.id,
    name: site.displayName,
    path: site.path,
    repo_id: site.repoId,
    adopted: existing !== null
  }
}

async function updateProject(deps: SiteSetupWriteDeps, args: Record<string, unknown>) {
  const runtime = requireRuntime(deps)
  const name = field(args, 'name')
  const faviconDomain = field(args, 'faviconDomain')
  let repoIcon: RepoIcon | undefined
  if (faviconDomain) {
    const fetched = await (deps.fetchFavicon ?? fetchFaviconAsDataUrl)(faviconDomain)
    if (!fetched.ok) {
      throw new Error(`Could not fetch the favicon for ${faviconDomain}: ${fetched.error}`)
    }
    repoIcon = { type: 'image', src: fetched.dataUrl, source: 'favicon', label: 'Website favicon' }
  }
  const repo = await runtime.updateRepo(field(args, 'repo'), {
    ...(name ? { displayName: name } : {}),
    ...(repoIcon ? { repoIcon } : {})
  })
  return { id: repo.id, name: repo.displayName, icon: repoIcon ? 'favicon' : 'unchanged' }
}

async function createWorktree(deps: SiteSetupWriteDeps, args: Record<string, unknown>) {
  const result = await requireRuntime(deps).createManagedWorktree({
    repoSelector: field(args, 'repo'),
    name: field(args, 'name'),
    ...(field(args, 'baseBranch') ? { baseBranch: field(args, 'baseBranch') } : {}),
    // Agent-made workspaces must not pull focus away from what the user is doing.
    activate: false
  })
  return { id: result.worktree.id, path: result.worktree.path, branch: result.worktree.branch }
}

const LOCAL_STACKS: SiteLocalStack[] = ['agent-local', 'ddev', 'localwp']

async function setUpLocalSite(deps: SiteSetupWriteDeps, args: Record<string, unknown>) {
  const site = deps.store.getSite(field(args, 'siteId'))
  if (!site) {
    throw new TypeError('Unknown site')
  }
  const stack = field(args, 'stack') as SiteLocalStack
  if (!LOCAL_STACKS.includes(stack)) {
    throw new TypeError('stack must be "agent-local", "ddev" or "localwp"')
  }
  const detection = await deps.detectStack(site.path, site.localStack)
  if (detection.registered && detection.stack !== 'plain') {
    throw new Error(`${detection.stack} already serves ${site.displayName}. Nothing was changed.`)
  }
  const adminEmail = field(args, 'adminEmail')
  if (stack === 'localwp' && !adminEmail) {
    throw new TypeError('adminEmail is required for LocalWP')
  }
  const jobId = startSiteSetupJob(site.id, `Set up ${site.displayName} on ${stack}`, (log) =>
    deps
      .runStackSetup(
        {
          siteId: site.id,
          stack,
          domain: field(args, 'domain'),
          adminEmail,
          // LocalWP needs a WordPress admin password; agents never supply one, so it is generated
          // here and never returned. Local's one-click admin still signs the user in.
          adminPassword: stack === 'localwp' ? randomBytes(18).toString('base64url') : '',
          force: false
        },
        log
      )
      .finally(() => deps.store.flushOrThrow())
  )
  return { job_id: jobId }
}

export async function writeSiteSetup(
  deps: SiteSetupWriteDeps,
  op: SiteSetupWriteOp,
  approvalId: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const action = SITE_SETUP_WRITE_ACTIONS[op]
  if (action && !deps.consumeApproval(approvalId, action)) {
    throw new Error('This change was not approved in Muster, or the approval was already used.')
  }
  const result = await runSiteSetupWrite(deps, op, args)
  // The MCP process reads sites from disk; the store's debounced save would hide this write from its next call.
  deps.store.flushOrThrow()
  return result
}

async function runSiteSetupWrite(
  deps: SiteSetupWriteDeps,
  op: SiteSetupWriteOp,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (op) {
    case 'create-project':
      return createProject(deps, args)
    case 'register-site':
      return registerSite(deps, args)
    case 'add-site-root': {
      const roots = addConfiguredSiteRoot(deps.store, absolutePath(args, 'path'))
      deps.republishSiteRoots()
      return { roots }
    }
    case 'remove-project':
      // Sidebar only: the runtime drops the record and never touches files on disk.
      return requireRuntime(deps).removeProject(field(args, 'repo'))
    case 'create-worktree':
      return createWorktree(deps, args)
    case 'update-project':
      return updateProject(deps, args)
    case 'set-up-local-site':
      return setUpLocalSite(deps, args)
    case 'import-ocsites': {
      const result = await deps.importOcsites()
      deps.onSitesAdded()
      return result
    }
    case 'stage-bind-link': {
      const url = field(args, 'url')
      if (!url.startsWith('muster://')) {
        throw new TypeError('url must be a muster:// link')
      }
      return deps.stageBindLink(url)
    }
    case 'open-agent-setup':
      return openAgentSiteSetup(deps.store, args)
  }
}
