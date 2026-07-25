// Shared doubles for the site-tool tests: a run context that records what it was told, a config
// over a real temp directory, and a scripted SSH session. No sockets, no WP-CLI, no MySQL.

import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../shared/site-types'
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
