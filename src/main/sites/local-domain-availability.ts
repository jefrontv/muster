// Whether another local site already holds a domain, asked of each stack's own registry.
//
// Read-only and best effort: a stack that is not installed or does not answer in time is skipped,
// because its run-time check still refuses a real clash. The site's own folder never counts, so
// re-running setup on a site that is already served stays allowed.

import path from 'node:path'
import type { SiteLocalStack } from '../../shared/site-types'
import { listAgentLocalSites } from './agent-local-site-resolve'
import { createDdevHost, type DdevHost } from './ddev-host'
import { registeredProjects } from './ddev-project-setup'
import { readLocalWpSites } from './localwp-detection'
import { createLocalWpHost } from './localwp-host'

export type LocalDomainClash = { stack: SiteLocalStack; name: string; path: string }

type LocalSiteEntry = { stack: SiteLocalStack; host: string; name: string; path: string }

export type LocalDomainSources = {
  ddev: () => Promise<LocalSiteEntry[]>
  agentLocal: () => Promise<LocalSiteEntry[]>
  localWp: () => Promise<LocalSiteEntry[]>
}

const SOURCE_TIMEOUT_MS = 3_000

/** Host only, lowercase: `FOO.local:8443` and `https://foo.local/` name the same site. */
export function domainHost(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/:].*$/, '')
}

function sameOrNested(left: string, right: string): boolean {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`)
}

async function withinBudget<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), SOURCE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([work.catch(() => fallback), timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function createLocalDomainSources(
  ddevHost: DdevHost = createDdevHost()
): LocalDomainSources {
  return {
    ddev: async () =>
      [...(await registeredProjects(ddevHost))].map(([name, approot]) => ({
        stack: 'ddev' as const,
        host: `${name}.ddev.site`,
        name,
        path: approot
      })),
    agentLocal: async () =>
      ((await listAgentLocalSites()) ?? []).map((site) => ({
        stack: 'agent-local' as const,
        host: domainHost(site.domain),
        name: site.slug,
        path: site.workDir || site.wpDir
      })),
    localWp: async () =>
      Object.values(await readLocalWpSites(createLocalWpHost())).map((site) => ({
        stack: 'localwp' as const,
        host: domainHost(typeof site.domain === 'string' ? site.domain : ''),
        name: typeof site.name === 'string' ? site.name : '',
        path: typeof site.path === 'string' ? site.path : ''
      }))
  }
}

/**
 * The first site, in another folder, that answers for this domain. A DDEV name is only DDEV's to
 * hold (`.ddev.site` resolves publicly); any other domain is checked against every stack, because
 * two stacks writing one hostname into /etc/hosts break each other.
 */
export async function findLocalDomainClash(
  request: { sitePath: string; stack: SiteLocalStack; domain: string },
  sources: LocalDomainSources = createLocalDomainSources()
): Promise<LocalDomainClash | null> {
  const wanted = domainHost(request.domain)
  if (wanted.length === 0) {
    return null
  }
  const asked =
    request.stack === 'ddev' ? [sources.ddev] : [sources.agentLocal, sources.localWp, sources.ddev]
  const lists = await Promise.all(asked.map((read) => withinBudget(read(), [])))
  const clash = lists
    .flat()
    .find(
      (entry) =>
        entry.host === wanted &&
        entry.path.length > 0 &&
        !sameOrNested(entry.path, request.sitePath)
    )
  return clash ? { stack: clash.stack, name: clash.name, path: clash.path } : null
}
