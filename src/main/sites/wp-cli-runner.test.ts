import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import { SiteRunStepError } from './pipeline-contract'
import { createFakeSshSession } from './site-tool-test-fixtures'
import {
  buildRemoteWpCliCommand,
  checkWpCliSafety,
  runLocalWpCli,
  runRemoteWpCli,
  WP_CLI_MAX_ARGS,
  WP_CLI_MAX_OUTPUT_CHARS
} from './wp-cli-runner'

vi.mock('../lib/stream-command', () => ({ streamCommand: vi.fn() }))

const streamCommandMock = vi.mocked(streamCommand)

function commandResult(overrides: Partial<StreamCommandResult> = {}): StreamCommandResult {
  return {
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false,
    ...overrides
  }
}

beforeEach(() => {
  streamCommandMock.mockReset()
  streamCommandMock.mockResolvedValue(commandResult())
})

describe('checkWpCliSafety read-only allowlist', () => {
  it.each([
    ['plugin list'],
    ['theme status'],
    ['core version'],
    ['option get siteurl'],
    ['db tables'],
    ['config has DB_NAME']
  ])('allows the read-only command `wp %s` with no opt-in', (command) => {
    expect(checkWpCliSafety(command.split(' '), false)).toEqual({
      allowed: true,
      reason: 'Read-only allowlist match.'
    })
  })

  it('matches a two-word subcommand such as `wp cron event list`', () => {
    expect(checkWpCliSafety(['cron', 'event', 'list'], false).allowed).toBe(true)
    // The first word alone is not on the list, so this proves the pair matched and not the word.
    expect(checkWpCliSafety(['cron', 'event', 'delete'], false).allowed).toBe(false)
  })

  it('skips leading flags when locating the subcommand', () => {
    expect(checkWpCliSafety(['plugin', '--allow-root', 'list'], false).allowed).toBe(true)
  })

  it('treats search-replace as read-safe only with --dry-run', () => {
    expect(checkWpCliSafety(['search-replace', 'a.com', 'b.local', '--dry-run'], false)).toEqual({
      allowed: true,
      reason: 'search-replace with --dry-run performs no writes.'
    })
    expect(checkWpCliSafety(['search-replace', 'a.com', 'b.local'], false).allowed).toBe(false)
  })
})

describe('checkWpCliSafety destructive commands', () => {
  it.each([
    [['db', 'drop']],
    [['site', 'empty']],
    [['plugin', 'delete', 'akismet']],
    [['theme', 'delete', 'twentytwenty']],
    [['user', 'delete', '3']],
    [['post', 'delete', '17']]
  ])('refuses %j without the write opt-in and names how to proceed', (args) => {
    const refused = checkWpCliSafety(args, false)
    expect(refused.allowed).toBe(false)
    expect(refused.reason).toContain('not on the read-only allowlist')
    expect(refused.reason).toContain('allowWrites')
  })

  it.each([[['db', 'drop']], [['site', 'empty']], [['plugin', 'delete', 'akismet']]])(
    'permits %j once writes are explicitly allowed',
    (args) => {
      expect(checkWpCliSafety(args, true)).toEqual({
        allowed: true,
        reason: 'Outside the read-only allowlist; writes explicitly allowed.'
      })
    }
  )

  it.each([['eval'], ['eval-file'], ['shell']])(
    'refuses `wp %s` even with writes allowed, because it runs arbitrary code',
    (verb) => {
      // A metacharacter-free payload on purpose: otherwise the argument screen would refuse this
      // first and the hard ban would never be exercised.
      const refused = checkWpCliSafety([verb, 'phpinfo'], true)
      expect(refused.allowed).toBe(false)
      expect(refused.reason).toContain('never allowed')
    }
  )
})

describe('checkWpCliSafety argument rejection', () => {
  it.each([
    ['option get siteurl; rm -rf /'],
    ['option get $(whoami)'],
    ['option get `id`'],
    ['plugin list | tee /tmp/out'],
    ['plugin list && curl evil.test'],
    ['plugin list > /etc/passwd'],
    ['option get ${HOME}']
  ])('refuses shell metacharacters in `%s` even for an allowlisted verb', (command) => {
    const refused = checkWpCliSafety(command.split(' '), false)
    expect(refused.allowed).toBe(false)
    expect(refused.reason).toContain('shell metacharacters')
  })

  it('still refuses metacharacters when writes are allowed', () => {
    expect(checkWpCliSafety(['option', 'update', 'a', 'b; id'], true).allowed).toBe(false)
  })

  it.each([['--path=/etc'], ['--url=http://evil.test'], ['--require=/tmp/x.php']])(
    'refuses the caller-supplied flag %s, which would repoint WP-CLI',
    (flag) => {
      const refused = checkWpCliSafety(['plugin', 'list', flag], false)
      expect(refused.allowed).toBe(false)
      expect(refused.reason).toContain('caller-supplied')
    }
  )

  it('refuses an empty argument list and an over-long one', () => {
    expect(checkWpCliSafety([], false).allowed).toBe(false)
    const tooMany = Array.from({ length: WP_CLI_MAX_ARGS + 1 }, () => 'list')
    expect(checkWpCliSafety(['plugin', ...tooMany], false).reason).toContain('Too many arguments')
  })
})

describe('buildRemoteWpCliCommand quoting', () => {
  it('quotes every argument so a crafted value cannot escape into the remote shell', () => {
    // `'` is the one character the metacharacter screen lets through, so the quoting is the only
    // thing standing between this value and a second command.
    const command = buildRemoteWpCliCommand('public_html', [
      'option',
      'update',
      'blogname',
      "it's '; rm -rf /; echo '"
    ])
    expect(command).toBe(
      String.raw`cd 'public_html' && wp --no-color 'option' 'update' 'blogname' 'it'\''s '\''; rm -rf /; echo '\'''`
    )
    // Everything after the third argument stays inside one quoted token: no unquoted `;` survives.
    const payload = command.slice(command.indexOf("'blogname' ") + "'blogname' ".length)
    expect(payload.startsWith("'")).toBe(true)
    expect(payload.endsWith("'")).toBe(true)
  })

  it('quotes the configured root path too, and normalises a trailing slash', () => {
    expect(buildRemoteWpCliCommand("/srv/it's here/", ['core', 'version'])).toBe(
      String.raw`cd '/srv/it'\''s here' && wp --no-color 'core' 'version'`
    )
  })

  it('falls back to the current directory when no root is configured', () => {
    expect(buildRemoteWpCliCommand('   ', ['core', 'version'])).toBe(
      "cd '.' && wp --no-color 'core' 'version'"
    )
  })
})

describe('runRemoteWpCli', () => {
  it('never reaches the server when the safety list refuses', async () => {
    const fake = createFakeSshSession()
    const result = await runRemoteWpCli(fake.session, {
      rootPath: 'public_html',
      args: ['db', 'drop'],
      allowWrites: false,
      environment: 'production'
    })
    expect(fake.commands).toEqual([])
    expect(result).toMatchObject({
      blocked: true,
      code: -1,
      command: '',
      stdout: '',
      environment: 'production'
    })
  })

  it('executes the quoted command and reports the exit code', async () => {
    const fake = createFakeSshSession(() => ({ code: 3, stdout: 'akismet\n', stderr: 'warn' }))
    const result = await runRemoteWpCli(fake.session, {
      rootPath: 'public_html',
      args: ['plugin', 'list'],
      allowWrites: false,
      environment: 'production'
    })
    expect(fake.commands).toEqual(["cd 'public_html' && wp --no-color 'plugin' 'list'"])
    expect(result).toMatchObject({ blocked: false, code: 3, stdout: 'akismet\n', stderr: 'warn' })
  })

  it('caps oversized output and flags the truncation', async () => {
    const fake = createFakeSshSession(() => ({ stdout: 'x'.repeat(WP_CLI_MAX_OUTPUT_CHARS + 10) }))
    const result = await runRemoteWpCli(fake.session, {
      rootPath: 'public_html',
      args: ['db', 'tables'],
      allowWrites: false,
      environment: 'production'
    })
    expect(result.stdout).toHaveLength(WP_CLI_MAX_OUTPUT_CHARS)
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stderrTruncated).toBe(false)
  })
})

describe('runLocalWpCli', () => {
  it('never spawns a process when the safety list refuses', async () => {
    const result = await runLocalWpCli({
      cwd: '/sites/acme',
      args: ['site', 'empty'],
      allowWrites: false
    })
    expect(streamCommandMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ blocked: true, location: 'local', environment: null })
  })

  it('spawns wp in the WordPress directory with the argument list intact', async () => {
    streamCommandMock.mockResolvedValue(commandResult({ stdout: '6.5.2\n' }))
    const result = await runLocalWpCli({
      cwd: '/sites/acme',
      args: ['core', 'version'],
      allowWrites: false
    })
    const [command, args, options] = streamCommandMock.mock.calls[0]
    expect(command).toBe('wp')
    expect(args).toEqual(['core', 'version'])
    expect(options?.cwd).toBe('/sites/acme')
    expect(result.stdout).toBe('6.5.2\n')
    expect(result.command).toBe("'wp' 'core' 'version'")
  })

  it('resolves the LocalWP php environment only when the site uses a socket', async () => {
    const resolver = vi.fn().mockResolvedValue({ PATH: '/local/bin' })
    await runLocalWpCli(
      { cwd: '/sites/acme', args: ['core', 'version'], allowWrites: false },
      resolver
    )
    expect(resolver).not.toHaveBeenCalled()

    await runLocalWpCli(
      {
        cwd: '/sites/acme',
        args: ['core', 'version'],
        allowWrites: false,
        dbSocket: '/tmp/mysqld.sock'
      },
      resolver
    )
    expect(resolver).toHaveBeenCalledWith('/tmp/mysqld.sock')
    expect(streamCommandMock.mock.calls[1][2]?.env?.PATH).toBe('/local/bin')
  })

  it('reports a missing wp binary as a step error rather than a crash', async () => {
    streamCommandMock.mockRejectedValue(new Error('spawn wp ENOENT'))
    await expect(
      runLocalWpCli({ cwd: '/sites/acme', args: ['core', 'version'], allowWrites: false })
    ).rejects.toThrow(SiteRunStepError)
  })

  it('clamps a caller timeout into the 5-120 second window', async () => {
    await runLocalWpCli({
      cwd: '/sites/acme',
      args: ['core', 'version'],
      allowWrites: false,
      timeoutMs: 999_999
    })
    expect(streamCommandMock.mock.calls[0][2]?.timeoutMs).toBe(120_000)

    await runLocalWpCli({
      cwd: '/sites/acme',
      args: ['core', 'version'],
      allowWrites: false,
      timeoutMs: 10
    })
    expect(streamCommandMock.mock.calls[1][2]?.timeoutMs).toBe(5_000)
  })
})
