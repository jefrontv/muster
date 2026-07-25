// Read-only discovery tools: list_sites, find_sites, workspace_overview, get_git_status.
//
// Ported from ocsites mcp_server.py:2657 / :3049 / :3107. Everything here delegates to the Store
// and buildSiteSummary; the only computation is aggregation the engine does not already do.

import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import { SITE_IMPORT_TOGGLES } from '../../../shared/site-types'
import { readNumber, readString, resolveMcpSite } from './site-mcp-arguments'
import type { SiteMcpTool } from './site-mcp-context'
import { LIMIT_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

const DEFAULT_LIST_LIMIT = 25
const MAX_LIST_LIMIT = 200
const MAX_REPORTED_BRANCHES = 20
const TOP_N = 10

const DEFAULT_BRANCHES: readonly string[] = ['main', 'master']

/** Descending by count, then name, so repeated calls return a stable ordering. */
function topEntries(counts: Map<string, number>, key: string): Record<string, unknown>[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TOP_N)
    .map(([value, count]) => ({ [key]: value, count }))
}

export const SITE_MCP_DISCOVERY_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'list_sites',
    description:
      'List configured WordPress sites with their checkout path, current git branch, and the environment a run would target right now.',
    inputSchema: objectSchema({
      query: {
        type: 'string',
        description: 'Case-insensitive substring of the site name or path.'
      },
      ...LIMIT_PROPERTY
    }),
    async run(context, args) {
      const query = readString(args, 'query')
      const limit = readNumber(args, 'limit', DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)
      const needle = query.toLowerCase()
      const all = context.store.listSites()
      const path = normalizeRuntimePathForComparison(query)
      const matched =
        needle.length === 0
          ? all
          : all.filter(
              (site) =>
                site.displayName.toLowerCase().includes(needle) ||
                normalizeRuntimePathForComparison(site.path).includes(path)
            )
      const summaries = await context.summarizeAll(matched.slice(0, Math.max(1, limit)))
      return {
        ok: true,
        count: summaries.length,
        total: matched.length,
        sites: summaries.map((summary) => ({
          name: summary.site.displayName,
          site_id: summary.site.id,
          path: summary.site.path,
          path_exists: summary.pathExists,
          branch: summary.branch ?? '',
          environments: Object.keys(summary.site.environments),
          resolved_environment: summary.resolvedEnvironment.environment,
          import_selected: summary.importSelectedCount,
          deploy_selected: summary.deploySelectedCount
        }))
      }
    }
  },
  {
    name: 'find_sites',
    description:
      'Search every site for a matching remote hostname, live domain, or environment name. Substring and case-insensitive.',
    inputSchema: objectSchema({
      hostname: { type: 'string', description: 'Substring of the SSH hostname.' },
      live_domain: { type: 'string', description: 'Substring of the live domain.' },
      env_name: { type: 'string', description: 'Exact environment name.' }
    }),
    async run(context, args) {
      const hostname = readString(args, 'hostname').toLowerCase()
      const liveDomain = readString(args, 'live_domain').toLowerCase()
      const envName = readString(args, 'env_name')
      if (hostname.length === 0 && liveDomain.length === 0 && envName.length === 0) {
        return { ok: false, error: 'Supply at least one of hostname, live_domain, env_name.' }
      }
      const matches: Record<string, unknown>[] = []
      for (const site of context.store.listSites()) {
        const matchingEnvs = Object.entries(site.environments)
          .filter(
            ([name, environment]) =>
              (hostname.length > 0 && environment.hostname.toLowerCase().includes(hostname)) ||
              (liveDomain.length > 0 &&
                environment.liveDomain.toLowerCase().includes(liveDomain)) ||
              (envName.length > 0 && name === envName)
          )
          .map(([name]) => name)
        if (matchingEnvs.length > 0) {
          matches.push({
            site: site.displayName,
            site_id: site.id,
            path: site.path,
            matching_envs: matchingEnvs
          })
        }
      }
      return { ok: true, match_count: matches.length, matches }
    }
  },
  {
    name: 'workspace_overview',
    description:
      'Aggregate stats across every configured site: how many are wired up, how many have multiple environments, which are on a non-default branch, and the most common hostnames.',
    inputSchema: objectSchema({}),
    async run(context) {
      const summaries = await context.summarizeAll(context.store.listSites())
      const hostCounts = new Map<string, number>()
      const envNameCounts = new Map<string, number>()
      const nonDefaultBranch: string[] = []
      let configured = 0
      let multiEnv = 0
      let importsEnabled = 0
      let missingPath = 0

      for (const summary of summaries) {
        const names = Object.keys(summary.site.environments)
        if (names.length > 0) {
          configured += 1
        }
        if (names.length > 1) {
          multiEnv += 1
        }
        if (!summary.pathExists) {
          missingPath += 1
        }
        for (const name of names) {
          envNameCounts.set(name, (envNameCounts.get(name) ?? 0) + 1)
          const host = summary.site.environments[name]?.hostname ?? ''
          if (host.length > 0) {
            hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
          }
        }
        if (summary.branch && !DEFAULT_BRANCHES.includes(summary.branch)) {
          nonDefaultBranch.push(summary.site.displayName)
        }
        const active = summary.resolvedEnvironment.environment
        const environment = active ? summary.site.environments[active] : undefined
        if (environment && SITE_IMPORT_TOGGLES.some((toggle) => environment[toggle.key])) {
          importsEnabled += 1
        }
      }

      return {
        ok: true,
        sites_total: summaries.length,
        sites_with_config: configured,
        sites_with_multi_env: multiEnv,
        sites_with_missing_path: missingPath,
        sites_on_non_default_branch: nonDefaultBranch.slice(0, MAX_REPORTED_BRANCHES),
        sites_on_non_default_branch_count: nonDefaultBranch.length,
        sites_with_imports_enabled: importsEnabled,
        top_hostnames: topEntries(hostCounts, 'hostname'),
        top_env_names: topEntries(envNameCounts, 'name')
      }
    }
  },
  {
    name: 'get_git_status',
    description:
      'Return git status for a site: current branch, remote URL, ahead/behind counts, last commit summary, and dirty-working-tree flag.',
    inputSchema: objectSchema({ ...SITE_PROPERTY }),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const status = await context.gitStatus(site.path)
      if (!status) {
        return { ok: false, site: site.displayName, path: site.path, error: 'not a git repository' }
      }
      return { ok: true, site: site.displayName, path: site.path, ...status }
    }
  }
]
