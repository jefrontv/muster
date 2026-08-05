// Builds the renderer-facing view of a site: stored config plus derived, non-secret status
// (does the checkout still exist, what branch is it on, which environment would a run target).
//
// Branch resolution is what makes `git checkout staging` deploy to staging, so it is read live
// rather than cached — a stale branch here would silently retarget a deploy.

import { existsSync } from 'node:fs'
import {
  countSelectedToggles,
  resolveSiteEnvironment,
  type Site,
  type SiteSecretPresence,
  type SiteSummary
} from '../../shared/site-types'
import { commandExecFileAsync } from '../git/runner'
import { getSiteSecretPresence } from './site-secret-store'
import { resolveSiteWpDir } from './site-run-config'

const BRANCH_READ_TIMEOUT_MS = 5_000

export async function readSiteBranch(sitePath: string): Promise<string | null> {
  try {
    const { stdout } = await commandExecFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: sitePath,
      timeout: BRANCH_READ_TIMEOUT_MS
    })
    const branch = stdout.trim()
    // Detached HEAD reports 'HEAD'; treat it as no branch so env resolution demands confirmation.
    return branch.length > 0 && branch !== 'HEAD' ? branch : null
  } catch {
    return null
  }
}

/**
 * Where this site's git checkout actually lives.
 *
 * A LocalWP setup moves the project into `app/public`, taking `.git` with it. Fall back to the site
 * root so a plain checkout — or a recorded WordPress root that is not there — still resolves.
 */
export function resolveSiteCheckoutDir(site: Site): string {
  const wpDir = resolveSiteWpDir(site)
  return wpDir !== site.path && existsSync(wpDir) ? wpDir : site.path
}

export async function buildSiteSummary(site: Site): Promise<SiteSummary> {
  const pathExists = existsSync(site.path)
  // Why the WordPress root, not the site root: a LocalWP setup relocates the checkout into
  // `app/public`, so `.git` no longer sits at site.path — and `git rev-parse` only walks up. Reading
  // the site root there reports "no branch", which then silently retargets environment resolution.
  const branch = pathExists ? await readSiteBranch(resolveSiteCheckoutDir(site)) : null
  const resolvedEnvironment = resolveSiteEnvironment(site, branch)

  const secrets: Record<string, SiteSecretPresence> = {}
  for (const name of Object.keys(site.environments)) {
    secrets[name] = getSiteSecretPresence(site.id, name)
  }

  const active = resolvedEnvironment.environment
  const environment = active ? site.environments[active] : undefined
  return {
    site,
    pathExists,
    branch,
    resolvedEnvironment,
    secrets,
    importSelectedCount: environment ? countSelectedToggles(environment, 'import') : 0,
    deploySelectedCount: environment ? countSelectedToggles(environment, 'deploy') : 0
  }
}

export async function buildSiteSummaries(sites: Site[]): Promise<SiteSummary[]> {
  return Promise.all(sites.map((site) => buildSiteSummary(site)))
}
