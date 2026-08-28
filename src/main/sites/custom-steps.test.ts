import { describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment, type Site, type SiteCustomStep } from '../../shared/site-types'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'
import { customStepsNeedRemote, resolveCustomStepCommand, runCustomSteps } from './custom-steps'

function step(overrides: Partial<SiteCustomStep> = {}): SiteCustomStep {
  return {
    id: overrides.id ?? 'step-1',
    name: 'Clear cache',
    group: 'deploy',
    runsOn: 'remote',
    command: 'wp cache flush',
    position: 'after',
    order: 0,
    enabled: true,
    ...overrides
  }
}

function config(steps: SiteCustomStep[]): SiteRunConfig {
  const site = {
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
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    customSteps: steps
  } satisfies Site
  return {
    site,
    environmentName: 'main',
    environment: {
      ...createEmptySiteEnvironment(),
      rootPath: 'public_html',
      liveDomain: 'acme.com'
    },
    group: 'deploy',
    wpDir: '/Sites/acme',
    sshPassword: '',
    dbPassword: ''
  }
}

function context(overrides: Partial<SiteRunContext> = {}): SiteRunContext & { logs: string[] } {
  const logs: string[] = []
  return {
    logs,
    signal: new AbortController().signal,
    log: (line) => logs.push(line),
    status: () => undefined,
    progress: () => undefined,
    throwIfCancelled: () => undefined,
    ...overrides
  }
}

function session(
  exec = vi.fn(async (_command: string, _options?: unknown) => ({
    code: 0,
    stdout: '',
    stderr: ''
  }))
): {
  session: SiteSshSession
  exec: typeof exec
} {
  return {
    exec,
    session: {
      exec,
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: async () => undefined,
      removeRemoteFile: async () => undefined,
      close: async () => undefined
    }
  }
}

describe('resolveCustomStepCommand', () => {
  it('substitutes placeholders with shell-quoted values', () => {
    const resolved = resolveCustomStepCommand(
      'ls {{remoteRoot}}',
      { remoteRoot: 'public html' },
      'x'
    )
    expect(resolved).toBe("ls 'public html'")
  })

  it('quotes a value containing a quote so it cannot break out of the argument', () => {
    const resolved = resolveCustomStepCommand('echo {{name}}', { name: "it's" }, 'x')
    expect(resolved).toBe(`echo 'it'\\''s'`)
  })

  it('rejects an unknown placeholder instead of substituting an empty string', () => {
    expect(() =>
      resolveCustomStepCommand('rm -rf {{nope}}/x', { sitePath: '/a' }, 'Danger')
    ).toThrow(SiteRunStepError)
  })
})

describe('runCustomSteps', () => {
  it('runs enabled steps of the matching group and position, in order', async () => {
    const { session: ssh, exec } = session()
    const steps = [
      step({ id: 'b', name: 'second', order: 1, command: 'echo two' }),
      step({ id: 'a', name: 'first', order: 0, command: 'echo one' })
    ]
    await runCustomSteps(context(), config(steps), 'deploy', 'after', ssh)

    expect(exec.mock.calls.map((call) => call[0])).toEqual(['echo one', 'echo two'])
  })

  it('skips disabled steps, the other group, and the other position', async () => {
    const { session: ssh, exec } = session()
    const steps = [
      step({ id: 'off', enabled: false }),
      step({ id: 'other-group', group: 'import' }),
      step({ id: 'other-position', position: 'before' })
    ]
    await runCustomSteps(context(), config(steps), 'deploy', 'after', ssh)

    expect(exec).not.toHaveBeenCalled()
  })
  it('fails the run when a step exits non-zero, naming the step', async () => {
    const exec = vi.fn(async () => ({ code: 3, stdout: '', stderr: 'boom' }))
    const { session: ssh } = session(exec)

    const error = await runCustomSteps(
      context(),
      config([step({ name: 'Clear cache' })]),
      'deploy',
      'after',
      ssh
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SiteRunStepError)
    expect((error as SiteRunStepError).step).toBe('Custom step: Clear cache')
    expect((error as SiteRunStepError).message).toContain('code 3')
  })

  it('refuses a remote step when the run has no SSH session rather than silently skipping it', async () => {
    await expect(
      runCustomSteps(context(), config([step({ runsOn: 'remote' })]), 'deploy', 'after', null)
    ).rejects.toThrow(/no SSH session/)
  })

  it('runs a local step through the injected command runner, in the site checkout', async () => {
    const runCommand = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }))
    const steps = [step({ runsOn: 'local', command: 'npm run build' })]

    await runCustomSteps(context(), config(steps), 'deploy', 'after', null, {
      runCommand: runCommand as never
    })

    expect(runCommand).toHaveBeenCalledTimes(1)
    const [, args, options] = runCommand.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string }
    ]
    expect(args).toEqual(['-c', 'npm run build'])
    expect(options.cwd).toBe('/Sites/acme')
  })

  it('stops between steps when the run is cancelled', async () => {
    const { session: ssh, exec } = session()
    let calls = 0
    const cancelling = context({
      throwIfCancelled: () => {
        calls += 1
        if (calls > 1) {
          throw new SiteRunCancelledError()
        }
      }
    })
    const steps = [step({ id: 'a', order: 0 }), step({ id: 'b', order: 1 })]

    await expect(runCustomSteps(cancelling, config(steps), 'deploy', 'after', ssh)).rejects.toThrow(
      SiteRunCancelledError
    )
    expect(exec).toHaveBeenCalledTimes(1)
  })
})

describe('customStepsNeedRemote', () => {
  it('is true only when an enabled step of the group runs on the server', () => {
    expect(customStepsNeedRemote(config([step({ runsOn: 'remote' })]), 'deploy')).toBe(true)
    expect(customStepsNeedRemote(config([step({ runsOn: 'local' })]), 'deploy')).toBe(false)
    expect(
      customStepsNeedRemote(config([step({ runsOn: 'remote', enabled: false })]), 'deploy')
    ).toBe(false)
    expect(customStepsNeedRemote(config([step({ runsOn: 'remote' })]), 'import')).toBe(false)
  })
})
