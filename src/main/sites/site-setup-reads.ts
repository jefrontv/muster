// Read-only setup lookups for agents, answered in the GUI process over the site write bridge.
// They run here because the live repo list, connector credentials and stack probes belong to the
// GUI. Each one wraps the function its IPC channel already uses, so there is one implementation.

import { isAbsolute } from 'node:path'
import type { SiteSetupReadOp } from '../../shared/site-setup-bridge-ops'
import type { SiteLocalStack } from '../../shared/site-types'
import type { Store } from '../persistence'
import { discoverSiteCandidates } from './site-candidate-discovery'
import {
  isCloneSourceProviderId,
  listCloneSourceProviders,
  listCloneSourceRepos
} from './site-clone-sources'
import { detectSiteStack } from './local-stack-detection'
import { providerFor } from './local-stack-provider'
import { describeConfiguredSiteRoots } from './site-roots-config'
import { derivePrimarySiteRoot, deriveSiteRoots } from './site-roots-watcher'
import { buildSiteSetupPlan } from './site-setup-plan'
import { waitForSiteSetupJob } from './site-setup-jobs'
import { waitForSiteSetupForAgent } from './site-setup-agent-requests'
import { importOcsitesConfig } from './ocsites-config-import'

const OFFERABLE_STACKS: SiteLocalStack[] = ['agent-local', 'ddev', 'localwp']
const MAX_FIELD_LENGTH = 1024

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

/** Long-poll budget from the MCP process; capped so one bridge request cannot hang forever. */
function waitMs(args: Record<string, unknown>): number {
  const value = typeof args.waitMs === 'number' ? args.waitMs : 0
  return Math.min(Math.max(0, value), 600_000)
}

async function installedStacks(): Promise<SiteLocalStack[]> {
  const checks = await Promise.all(
    OFFERABLE_STACKS.map(async (stack) => ({
      stack,
      available: await providerFor(stack)
        .isAvailable()
        .catch(() => false)
    }))
  )
  return checks.filter((entry) => entry.available).map((entry) => entry.stack)
}

function listProjects(store: Store): unknown {
  const sites = store.listSites()
  return store.getRepos().map((repo) => {
    const site = sites.find((candidate) => candidate.repoId === repo.id)
    return {
      id: repo.id,
      name: repo.displayName,
      path: repo.path,
      kind: repo.kind ?? 'git',
      host: repo.executionHostId ?? 'local',
      site: site ? { id: site.id, name: site.displayName } : null
    }
  })
}

async function cloneSources(store: Store, args: Record<string, unknown>): Promise<unknown> {
  const provider = field(args, 'provider')
  if (provider.length === 0) {
    return { providers: await listCloneSourceProviders() }
  }
  if (!isCloneSourceProviderId(provider)) {
    throw new TypeError('provider must be "bitbucket" or "github"')
  }
  return listCloneSourceRepos(store, provider, field(args, 'query'))
}

async function siteFolders(store: Store): Promise<unknown> {
  const discovery = await discoverSiteCandidates({
    roots: deriveSiteRoots(store),
    primaryRoot: derivePrimarySiteRoot(store),
    configuredPaths: store.listSites().map((site) => site.path)
  })
  return { ...discovery, configuredRoots: describeConfiguredSiteRoots(store) }
}

async function localStack(args: Record<string, unknown>): Promise<unknown> {
  const path = field(args, 'path')
  if (path.length === 0 || !isAbsolute(path)) {
    throw new TypeError('path must be an absolute folder path')
  }
  const preferred = field(args, 'preferred')
  const [detection, installed] = await Promise.all([
    detectSiteStack(
      path,
      OFFERABLE_STACKS.includes(preferred as SiteLocalStack)
        ? (preferred as SiteLocalStack)
        : undefined
    ),
    installedStacks()
  ])
  return { detection, installed }
}

/** What an ocsites import would bring in. Read-only, and never includes a secret value. */
function ocsitesPreview(store: Store): unknown {
  const report = importOcsitesConfig()
  return {
    found: report.found,
    configDirectory: report.configDirectory,
    skippedPresets: report.skippedPresets,
    secretsUnreadable: report.secretFailures.length,
    sites: report.sites.map(({ site, secrets }) => ({
      name: site.displayName,
      path: site.path,
      environments: Object.keys(site.environments),
      passwords: secrets.length,
      alreadyInMuster: store.findSiteByPath(site.path) !== null
    }))
  }
}

export async function readSiteSetupInfo(
  store: Store,
  op: SiteSetupReadOp,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (op) {
    case 'projects':
      return listProjects(store)
    case 'clone-sources':
      return cloneSources(store, args)
    case 'site-folders':
      return siteFolders(store)
    case 'setup-plan': {
      const siteId = field(args, 'siteId')
      if (siteId.length === 0) {
        throw new TypeError('siteId is required')
      }
      return buildSiteSetupPlan(store, {
        siteId,
        reponame: field(args, 'reponame'),
        branch: field(args, 'branch') || null,
        environment: field(args, 'environment') || null
      })
    }
    case 'local-stack':
      return localStack(args)
    case 'setup-job': {
      const job = await waitForSiteSetupJob(field(args, 'jobId'), waitMs(args))
      if (!job) {
        throw new TypeError('Unknown job id. Jobs are kept for an hour after they finish.')
      }
      return job
    }
    case 'ocsites-preview':
      return ocsitesPreview(store)
    case 'agent-setup': {
      const afterVersion = typeof args.afterVersion === 'number' ? args.afterVersion : -1
      return waitForSiteSetupForAgent(field(args, 'setupId'), afterVersion, waitMs(args))
    }
  }
}
