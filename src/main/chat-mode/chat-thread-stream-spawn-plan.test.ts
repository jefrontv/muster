import { describe, expect, it } from 'vitest'
import { buildChatThreadStreamSpawnPlan } from './chat-thread-stream-spawn-plan'

const captured = () => ({ PATH: '/home/u/.local/bin:/usr/bin' })

describe('buildChatThreadStreamSpawnPlan', () => {
  it('spawns the resolved binary directly once the profile env is captured', () => {
    const plan = buildChatThreadStreamSpawnPlan({
      command: "claude -p --add-dir '/a b'",
      extraArgs: ['--mcp-config', '/data/it is.json'],
      cwd: '/site',
      platform: 'darwin',
      loginShellEnv: captured,
      resolveExecutable: (name, env) =>
        name === 'claude' && env.PATH?.startsWith('/home/u/.local/bin')
          ? '/home/u/.local/bin/claude'
          : null
    })
    expect(plan).toMatchObject({
      ok: true,
      file: '/home/u/.local/bin/claude',
      args: ['-p', '--add-dir', '/a b', '--mcp-config', '/data/it is.json'],
      options: { cwd: '/site' }
    })
  })

  it('keeps the login shell while the profile env is not captured', () => {
    const plan = buildChatThreadStreamSpawnPlan({
      command: 'claude -p',
      extraArgs: ["/it's.json"],
      platform: 'linux',
      loginShellEnv: () => null,
      resolveExecutable: () => '/usr/bin/claude'
    })
    expect(plan).toMatchObject({ ok: true, args: ['-lc', `claude -p '/it'\\''s.json'`] })
  })

  it('runs a command with shell syntax through the shell on POSIX', () => {
    const plan = buildChatThreadStreamSpawnPlan({
      command: 'cd /x && claude -p',
      platform: 'linux',
      loginShellEnv: captured,
      resolveExecutable: () => '/usr/bin/claude'
    })
    expect(plan).toMatchObject({ ok: true, args: ['-c', 'cd /x && claude -p'] })
  })

  it('wraps a Windows .cmd shim in cmd.exe with verbatim args', () => {
    const plan = buildChatThreadStreamSpawnPlan({
      command: 'claude -p',
      env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
      platform: 'win32',
      loginShellEnv: () => null,
      resolveExecutable: () => 'C:\\npm\\claude.cmd'
    })
    expect(plan).toMatchObject({
      ok: true,
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', '""C:\\npm\\claude.cmd" "-p""'],
      options: { windowsVerbatimArguments: true }
    })
  })

  it('spawns a Windows .exe directly', () => {
    const plan = buildChatThreadStreamSpawnPlan({
      command: 'claude -p',
      platform: 'win32',
      loginShellEnv: () => null,
      resolveExecutable: () => 'C:\\Users\\u\\.local\\bin\\claude.exe'
    })
    expect(plan).toMatchObject({
      ok: true,
      file: 'C:\\Users\\u\\.local\\bin\\claude.exe',
      args: ['-p']
    })
  })

  it('explains why Windows cannot start the chat', () => {
    const missing = buildChatThreadStreamSpawnPlan({
      command: 'claude -p',
      platform: 'win32',
      resolveExecutable: () => null
    })
    expect(missing).toMatchObject({
      ok: false,
      error: expect.stringContaining('not found on PATH')
    })
    const shell = buildChatThreadStreamSpawnPlan({
      command: 'claude -p && pause',
      platform: 'win32',
      resolveExecutable: () => 'C:\\claude.exe'
    })
    expect(shell).toMatchObject({ ok: false, error: expect.stringContaining('shell syntax') })
  })
})
