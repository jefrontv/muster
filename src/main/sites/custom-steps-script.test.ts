// Script-backed custom steps: the path guard that keeps a step inside its checkout, and the
// upload/run/delete cycle that lets a multi-line script cross SSH without a quoting hazard.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptySiteEnvironment,
  customStepEnvName,
  isSafeCustomStepScriptPath,
  type Site,
  type SiteCustomStep
} from '../../shared/site-types'
import {
  SiteRunStepError,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'
import { buildCustomStepEnv, resolveCustomStepScriptPath, runCustomSteps } from './custom-steps'

let checkout: string

function step(overrides: Partial<SiteCustomStep> = {}): SiteCustomStep {
  return {
    id: 'step-1',
    name: 'Purge CDN',
    group: 'deploy',
    runsOn: 'remote',
    command: '',
    scriptPath: '.muster/steps/purge.sh',
    position: 'after',
    order: 0,
    enabled: true,
    ...overrides
  }
}

function config(steps: SiteCustomStep[]): SiteRunConfig {
  const site = {
    id: 'site-1',
    path: checkout,
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
    wpDir: checkout,
    sshPassword: '',
    dbPassword: ''
  }
}

function context(): SiteRunContext & { logs: string[] } {
  const logs: string[] = []
  return {
    logs,
    signal: new AbortController().signal,
    log: (line) => logs.push(line),
    status: () => undefined,
    progress: () => undefined,
    throwIfCancelled: () => undefined
  }
}

function session(code = 0): {
  session: SiteSshSession
  exec: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const exec = vi.fn(async () => ({ code, stdout: '', stderr: code === 0 ? '' : 'boom' }))
  const write = vi.fn(async () => undefined)
  const remove = vi.fn(async () => undefined)
  return {
    exec,
    write,
    remove,
    session: {
      exec,
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: write,
      removeRemoteFile: remove,
      close: async () => undefined
    } as unknown as SiteSshSession
  }
}

beforeEach(() => {
  checkout = mkdtempSync(join(tmpdir(), 'muster-steps-'))
  mkdirSync(join(checkout, '.muster/steps'), { recursive: true })
  writeFileSync(
    join(checkout, '.muster/steps/purge.sh'),
    '#!/usr/bin/env bash\necho "$MUSTER_LIVE_DOMAIN"\n'
  )
})

afterEach(() => {
  rmSync(checkout, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('isSafeCustomStepScriptPath', () => {
  it('accepts a repo-relative path', () => {
    expect(isSafeCustomStepScriptPath('.muster/steps/purge.sh')).toBe(true)
  })

  it.each([
    ['absolute', '/etc/passwd'],
    ['parent traversal', '../../../etc/passwd'],
    ['traversal mid-path', 'steps/../../outside.sh'],
    ['home relative', '~/evil.sh'],
    ['windows separator', '..\\..\\evil.sh'],
    ['drive letter', 'C:/evil.sh'],
    ['empty', '   '],
    ['not a string', 42]
  ])('rejects %s', (_label, value) => {
    expect(isSafeCustomStepScriptPath(value)).toBe(false)
  })
})

describe('resolveCustomStepScriptPath', () => {
  it('resolves inside the checkout', () => {
    expect(resolveCustomStepScriptPath('/Sites/acme', 'a/b.sh', 'step')).toBe('/Sites/acme/a/b.sh')
  })

  it('refuses a path that escapes the checkout', () => {
    expect(() => resolveCustomStepScriptPath('/Sites/acme', '../other/b.sh', 'step')).toThrow(
      SiteRunStepError
    )
  })
})

describe('buildCustomStepEnv', () => {
  it('exposes every placeholder as a MUSTER_ variable', () => {
    const env = buildCustomStepEnv(config([]))

    expect(env[customStepEnvName('liveDomain')]).toBe('acme.com')
    expect(env.MUSTER_WP_DIR).toBe(checkout)
    expect(env.MUSTER_ENVIRONMENT).toBe('main')
  })
})

describe('remote script steps', () => {
  it('uploads the script, runs it by path with env, then deletes it', async () => {
    const ssh = session()
    await runCustomSteps(context(), config([step()]), 'deploy', 'after', ssh.session)

    const [remotePath, contents] = ssh.write.mock.calls[0]
    expect(remotePath).toMatch(/^\/tmp\/muster-step-[\w-]+\.sh$/)
    expect(contents).toContain('echo "$MUSTER_LIVE_DOMAIN"')

    // Run by path, so the script body is never parsed by the remote shell.
    const command = ssh.exec.mock.calls[0][0] as string
    expect(command).toContain(`bash '${remotePath}'`)
    expect(command).toContain("MUSTER_LIVE_DOMAIN='acme.com'")
    expect(ssh.remove).toHaveBeenCalledWith(remotePath)
  })

  it('deletes the uploaded script even when the step fails', async () => {
    const ssh = session(3)
    await expect(
      runCustomSteps(context(), config([step()]), 'deploy', 'after', ssh.session)
    ).rejects.toBeInstanceOf(SiteRunStepError)

    expect(ssh.remove).toHaveBeenCalledTimes(1)
  })

  it('fails with a useful message when the script is missing', async () => {
    const ssh = session()
    const missing = step({ scriptPath: '.muster/steps/nope.sh' })

    const error = await runCustomSteps(
      context(),
      config([missing]),
      'deploy',
      'after',
      ssh.session
    ).catch((caught: unknown) => caught)

    expect((error as SiteRunStepError).message).toContain('Script not found in the checkout')
    expect(ssh.write).not.toHaveBeenCalled()
  })
})

describe('local script steps', () => {
  it('runs the resolved file under bash with the MUSTER_ environment', async () => {
    const runCommand = vi.fn(
      async (
        _shell: string,
        _args: readonly string[],
        _options: { env?: Record<string, string> }
      ) => ({ code: 0, stdout: '', stderr: '', timedOut: false })
    )
    await runCustomSteps(context(), config([step({ runsOn: 'local' })]), 'deploy', 'after', null, {
      runCommand: runCommand as never
    })

    const [shell, args, options] = runCommand.mock.calls[0]
    expect(shell).toBe('/bin/bash')
    expect(args[1]).toContain('.muster/steps/purge.sh')
    expect(options.env?.MUSTER_LIVE_DOMAIN).toBe('acme.com')
  })
})
