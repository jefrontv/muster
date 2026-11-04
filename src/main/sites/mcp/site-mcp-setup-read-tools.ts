// Read-only project and site setup lookups. Muster answers them, so they need the app open; they
// run whenever the sites MCP is on, setting or not, because they change nothing.

import type {
  CloneSourceListResult,
  CloneSourceProvider
} from '../../../shared/site-clone-source-types'
import type { SiteDiscoveryResult, SiteRootEntry } from '../../../shared/site-discovery-types'
import { activeSetupStage, type SiteSetupPlan } from '../../../shared/site-setup-flow-types'
import type { LocalWpStackDetection } from '../../../shared/site-stack-types'
import type { SiteLocalStack } from '../../../shared/site-types'
import { readNumber, readString, resolveMcpSite, SiteMcpToolError } from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { LIMIT_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type ProjectRow = {
  id: string
  name: string
  path: string
  kind: string
  host: string
  site: { id: string; name: string } | null
}

function matches(needle: string, ...values: string[]): boolean {
  return needle.length === 0 || values.some((value) => value.toLowerCase().includes(needle))
}

async function searchCloneSource(
  context: SiteMcpContext,
  provider: string,
  query: string
): Promise<CloneSourceListResult> {
  const answer = (await context.readSetup('clone-sources', {
    provider,
    query
  })) as CloneSourceListResult
  // A host that does not search remotely returns everything; filter it here instead.
  const repos = answer.searchesRemotely
    ? answer.repos
    : answer.repos.filter((repo) => matches(query.toLowerCase(), repo.fullName))
  return { ...answer, repos }
}

function shapeRepoResults(
  answers: CloneSourceListResult[],
  limit: number
): Record<string, unknown> {
  const repos = answers
    .flatMap((answer) => answer.repos)
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
  const errors = answers
    .filter((answer) => answer.error.length > 0)
    .map((answer) => `${answer.provider}: ${answer.error}`)
  return {
    searched: answers.map((answer) => answer.provider),
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
    count: Math.min(repos.length, limit),
    truncated: answers.some((answer) => answer.truncated) || repos.length > limit,
    repos: repos.slice(0, limit).map((repo) => ({
      provider: repo.provider,
      full_name: repo.fullName,
      clone_url: repo.cloneUrl,
      description: repo.description,
      private: repo.isPrivate,
      updated_at: repo.updatedAt ? new Date(repo.updatedAt).toISOString() : null
    }))
  }
}

export const SITE_MCP_SETUP_READ_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'list_projects',
    description:
      "List the projects in Muster's Code sidebar: path, kind (git or folder), host, and the site linked to each, if any. Needs Muster open.",
    inputSchema: objectSchema({
      query: { type: 'string', description: 'Case-insensitive substring of the name or path.' },
      ...LIMIT_PROPERTY
    }),
    async run(context, args) {
      const needle = readString(args, 'query').toLowerCase()
      const limit = readNumber(args, 'limit', DEFAULT_LIMIT, MAX_LIMIT)
      const all = ((await context.readSetup('projects', {})) ?? []) as ProjectRow[]
      const matched = all.filter((project) => matches(needle, project.name, project.path))
      return {
        ok: true,
        count: Math.min(matched.length, limit),
        total: matched.length,
        projects: matched.slice(0, limit)
      }
    }
  },
  {
    name: 'list_clone_sources',
    description:
      'Find a git repository to clone when a project is not in Muster yet. With `query` (a project or client name), searches every connected host (GitHub, Bitbucket) at once and returns matching repos with clone URLs. Search here before asking the user for a repo URL. Without arguments: which hosts are connected. Needs Muster open.',
    inputSchema: objectSchema({
      query: { type: 'string', description: 'Project or client name to search repo names for.' },
      provider: {
        type: 'string',
        enum: ['bitbucket', 'github'],
        description: 'Search one host only.'
      },
      ...LIMIT_PROPERTY
    }),
    async run(context, args) {
      const provider = readString(args, 'provider')
      const query = readString(args, 'query')
      const limit = readNumber(args, 'limit', DEFAULT_LIMIT, MAX_LIMIT)
      if (provider.length > 0) {
        const answer = await searchCloneSource(context, provider, query)
        return { ok: answer.error.length === 0, ...shapeRepoResults([answer], limit) }
      }
      const listed = (await context.readSetup('clone-sources', {})) as {
        providers: CloneSourceProvider[]
      }
      const providers = listed?.providers ?? []
      if (query.length === 0) {
        return { ok: true, providers }
      }
      const connected = providers.filter((candidate) => candidate.configured)
      if (connected.length === 0) {
        return { ok: false, providers, error: 'No git host is connected in Muster.' }
      }
      const answers = await Promise.all(
        connected.map((candidate) => searchCloneSource(context, candidate.id, query))
      )
      return {
        ok: answers.some((answer) => answer.error.length === 0),
        ...shapeRepoResults(answers, limit)
      }
    }
  },
  {
    name: 'discover_site_folders',
    description:
      'Scan the site root folders for checkouts that are not Muster sites yet. Also reports the roots scanned and `primary_root`, where a new project should be cloned. Needs Muster open.',
    inputSchema: objectSchema({}),
    async run(context) {
      const answer = (await context.readSetup('site-folders', {})) as SiteDiscoveryResult & {
        configuredRoots: SiteRootEntry[]
      }
      return {
        ok: true,
        primary_root: answer.primaryRoot,
        roots: answer.roots,
        configured_roots: answer.configuredRoots,
        truncated: answer.truncated,
        candidates: answer.candidates.map((candidate) => ({
          path: candidate.path,
          name: candidate.displayName,
          kind: candidate.kind,
          is_git_repo: candidate.isGitRepo
        }))
      }
    }
  },
  {
    name: 'get_setup_plan',
    description:
      'What a site still needs before it can run: each setup stage (target, bind, stack, import) with its state and what blocks it, plus `next_stage`. Follow this order rather than guessing. Needs Muster open.',
    inputSchema: objectSchema({
      ...SITE_PROPERTY,
      environment: {
        type: 'string',
        description: 'Environment the first import will use. Omit to use the branch match.'
      }
    }),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const summary = await context.summarize(site)
      const plan = (await context.readSetup('setup-plan', {
        siteId: site.id,
        branch: summary.branch ?? '',
        environment: readString(args, 'environment')
      })) as SiteSetupPlan
      return {
        ok: true,
        site: site.displayName,
        site_id: site.id,
        next_stage: activeSetupStage(plan),
        stages: plan.stages,
        stack: plan.stack,
        import: plan.import,
        clone: plan.clone
      }
    }
  },
  {
    name: 'detect_local_stack',
    description:
      'Which local stack (Agent Local, DDEV or LocalWP) serves a site or folder, and which stacks are installed on this machine. Pass `site` or an absolute `path`. Needs Muster open.',
    inputSchema: objectSchema({
      ...SITE_PROPERTY,
      path: {
        type: 'string',
        description: 'Absolute folder path, for a folder that is not a site.'
      }
    }),
    async run(context, args) {
      const path = readString(args, 'path')
      const selector = readString(args, 'site')
      if (path && selector) {
        throw new SiteMcpToolError('Pass `site` or `path`, not both.')
      }
      const site = path ? null : resolveMcpSite(context, selector)
      const answer = (await context.readSetup('local-stack', {
        path: site?.path ?? path,
        preferred: site?.localStack ?? ''
      })) as { detection: LocalWpStackDetection; installed: SiteLocalStack[] }
      const detection = answer.detection
      return {
        ok: true,
        path: site?.path ?? path,
        ...(site ? { site: site.displayName } : {}),
        serving_stack: detection.registered ? detection.stack : null,
        detection,
        installed_stacks: answer.installed
      }
    }
  }
]
