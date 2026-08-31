// Builds the renderer-facing view of a site: stored config plus derived, non-secret status
// (does the checkout still exist, what branch is it on, which environment would a run target).
//
// Branch resolution is what makes `git checkout staging` deploy to staging, so it is read live
// rather than cached — a stale branch here would silently retarget a deploy.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { localWpWordPressRoot } from '../../shared/localwp-paths'
import {
  countSelectedSteps,
  resolveSiteEnvironment,
  type Site,
  type SiteSecretPresence,
  type SiteSummary
} from '../../shared/site-types'
import { commandExecFileAsync } from '../git/runner'
import { probeRepoHeadBranches } from './repo-head-branch-probe'
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
 * Branches for many sites at once, read off disk instead of spawned.
 *
 * Why this exists: `buildSiteSummaries` fans out over every configured site, so one sidebar refresh
 * used to spawn one `git rev-parse` per site — 208 concurrent children on this operator's machine.
 * The branch is one file read away, and `probeRepoHeadBranches` already does that read with bounded
 * concurrency and the `.git`-pointer handling worktrees need.
 *
 * Both candidate directories are probed because the two readers disagree on reach: `git rev-parse`
 * walks up from its cwd, while the probe only looks at the directory it is given (and LocalWP's
 * `app/public` beneath it). A site recording a WordPress subpath while keeping `.git` at the top —
 * Bedrock's `web/`, for instance — is only found via the site root. Sites the probe cannot see at
 * all fall back to the subprocess, so no site loses its branch to this optimisation.
 */
export async function probeSiteBranches(sites: readonly Site[]): Promise<Map<string, string>> {
  const checkoutDirs = new Map<string, string>()
  const candidates = new Set<string>()
  for (const site of sites) {
    const checkoutDir = resolveSiteCheckoutDir(site)
    checkoutDirs.set(site.id, checkoutDir)
    candidates.add(checkoutDir)
    candidates.add(site.path)
  }

  const found = await probeRepoHeadBranches([...candidates])
  const branches = new Map<string, string>()
  for (const site of sites) {
    // The checkout directory wins: a nested WordPress repository describes the site, and a parent
    // repository it happens to sit inside does not.
    const branch = found[checkoutDirs.get(site.id) ?? site.path] ?? found[site.path]
    if (branch !== undefined) {
      branches.set(site.id, branch)
    }
  }
  return branches
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

/**
 * The directory that actually holds this site's `.git`, for callers that need to run git there.
 *
 * `resolveSiteCheckoutDir` trusts the site's recorded WordPress subpath, which is not always set:
 * an imported site can sit in a LocalWP-shaped folder — WordPress and `.git` under `app/public` —
 * while `localWpRoot` is empty. Both the Sites panel and the pipelines MCP tool then handed git the
 * site root, which is not a repository, and every Bitbucket lookup reported `not-bitbucket`.
 *
 * Probing `app/public` regardless of what was recorded is the same thing `project-git-dir-probe`
 * already does for branch reads, which is why branches resolved for these sites while pipelines did
 * not. Falls back to the recorded checkout so a site with no repository anywhere behaves as before.
 */
export function resolveSiteGitCheckoutDir(site: Site): string {
  const recorded = resolveSiteCheckoutDir(site)
  for (const candidate of new Set([recorded, localWpWordPressRoot(site.path), site.path])) {
    if (existsSync(join(candidate, '.git'))) {
      return candidate
    }
  }
  return recorded
}

export async function buildSiteSummary(
  site: Site,
  /**
   * Branches already read off disk by `probeSiteBranches`. A site absent from the map was not
   * visible to the probe, so it falls back to the subprocess rather than losing its branch.
   */
  probedBranches?: ReadonlyMap<string, string>
): Promise<SiteSummary> {
  const pathExists = existsSync(site.path)
  // Why the WordPress root, not the site root: a LocalWP setup relocates the checkout into
  // `app/public`, so `.git` no longer sits at site.path — and `git rev-parse` only walks up. Reading
  // the site root there reports "no branch", which then silently retargets environment resolution.
  const branch = pathExists
    ? (probedBranches?.get(site.id) ?? (await readSiteBranch(resolveSiteCheckoutDir(site))))
    : null
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
    // Custom steps are real work the run will do, so they count toward "is anything selected?" —
    // the UI gates the Import/Deploy buttons on these, and a custom-steps-only run is legitimate.
    importSelectedCount: environment ? countSelectedSteps(site, environment, 'import') : 0,
    deploySelectedCount: environment ? countSelectedSteps(site, environment, 'deploy') : 0
  }
}

export async function buildSiteSummaries(sites: Site[]): Promise<SiteSummary[]> {
  // One bounded disk sweep for every branch, so the fan-out below spawns nothing per site.
  const probedBranches = await probeSiteBranches(sites)
  return Promise.all(sites.map((site) => buildSiteSummary(site, probedBranches)))
}
