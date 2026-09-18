// Shared doubles for the site-tool tests: a run context that records what it was told, a config
// over a real temp directory, and a scripted SSH session. No sockets, no WP-CLI, no MySQL.

import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../shared/site-types'
import type { SiteMcpContext } from './mcp/site-mcp-context'
import type { AcfStateStore } from './wp-acf-state-store'
import {
  SiteRunCancelledError,
  type SiteExecOptions,
  type SiteExecResult,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteRunProgress,
  type SiteSshSession,
  type SiteTransferProgress
} from './pipeline-contract'

export type ToolTestContext = {
  context: SiteRunContext
  statuses: string[]
  logs: string[]
  progress: SiteRunProgress[]
  cancel: () => void
}

export function createToolTestContext(): ToolTestContext {
  const controller = new AbortController()
  const statuses: string[] = []
  const logs: string[] = []
  const progress: SiteRunProgress[] = []
  return {
    statuses,
    logs,
    progress,
    cancel: () => controller.abort(),
    context: {
      signal: controller.signal,
      log: (line) => logs.push(line),
      status: (stage) => statuses.push(stage),
      progress: (entry) => progress.push(entry),
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

export type ToolConfigOverrides = {
  environment?: Partial<SiteEnvironment>
  site?: Partial<Site>
  dbPassword?: string
  sshPassword?: string
}

export function createToolConfig(
  wpDir: string,
  overrides: ToolConfigOverrides = {}
): SiteRunConfig {
  const environment: SiteEnvironment = {
    ...createEmptySiteEnvironment(),
    hostname: 'srv.example.com',
    username: 'deploy',
    rootPath: 'public_html',
    liveDomain: 'acme.com.au',
    ...overrides.environment
  }
  const site: Site = {
    id: 'site-1',
    path: wpDir,
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: environment },
    notes: '',
    searchReplaceTimeoutSeconds: 0,
    ...overrides.site
  }
  return {
    site,
    environmentName: 'main',
    environment,
    group: 'import',
    wpDir,
    sshPassword: overrides.sshPassword ?? 'ssh-secret',
    dbPassword: overrides.dbPassword ?? 'db-secret'
  }
}

export type FakeExecHandler = (
  command: string,
  options?: SiteExecOptions
) => Partial<SiteExecResult> | undefined

export type FakeDownloadHandler = (
  remotePath: string,
  localPath: string,
  onProgress?: SiteTransferProgress
) => Promise<void>

export type FakeSshSession = {
  session: SiteSshSession
  commands: string[]
  secureFiles: { path: string; contents: string }[]
  removed: string[]
  closed: number
}

/**
 * A session whose exec answers come from `handler`. Returning undefined means "exit 0, no output",
 * so a test only scripts the commands it cares about.
 */
export function createFakeSshSession(
  handler: FakeExecHandler = () => undefined,
  download: FakeDownloadHandler = async () => undefined
): FakeSshSession {
  const fake: FakeSshSession = {
    commands: [],
    secureFiles: [],
    removed: [],
    closed: 0,
    session: {
      exec: async (command, options) => {
        fake.commands.push(command)
        const scripted = handler(command, options) ?? {}
        return {
          code: scripted.code ?? 0,
          stdout: scripted.stdout ?? '',
          stderr: scripted.stderr ?? ''
        }
      },
      download: (remotePath, localPath, onProgress) => download(remotePath, localPath, onProgress),
      upload: async () => undefined,
      writeSecureRemoteFile: async (path, contents) => {
        fake.secureFiles.push({ path, contents })
      },
      removeRemoteFile: async (path) => {
        fake.removed.push(path)
      },
      close: async () => {
        fake.closed += 1
      }
    }
  }
  return fake
}

/** The `test -f .../wp-load.php` probe answer that makes resolveRemoteLayout report a standard site. */
export const STANDARD_LAYOUT_EXEC: FakeExecHandler = (command) => {
  if (command.includes('bedrock-root')) {
    return { stdout: 'standard\n' }
  }
  if (command.includes('wp-config.php') && command.includes('echo yes')) {
    return { stdout: 'yes\n' }
  }
  return undefined
}

export type FakeMcpExec = (command: string) => { code: number; stdout: string; stderr: string }

export type FakeMcpContextOptions = {
  branch?: string | null
  acfState?: AcfStateStore
  exec?: FakeMcpExec
  /** Stands in for the walker writing its snapshot beside the payload. */
  download?: (remotePath: string, localPath: string) => void
  /** Every file the tools upload, in order, so a test can read the payload that was sent. */
  uploads?: { path: string; contents: string }[]
}

export function fakeMcpSite(): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: {
      main: {
        ...createEmptySiteEnvironment(),
        hostname: 'acme.example.com',
        username: 'deploy',
        liveDomain: 'acme.com',
        deployThemes: true
      }
    },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
}

/** An MCP context with one site, a scripted SSH session and no Electron anywhere near it. */
export function createFakeSiteMcpContext(options: FakeMcpContextOptions = {}): SiteMcpContext {
  const site = fakeMcpSite()
  const branch = options.branch === undefined ? 'main' : options.branch
  const summarize = async () => ({
    site,
    pathExists: true,
    branch,
    resolvedEnvironment: {
      environment: 'main',
      reason: branch === 'main' ? ('branch-match' as const) : ('active-environment' as const),
      requiresConfirmation: branch !== 'main'
    },
    secrets: { main: { ssh: true, db: true } },
    importSelectedCount: 0,
    deploySelectedCount: 1
  })
  return {
    cwd: site.path,
    store: {
      listSites: () => [site],
      getSite: (siteId) => (siteId === site.id ? site : null),
      findSiteByPath: () => site,
      updateSite: () => site
    },
    ...(options.acfState ? { acfState: options.acfState } : {}),
    annotatePlan: async () => ({ requestId: 'r1' }),
    collectPlanReview: async () => ({ status: 'unknown' as const }),
    updateSite: async () => site,
    summarize,
    summarizeAll: async (sites) => Promise.all(sites.map(() => summarize())),
    hasSshSecret: () => true,
    copyEnvironmentSecrets: () => undefined,
    deleteEnvironmentSecrets: () => undefined,
    gitStatus: async () => null,
    listRuns: () => [],
    readRunLog: () => ({ run: null, lines: [], truncatedEarlier: 0, firstErrorIndex: -1 }),
    listActiveRuns: () => [],
    startRun: () => {
      throw new Error('not used')
    },
    cancelRun: () => false,
    openSshSession: async () => ({
      exec: async (command: string) => {
        if (command.includes('bedrock-root')) {
          return { code: 0, stdout: 'standard\n', stderr: '' }
        }
        if (command.includes('wp-config.php')) {
          return { code: 0, stdout: 'yes\n', stderr: '' }
        }
        return options.exec?.(command) ?? { code: 0, stdout: 'ok', stderr: '' }
      },
      download: async (remotePath: string, localPath: string) => {
        options.download?.(remotePath, localPath)
      },
      upload: async () => undefined,
      writeSecureRemoteFile: async (path, contents) => {
        options.uploads?.push({ path, contents })
      },
      removeRemoteFile: async () => undefined,
      close: async () => undefined
    }),
    shutdownRuns: async () => undefined
  }
}
