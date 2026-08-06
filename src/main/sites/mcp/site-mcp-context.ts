// The engine seam every MCP tool codes against.
//
// Types only, and deliberately so: the tool table imports this with `import type`, so a unit test
// can drive all 24 tools against a fake Store without dragging Electron, the OS keychain or the
// run service into the module graph. The real binding lives in site-mcp-engine.ts.
//
// Nothing here exposes a secret value. `hasSshSecret` is a presence probe because that is all the
// run guard needs (site-run-plan.ts), and it is all an agent is ever allowed to learn.

import type { SiteActiveRun, SiteRun, SiteRunLogPage } from '../../../shared/site-run-types'
import type { Site, SiteRunGroup, SiteSummary } from '../../../shared/site-types'
import type { SiteRunConfig, SiteSshSession } from '../pipeline-contract'

/** The subset of Store the tools touch. The real Store satisfies this structurally. */
export type SiteMcpStore = {
  listSites: () => Site[]
  getSite: (siteId: string) => Site | null
  findSiteByPath: (sitePath: string) => Site | null
  updateSite: (siteId: string, updates: Partial<Omit<Site, 'id'>>) => Site | null
}

/** ocsites' get_git_status payload, snake_cased to keep existing agent prompts working. */
export type SiteGitStatus = {
  branch: string
  detached_head: boolean
  remote_url: string
  has_upstream: boolean
  ahead: number
  behind: number
  last_commit: string
  dirty: boolean
  dirty_file_count: number
}

export type SiteMcpStartRunRequest = {
  siteId: string
  siteName: string
  group: SiteRunGroup
  environment: string
  branch: string | null
}

export type SiteMcpContext = {
  /** The agent's working directory — resolves an omitted `site` to the checkout it is editing. */
  cwd: string
  store: SiteMcpStore
  summarize: (site: Site) => Promise<SiteSummary>
  summarizeAll: (sites: Site[]) => Promise<SiteSummary[]>
  /** Presence only. A run is blocked on a missing credential; the value never leaves the host. */
  hasSshSecret: (siteId: string, environment: string) => boolean
  /** Carries stored secrets to a new environment name. Values pass through the store, never here. */
  copyEnvironmentSecrets: (siteId: string, from: string, to: string) => void
  deleteEnvironmentSecrets: (siteId: string, environment: string) => void
  /** Null when the checkout is not a git repository or is unreadable. */
  gitStatus: (sitePath: string) => Promise<SiteGitStatus | null>
  listRuns: (siteId: string, limit: number) => SiteRun[]
  readRunLog: (siteId: string, runId: string, maxLines: number) => SiteRunLogPage
  listActiveRuns: () => SiteActiveRun[]
  startRun: (request: SiteMcpStartRunRequest) => SiteRun
  cancelRun: (runId: string) => boolean
  /**
   * Opens an SSH session against one environment. Injected for the same reason the pipelines
   * inject theirs: the tool table's tests drive every tool without touching a socket.
   */
  openSshSession: (config: SiteRunConfig, signal: AbortSignal) => Promise<SiteSshSession>
  /**
   * Aborts every in-flight run and waits for it to unwind. The host that spawned this server can
   * close the pipe mid-deploy, and exiting without this orphans the ssh/mysqldump grandchildren
   * the run engine goes to some trouble to tree-kill.
   */
  shutdownRuns: () => Promise<void>
}

/** The JSON Schema subset every tool advertises. Objects only, closed, so a model cannot guess. */
export type SiteMcpJsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
}

export type SiteMcpTool = {
  name: string
  description: string
  inputSchema: SiteMcpJsonSchema
  run: (context: SiteMcpContext, args: Record<string, unknown>) => Promise<unknown>
}
