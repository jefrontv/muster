// The import pipeline's agent-local branch: load the dump, rewrite the domain and check the site
// through the daemon's own routes, which run with the site's PHP and need no `mysql` or `wp` on
// the user's PATH. Everything here is gated twice - the site must be on agent-local, and the
// daemon must be new enough - and falls back to the caller's existing step otherwise, so LocalWP
// and plain sites never reach this file's network calls.
//
// Why the pipeline dispatches here rather than agent-local providing a LocalStackProvider method:
// these steps read the run's config (environment domain, dump path) and write to its log, which is
// pipeline shape, not stack shape.

import type { Site } from '../../shared/site-types'
import {
  AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION,
  AgentLocalImportError,
  agentLocalVersionAtLeast,
  importDatabaseViaDaemon,
  probeSiteViaDaemon,
  readAgentLocalStatus,
  readRecentSiteErrors,
  searchReplaceViaDaemon,
  type AgentLocalImportApiOptions
} from './agent-local-import-api'
import { resolveAgentLocalSite } from './agent-local-site-resolve'
import { SiteRunStepError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'

const VERDICT_STEP = 'Checking the site'

/** Verdicts that mean the import did not produce a working site. `slow` is a warning, not a failure. */
const FAILING_VERDICTS = new Set([
  'redirects_offsite',
  'fatal',
  'blank',
  'down',
  'error',
  'asset_404'
])

/**
 * Whether this run may use the daemon routes, decided once at the top of the run. `reason` is
 * logged when the answer is no so the fallback is never silent.
 */
export type AgentLocalRoutes = { slug: string } | { slug: null; reason: string }

export type AgentLocalImportStepOptions = AgentLocalImportApiOptions & {
  /** Injectable for tests; defaults to the real resolver. */
  resolveSite?: (
    site: Pick<Site, 'path' | 'localStack' | 'localWpRoot'>
  ) => Promise<{ slug: string } | null>
}

async function defaultResolveSite(
  site: Pick<Site, 'path' | 'localStack' | 'localWpRoot'>,
  options: AgentLocalImportApiOptions
): Promise<{ slug: string } | null> {
  const { match } = await resolveAgentLocalSite(site, options)
  return match ? { slug: match.slug } : null
}

export async function decideAgentLocalRoutes(
  config: SiteRunConfig,
  options: AgentLocalImportStepOptions = {}
): Promise<AgentLocalRoutes> {
  if (config.site.localStack !== 'agent-local') {
    return {
      slug: null,
      reason: `the site is served by ${config.site.localStack}, not Agent Local`
    }
  }
  let version = ''
  try {
    version = (await readAgentLocalStatus(options)).version
  } catch (error) {
    return {
      slug: null,
      reason: `Agent Local did not report its version (${error instanceof Error ? error.message : String(error)})`
    }
  }
  if (!agentLocalVersionAtLeast(version, AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION)) {
    return {
      slug: null,
      reason: `Agent Local ${version || '(unknown)'} is older than ${AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION}; run \`agent-local update\` to import through it`
    }
  }
  const resolved = await (options.resolveSite ?? ((site) => defaultResolveSite(site, options)))(
    config.site
  )
  if (!resolved) {
    return { slug: null, reason: 'Agent Local does not list this folder as one of its sites' }
  }
  return { slug: resolved.slug }
}

/**
 * Replaces snapshot + `gunzip | mysql`. The daemon snapshots first and fails the import when that
 * snapshot fails, so a full disk is an error here rather than a warning. `keepUrls: false` lets the
 * daemon rewrite whatever hosts the dump's own home/siteurl name; the explicit liveDomain pass in
 * `rewriteDomainViaAgentLocal` follows, and is usually a no-op.
 */
export async function importDatabaseViaAgentLocal(
  context: SiteRunContext,
  slug: string,
  dumpPath: string,
  options: AgentLocalImportApiOptions = {}
): Promise<void> {
  context.status('Loading database through Agent Local…')
  try {
    const summary = await importDatabaseViaDaemon({
      slug,
      dumpPath,
      keepUrls: false,
      signal: context.signal,
      onProgress: (progress) => context.log(`${progress.stage}: ${progress.detail}`),
      options
    })
    context.log(summary)
  } catch (error) {
    if (error instanceof AgentLocalImportError) {
      throw new SiteRunStepError('Importing database', error.message)
    }
    throw error
  }
  context.status('Database imported')
}

/**
 * Replaces the system `wp search-replace`. Also the step that closes the wp-config pin gap: the
 * daemon repoints WP_HOME/WP_SITEURL/EFRONT_URL_OVERRIDE when their host is the one being replaced.
 */
export async function rewriteDomainViaAgentLocal(
  context: SiteRunContext,
  config: SiteRunConfig,
  slug: string,
  options: AgentLocalImportApiOptions = {}
): Promise<void> {
  const localDomain = config.site.localDomain
  const liveDomain = config.environment.liveDomain
  if (!localDomain || !liveDomain) {
    context.status('Skipping WP Search and Replace: Local or Live domain not specified')
    return
  }
  context.status('Rewriting domain through Agent Local…')
  try {
    const report = await searchReplaceViaDaemon({
      slug,
      from: liveDomain,
      to: localDomain,
      signal: context.signal,
      options
    })
    context.log(
      report.total === 0
        ? `No rows still referenced ${liveDomain}.`
        : `Replaced ${report.total} reference(s) to ${liveDomain} across ${report.hits.length} column(s).`
    )
    if (report.configPinsRewritten) {
      context.log(`wp-config.php URL constants repointed to ${localDomain}.`)
    }
  } catch (error) {
    if (error instanceof AgentLocalImportError) {
      throw new SiteRunStepError('WP Search and Replace', error.message)
    }
    throw error
  }
}

/**
 * The verdict the run used to skip: ask the site whether it works. `healthy` and `slow` pass
 * (`slow` as a warning line); anything else fails the run with the reason, because a site that
 * 301s to production after an import is a failed import, and the daemon's snapshot makes it
 * recoverable.
 */
export async function verifySiteViaAgentLocal(
  context: SiteRunContext,
  slug: string,
  options: AgentLocalImportApiOptions = {}
): Promise<void> {
  context.status(VERDICT_STEP)
  let probe: Awaited<ReturnType<typeof probeSiteViaDaemon>>
  try {
    probe = await probeSiteViaDaemon({ slug, signal: context.signal, options })
  } catch (error) {
    // A probe that could not run is not a verdict on the site; say so and let the run end.
    context.log(
      `⚠ Could not check the site: ${error instanceof Error ? error.message : String(error)}`
    )
    return
  }
  if (probe.verdict === 'healthy') {
    context.log('Site check: healthy.')
    return
  }
  const detail = probe.reason.length > 0 ? `${probe.verdict}: ${probe.reason}` : probe.verdict
  if (!FAILING_VERDICTS.has(probe.verdict)) {
    context.log(`⚠ Site check: ${detail}`)
    return
  }
  if (probe.verdict === 'fatal' || probe.verdict === 'error') {
    for (const entry of await readRecentSiteErrors({ slug, limit: 5, options })) {
      const where = entry.file.length > 0 ? ` (${entry.file}:${entry.line})` : ''
      context.log(`  ${entry.level}: ${entry.message}${where}`)
    }
  }
  throw new SiteRunStepError(VERDICT_STEP, `The site does not work after the import - ${detail}`)
}
