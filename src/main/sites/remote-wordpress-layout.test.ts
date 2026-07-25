import { describe, expect, it } from 'vitest'

import { resolveRemoteLayout } from './remote-wordpress-layout'
import { SiteRunStepError, type SiteExecResult, type SiteSshSession } from './pipeline-contract'

type Respond = (command: string) => Partial<SiteExecResult>

function createFakeSession(respond: Respond): { session: SiteSshSession; commands: string[] } {
  const commands: string[] = []
  const session: SiteSshSession = {
    exec: async (command) => {
      commands.push(command)
      return { code: 0, stdout: '', stderr: '', ...respond(command) }
    },
    download: async () => {},
    upload: async () => {},
    writeSecureRemoteFile: async () => {},
    removeRemoteFile: async () => {},
    close: async () => {}
  }
  return { session, commands }
}

/** Mirrors the remote shell: the layout probe echoes `verdict`, the wp-config probe yes/no. */
function respondWith(verdict: string, hasWpConfig = true): Respond {
  return (command) => ({
    stdout: command.includes('wp-config.php') ? (hasWpConfig ? 'yes' : 'no') : verdict
  })
}

/** Narrows a rejection so the step and message can be asserted without an unchecked cast. */
function expectStepError(error: unknown): SiteRunStepError {
  if (!(error instanceof SiteRunStepError)) {
    throw new Error(`Expected a SiteRunStepError, received: ${String(error)}`)
  }
  expect(error.step).toBe('remote-layout')
  return error
}

describe('resolveRemoteLayout', () => {
  it('reports a standard WordPress install as wp-content at the configured root', async () => {
    const { session } = createFakeSession(respondWith('standard'))

    await expect(resolveRemoteLayout(session, 'public_html')).resolves.toEqual({
      webroot: 'public_html',
      contentDir: 'wp-content'
    })
  })

  it('reports Bedrock served from the configured root as app', async () => {
    const { session } = createFakeSession(respondWith('bedrock-root'))

    await expect(resolveRemoteLayout(session, '/srv/acme')).resolves.toEqual({
      webroot: '/srv/acme',
      contentDir: 'app'
    })
  })

  it('moves the webroot down into web/ for a Bedrock project root', async () => {
    const { session } = createFakeSession(respondWith('bedrock-web'))

    await expect(resolveRemoteLayout(session, '/srv/acme')).resolves.toEqual({
      webroot: '/srv/acme/web',
      contentDir: 'app'
    })
  })

  it('checks wp-config.php at the resolved Bedrock webroot, not the configured root', async () => {
    const { session, commands } = createFakeSession(respondWith('bedrock-web'))

    await resolveRemoteLayout(session, '/srv/acme')

    expect(commands[1]).toContain(`'/srv/acme/web/wp-config.php'`)
  })

  it('fails with a step error when wp-config.php is missing', async () => {
    const { session } = createFakeSession(respondWith('standard', false))

    const error = await resolveRemoteLayout(session, 'public_html').catch((err: unknown) => err)

    expect(expectStepError(error).message).toBe(
      'wp-config.php not found in public_html. Not a WordPress installation.'
    )
  })

  it('fails when the probe itself cannot run instead of assuming a standard layout', async () => {
    const { session } = createFakeSession(() => ({ code: 127, stderr: 'sh: test: not found' }))

    const error = await resolveRemoteLayout(session, 'public_html').catch((err: unknown) => err)

    expect(expectStepError(error).message).toContain('sh: test: not found')
  })

  it('reads the verdict past a chatty remote shell banner', async () => {
    const { session } = createFakeSession((command) => ({
      stdout: command.includes('wp-config.php')
        ? 'Welcome to acme-web-01\nyes\n'
        : 'Welcome to acme-web-01\nbedrock-root\n'
    }))

    await expect(resolveRemoteLayout(session, '/srv/acme')).resolves.toEqual({
      webroot: '/srv/acme',
      contentDir: 'app'
    })
  })

  it('quotes every interpolated path and never emits a doubled separator', async () => {
    const { session, commands } = createFakeSession(respondWith('standard'))

    await resolveRemoteLayout(session, "/srv/o'brien/public_html/")

    expect(commands[0]).toContain(`'/srv/o'\\''brien/public_html/wp/wp-load.php'`)
    expect(commands.join('\n')).not.toContain('//')
  })

  it('rejects an empty root path rather than probing the SSH user home', async () => {
    const { session, commands } = createFakeSession(respondWith('standard'))

    await expect(resolveRemoteLayout(session, '   ')).rejects.toThrow(
      'No remote root path is configured'
    )
    expect(commands).toEqual([])
  })
})
