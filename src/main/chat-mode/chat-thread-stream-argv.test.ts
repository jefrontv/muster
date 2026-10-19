import { describe, expect, it } from 'vitest'
import {
  chatCommandArgv,
  resolveChatExecutable,
  windowsShimCommandLine
} from './chat-thread-stream-argv'

describe('chatCommandArgv', () => {
  it('splits a POSIX-quoted command', () => {
    expect(chatCommandArgv(`claude --model 'opus' --add-dir '/a b/it'\\''s' -p`)).toEqual([
      'claude',
      '--model',
      'opus',
      '--add-dir',
      "/a b/it's",
      '-p'
    ])
  })

  it('keeps shell syntax inside single quotes literal', () => {
    expect(chatCommandArgv(`claude --append-system-prompt 'a && $b; c'`)).toEqual([
      'claude',
      '--append-system-prompt',
      'a && $b; c'
    ])
  })

  it.each([
    'cd /x && claude -p',
    'claude -p; echo done',
    'claude -p | tee log',
    '$HOME/bin/claude -p',
    '~/bin/claude -p',
    'claude "--model=$MODEL"',
    'ANTHROPIC_LOG=debug claude -p',
    'claude -p > out.txt',
    ''
  ])('leaves %j to a shell', (command) => {
    expect(chatCommandArgv(command)).toBeNull()
  })
})

describe('resolveChatExecutable', () => {
  const files = (paths: string[]) => (path: string) => paths.includes(path)

  it('finds the first match on PATH', () => {
    expect(
      resolveChatExecutable(
        'claude',
        { PATH: '/usr/bin:/home/u/.local/bin:/opt/bin' },
        { platform: 'darwin', isFile: files(['/home/u/.local/bin/claude', '/opt/bin/claude']) }
      )
    ).toBe('/home/u/.local/bin/claude')
  })

  it('resolves a relative override against the chat folder', () => {
    expect(
      resolveChatExecutable(
        'node_modules/.bin/claude',
        { PATH: '/usr/bin' },
        { platform: 'linux', cwd: '/site', isFile: files(['/site/node_modules/.bin/claude']) }
      )
    ).toBe('/site/node_modules/.bin/claude')
  })

  it('returns null when nothing matches', () => {
    expect(
      resolveChatExecutable(
        'claude',
        { PATH: '/usr/bin' },
        { platform: 'linux', isFile: files([]) }
      )
    ).toBeNull()
  })

  it('on Windows, tries PATHEXT and skips the extensionless npm shim', () => {
    const env = { Path: 'C:\\npm;C:\\Users\\u\\.local\\bin', PATHEXT: '.EXE;.CMD' }
    expect(
      resolveChatExecutable('claude', env, {
        platform: 'win32',
        isFile: files([
          'C:\\npm\\claude',
          'C:\\npm\\claude.CMD',
          'C:\\Users\\u\\.local\\bin\\claude.EXE'
        ])
      })
    ).toBe('C:\\npm\\claude.CMD')
  })

  it('on Windows, takes a name that already has an extension as is', () => {
    expect(
      resolveChatExecutable(
        'claude.exe',
        { Path: 'C:\\bin' },
        { platform: 'win32', isFile: files(['C:\\bin\\claude.exe']) }
      )
    ).toBe('C:\\bin\\claude.exe')
  })
})

describe('windowsShimCommandLine', () => {
  it('quotes every arg and doubles embedded quotes for cmd /s /c', () => {
    expect(windowsShimCommandLine('C:\\npm\\claude.cmd', ['-p', 'C:\\Program Files\\a "b"'])).toBe(
      '""C:\\npm\\claude.cmd" "-p" "C:\\Program Files\\a ""b""""'
    )
  })
})
