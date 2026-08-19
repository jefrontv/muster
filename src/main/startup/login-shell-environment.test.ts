import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetLoginShellEnvironmentForTests,
  diffShellEnvironments,
  loginShellEnvironmentDelta,
  parseEnvZero
} from './login-shell-environment'

beforeEach(() => _resetLoginShellEnvironmentForTests())

describe('parseEnvZero', () => {
  it('reads NUL-separated pairs', () => {
    expect(parseEnvZero('PATH=/usr/bin\0HOME=/Users/x\0')).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/x'
    })
  })

  it('keeps values containing newlines and equals signs intact', () => {
    // The reason for env -0 over line-based parsing.
    expect(parseEnvZero('SCRIPT=line1\nline2\0FLAGS=a=b=c\0')).toEqual({
      SCRIPT: 'line1\nline2',
      FLAGS: 'a=b=c'
    })
  })

  it('is null when nothing parsed, so a failed capture is not mistaken for empty', () => {
    expect(parseEnvZero('')).toBeNull()
    expect(parseEnvZero('garbage banner output')).toBeNull()
  })

  it('ignores a leading = with no name', () => {
    expect(parseEnvZero('=broken\0OK=1\0')).toEqual({ OK: '1' })
  })
})

describe('diffShellEnvironments', () => {
  it('keeps only what the login shell added or changed', () => {
    expect(
      diffShellEnvironments(
        { PATH: '/nvm:/usr/bin', HOME: '/Users/x', FPATH: '/fns' },
        { PATH: '/usr/bin', HOME: '/Users/x' }
      )
    ).toEqual({ PATH: '/nvm:/usr/bin', FPATH: '/fns' })
  })

  it('drops volatile bookkeeping that differs for unrelated reasons', () => {
    // Copying PWD forward would pin a stale working directory onto every child.
    expect(
      diffShellEnvironments(
        { PWD: '/a', SHLVL: '2', OLDPWD: '/b', _: '/bin/env', PATH: '/nvm' },
        { PWD: '/c', SHLVL: '1', PATH: '/usr/bin' }
      )
    ).toEqual({ PATH: '/nvm' })
  })

  it('is empty when the profile contributes nothing', () => {
    expect(diffShellEnvironments({ PATH: '/usr/bin' }, { PATH: '/usr/bin' })).toEqual({})
  })
})

describe('loginShellEnvironmentDelta', () => {
  it('is null before any capture, so callers keep using a real login shell', () => {
    expect(loginShellEnvironmentDelta()).toBeNull()
  })
})
