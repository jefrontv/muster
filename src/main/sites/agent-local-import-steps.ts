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
import { AGENT_LOCAL_DATABASE_LOAD_STAGE } from '../../shared/site-run-types'
import {
  AgentLocalImportError,
  importDatabaseViaDaemon,
  probeSiteViaDaemon,
  readAgentLocalStatus,
  readMediaFallbackViaDaemon,
  readRecentSiteErrors,
  searchReplaceViaDaemon,
  type AgentLocalImportApiOptions,
  type AgentLocalMediaFallback
} from './agent-local-import-api'
import {
  AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION,
  agentLocalVersionAtLeast
} from './agent-local-version'
import { agentLocalCertStatus } from './agent-local-cert'
import { resolveAgentLocalSite } from './agent-local-site-resolve'
import { SiteRunStepError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'
import { buildDomainRewritePairs } from './wp-domain-rewrite-pairs'
import { prepareLocalWpConfig } from './wp-search-replace'

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
export type AgentLocalRoutes =
  /** `domain` is what the daemon serves the site on; the rewrite targets it, not the record. */
  { slug: string; domain: string } | { slug: null; reason: string }

export type AgentLocalImportStepOptions = AgentLocalImportApiOptions & {
  /** Injectable for tests; defaults to the real resolver. */
  resolveSite?: (
    site: Pick<Site, 'path' | 'localStack' | 'localWpRoot'>
  ) => Promise<{ slug: string; domain: string } | null>
}

async function defaultResolveSite(
  site: Pick<Site, 'path' | 'localStack' | 'localWpRoot'>,
  options: AgentLocalImportApiOptions
): Promise<{ slug: string; domain: string } | null> {
  const { match } = await resolveAgentLocalSite(site, options)
  return match ? { slug: match.slug, domain: match.domain } : null
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
  return { slug: resolved.slug, domain: resolved.domain || config.site.localDomain }
}

/**
 * The stack is authoritative for the domain it serves. A record that drifted (pact.local stored,
 * pact.al served) sent every rewrite to a host nothing answers on, and the probe then reported
 * the site redirecting "off-site" to Muster's own idea of it.
 */
function servingConfig(config: SiteRunConfig, domain: string): SiteRunConfig {
  return domain.length > 0 && domain !== config.site.localDomain
    ? { ...config, site: { ...config.site, localDomain: domain } }
    : config
}

/** https when the site's certificate is trusted, else http: an http override beside https rows redirects every asset. */
async function servedScheme(
  config: SiteRunConfig,
  options: AgentLocalImportApiOptions
): Promise<'http' | 'https'> {
  if (!config.site.localDomain) {
    return 'http'
  }
  const cert = await agentLocalCertStatus(config.site.localDomain, options).catch(() => null)
  return cert?.exists && cert.trusted ? 'https' : 'http'
}

/**
 * Replaces snapshot + `gunzip | mysql`. The daemon snapshots first and fails the import when that
 * snapshot fails, so a full disk is an error here rather than a warning. `keepUrls: false` lets the
 * daemon rewrite whatever hosts the dump's own home/siteurl name; the explicit liveDomain pass in
 * `rewriteDomainViaAgentLocal` follows, and is usually a no-op.
 */
export async function importDatabaseViaAgentLocal(
  context: SiteRunContext,
  runConfig: SiteRunConfig,
  routes: { slug: string; domain: string },
  dumpPath: string,
  options: AgentLocalImportApiOptions = {}
): Promise<void> {
  const { slug } = routes
  const config = servingConfig(runConfig, routes.domain)
  context.status(AGENT_LOCAL_DATABASE_LOAD_STAGE)
  // The daemon's own URL rewrite boots WP-CLI against wp-config.php as it is right now - which,
  // before "Pull server files" has run this time, is whatever the last run left: possibly the
  // production config. Point it at the local stack first; prepared again after files land.
  await prepareLocalWpConfig(context, config, { scheme: await servedScheme(config, options) })
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
  runConfig: SiteRunConfig,
  routes: { slug: string; domain: string; databaseImported?: boolean },
  options: AgentLocalImportApiOptions = {}
): Promise<void> {
  const { slug } = routes
  const config = servingConfig(runConfig, routes.domain)
  const localDomain = config.site.localDomain
  const liveDomain = config.environment.liveDomain
  if (!localDomain || !liveDomain) {
    context.status('Skipping WP Search and Replace: Local or Live domain not specified')
    return
  }
  if (localDomain !== runConfig.site.localDomain) {
    context.log(
      `Agent Local serves this site on ${localDomain}, not ${runConfig.site.localDomain || '(none)'}; rewriting to ${localDomain}.`
    )
  }
  const pairs = buildDomainRewritePairs(liveDomain, localDomain)
  if (pairs.length === 0) {
    context.log(
      `Skipping WP Search and Replace: ${liveDomain} and ${localDomain} are the same host.`
    )
    return
  }
  context.status('Rewriting domain through Agent Local…')
  // Production wp-config.php arrived in base.zip since the load: its DB constants must point at the
  // local stack before the daemon boots WP-CLI, or the rewrite fails on "Error establishing a
  // database connection" (seen live).
  await prepareLocalWpConfig(context, config, { scheme: await servedScheme(config, options) })
  try {
    let total = 0
    let configPinsRewritten = false
    // Deduplicated: a column hit by both the www and the bare pass is still one column.
    const columns = new Set<string>()
    for (const [index, pair] of pairs.entries()) {
      const report = await searchReplaceViaDaemon({
        slug,
        from: pair.from,
        to: pair.to,
        // One save point per run: the import's own, else the first pass's.
        snapshot: routes.databaseImported !== true && index === 0,
        signal: context.signal,
        options
      })
      total += report.total
      configPinsRewritten ||= report.configPinsRewritten
      for (const hit of report.hits) {
        columns.add(`${hit.table}.${hit.column}`)
      }
    }
    context.log(
      total === 0
        ? `No rows still referenced ${liveDomain}.`
        : `Replaced ${total} reference(s) to ${liveDomain} across ${columns.size} column(s).`
    )
    if (configPinsRewritten) {
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
 * Confirms the uploads rewrite actually fires. The step that writes it only writes .htaccess, and
 * Agent Local runs no Apache — it parses that file itself — so "rule added successfully" described
 * a file write, not behaviour, while every wp-content/uploads request 404ed (jefrontv/muster#29).
 *
 * A disagreement is a warning, never a failure: the database is already in and the fix is one
 * command away.
 */
export async function verifyUploadFallbackViaAgentLocal(
  context: SiteRunContext,
  runConfig: SiteRunConfig,
  routes: { slug: string; domain: string },
  options: AgentLocalImportApiOptions = {}
): Promise<void> {
  const { liveDomain, liveDomainProtocol } = runConfig.environment
  if (!liveDomain) {
    return
  }
  let media: AgentLocalMediaFallback
  try {
    media = await readMediaFallbackViaDaemon({
      slug: routes.slug,
      signal: context.signal,
      options
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    context.log(`⚠ Could not confirm the upload fallback with Agent Local: ${detail}`)
    return
  }
  const expected = `${liveDomainProtocol}://${liveDomain}`
  // `effective` only exists on newer daemons. Unknown is not a problem: say where uploads go.
  const cannotFire = media.effective === false
  if (media.origin === expected && !cannotFire) {
    context.log(`Missing uploads fall back to ${expected}.`)
    return
  }
  const kind = media.kind.length > 0 ? ` Agent Local records this site as "${media.kind}".` : ''
  const fix = `Run \`agent-local doctor ${routes.slug}\`.`
  context.log(`⚠ ${describeBrokenFallback(media, expected, cannotFire)}${kind} ${fix}`)
}

function describeBrokenFallback(
  media: AgentLocalMediaFallback,
  expected: string,
  cannotFire: boolean
): string {
  if (media.origin.length === 0) {
    return 'Agent Local serves no upload fallback for this site, so missing wp-content/uploads requests will 404 despite the .htaccess rule.'
  }
  // A stale record leaves the site with an empty uploads prefix, so a correct rule still cannot fire.
  if (cannotFire) {
    return `Agent Local has the ${media.origin} fallback but cannot apply it: this site has no uploads prefix, so missing wp-content/uploads requests will 404.`
  }
  return `Agent Local sends missing uploads to ${media.origin}, not the ${expected} the .htaccess rule asks for.`
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
  const logsErrors = probe.verdict === 'fatal' || probe.verdict === 'error'
  if (logsErrors) {
    for (const entry of await readRecentSiteErrors({ slug, limit: 5, options })) {
      const where = entry.file.length > 0 ? ` (${entry.file}:${entry.line})` : ''
      context.log(`  ${entry.level}: ${entry.message}${where}`)
    }
  }
  // The daemon says `fatal` for any PHP fatal logged during the request, before it looks at what
  // the page did. A homepage that rendered with a fatal in a late callback (an old plugin on a new
  // PHP, seen live with WP Rocket 3.4 on 8.4) is a site with a bug, not a failed import.
  const homeRendered = probe.home !== null && probe.home.status === 200 && probe.home.bodyBytes > 0
  if (logsErrors && homeRendered) {
    context.log(
      `⚠ Site check: the homepage renders, but PHP logged an error while serving it - ${probe.reason}`
    )
    return
  }
  throw new SiteRunStepError(VERDICT_STEP, `The site does not work after the import - ${detail}`)
}
