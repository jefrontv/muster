import { describe, expect, it } from 'vitest'

import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { SiteEnvironment } from '../../shared/site-types'
import { SiteRunStepError } from './pipeline-contract'
import type {
  SiteExecOptions,
  SiteExecResult,
  SiteRunConfig,
  SiteRunContext,
  SiteSshSession
} from './pipeline-contract'
import { clearRemoteServerCache, pullRemoteGitChanges } from './remote-maintenance'

type Recorder = {
  context: SiteRunContext
  logs: string[]
  stages: string[]
}

function createRecordingContext(): Recorder {
  const logs: string[] = []
  const stages: string[] = []
  return {
    logs,
    stages,
    context: {
      signal: new AbortController().signal,
      log: (line) => logs.push(line),
      status: (stage) => stages.push(stage),
      progress: () => {},
      throwIfCancelled: () => {}
    }
  }
}

function createConfig(environment: Partial<SiteEnvironment> = {}): SiteRunConfig {
  const resolved: SiteEnvironment = {
    ...createEmptySiteEnvironment(),
    hostname: 'acme.example.com',
    username: 'acme',
    ...environment
  }
  return {
    site: {
      id: 'site-1',
      path: '/sites/acme',
      repoId: null,
      displayName: 'Acme',
      localWpRoot: '',
      localDomain: 'acme.local',
      localStack: 'localwp',
      dbUser: 'root',
      dbSocket: '',
      dbPort: null,
      phpVersion: '8.2',
      activeEnvironment: 'main',
      environments: { main: resolved },
      notes: '',
      searchReplaceTimeoutSeconds: 600
    },
    environmentName: 'main',
    environment: resolved,
    group: 'deploy',
    wpDir: '/sites/acme',
    sshPassword: 'ssh-secret',
    dbPassword: 'db-secret'
  }
}

type ExecScript = (command: string) => Partial<SiteExecResult>

function createFakeSession(script: ExecScript): {
  session: SiteSshSession
  commands: string[]
  execOptions: (SiteExecOptions | undefined)[]
} {
  const commands: string[] = []
  const execOptions: (SiteExecOptions | undefined)[] = []
  const session: SiteSshSession = {
    exec: async (command, options) => {
      commands.push(command)
      execOptions.push(options)
      return { code: 0, stdout: '', stderr: '', ...script(command) }
    },
    download: async () => {},
    upload: async () => {},
    writeSecureRemoteFile: async () => {},
    removeRemoteFile: async () => {},
    close: async () => {}
  }
  return { session, commands, execOptions }
}

describe('clearRemoteServerCache', () => {
  it('empties wp-content/cache with the glob left unquoted so the remote shell expands it', async () => {
    const { context, stages } = createRecordingContext()
    const { session, commands } = createFakeSession(() => ({}))

    await clearRemoteServerCache(context, createConfig({ rootPath: 'public_html' }), session)

    expect(commands).toEqual([`cd 'public_html/wp-content/cache' && rm -rf */`])
    expect(stages).toEqual(['Clearing server cache'])
  })

  it('quotes a root path containing a single quote', async () => {
    const { context } = createRecordingContext()
    const { session, commands } = createFakeSession(() => ({}))

    await clearRemoteServerCache(context, createConfig({ rootPath: "o'brien/html" }), session)

    expect(commands[0]).toBe(`cd 'o'\\''brien/html/wp-content/cache' && rm -rf */`)
  })

  it('fails on any stderr, because a partially cleared cache serves stale pages', async () => {
    const { context } = createRecordingContext()
    const { session } = createFakeSession(() => ({ stderr: 'permission denied\n' }))

    await expect(clearRemoteServerCache(context, createConfig(), session)).rejects.toThrowError(
      /Error clearing server cache: permission denied/
    )
  })

  it('fails on a non-zero exit with no stderr', async () => {
    const { context } = createRecordingContext()
    const { session } = createFakeSession(() => ({ code: 1 }))

    const error = await clearRemoteServerCache(context, createConfig(), session).catch(
      (thrown: unknown) => thrown
    )
    expect(error).toBeInstanceOf(SiteRunStepError)
    expect((error as SiteRunStepError).step).toBe('clear-server-cache')
  })

  it('logs remote stdout when there is any', async () => {
    const { context, logs } = createRecordingContext()
    const { session } = createFakeSession(() => ({ stdout: '  removed 4 dirs \n' }))

    await clearRemoteServerCache(context, createConfig(), session)

    expect(logs).toEqual(['removed 4 dirs'])
  })
})

describe('pullRemoteGitChanges', () => {
  it('probes for .git before pulling and quotes the root path', async () => {
    const { context, stages } = createRecordingContext()
    const { session, commands } = createFakeSession(() => ({ stdout: 'Already up to date.' }))

    await pullRemoteGitChanges(context, createConfig({ rootPath: 'public_html' }), session)

    expect(commands).toEqual([`cd 'public_html' && [ -d .git ]`, `cd 'public_html' && git pull`])
    expect(stages).toEqual(['Pulling latest changes on the server'])
  })

  it('runs the pull with no deadline, so a kill cannot leave the remote index locked', async () => {
    const { context } = createRecordingContext()
    const { session, execOptions } = createFakeSession(() => ({}))

    await pullRemoteGitChanges(context, createConfig(), session)

    expect(execOptions[0]).toBeUndefined()
    expect(execOptions[1]).toEqual({ timeoutMs: 0 })
  })

  it('refuses to pull when the remote root is not a repository', async () => {
    const { context } = createRecordingContext()
    const { session, commands } = createFakeSession((command) =>
      command.includes('[ -d .git ]') ? { code: 1 } : {}
    )

    await expect(
      pullRemoteGitChanges(context, createConfig({ rootPath: 'public_html' }), session)
    ).rejects.toThrowError('Not a Git repository: public_html')
    expect(commands).toHaveLength(1)
  })

  it('surfaces git stderr when the pull fails', async () => {
    const { context } = createRecordingContext()
    const { session } = createFakeSession((command) =>
      command.includes('git pull') ? { code: 1, stderr: 'local changes would be overwritten' } : {}
    )

    await expect(pullRemoteGitChanges(context, createConfig(), session)).rejects.toThrowError(
      'local changes would be overwritten'
    )
  })

  it('falls back to a generic message when a failed pull said nothing', async () => {
    const { context } = createRecordingContext()
    const { session } = createFakeSession((command) =>
      command.includes('git pull') ? { code: 128 } : {}
    )

    await expect(pullRemoteGitChanges(context, createConfig(), session)).rejects.toThrowError(
      'git pull failed'
    )
  })

  it('ignores stderr on a successful pull, because git writes progress there', async () => {
    const { context, logs } = createRecordingContext()
    const { session } = createFakeSession((command) =>
      command.includes('git pull')
        ? { stdout: 'Fast-forward', stderr: 'From bitbucket.org:acme/site' }
        : {}
    )

    await pullRemoteGitChanges(context, createConfig(), session)

    expect(logs).toEqual(['Fast-forward'])
  })
})
