import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  isSafeFreshProfileDir,
  parseFreshDevArgs,
  resetFreshProfileDir,
  resolveFreshProfileDir
} from './run-dev-fresh.mjs'

const leftover = []

afterEach(() => {
  for (const dir of leftover.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseFreshDevArgs', () => {
  it('forwards electron-vite args and peels the wrapper flags', () => {
    expect(parseFreshDevArgs(['--keep', '--remote-debugging-port=9418', '-h'])).toEqual({
      keep: true,
      help: true,
      forwarded: ['--remote-debugging-port=9418']
    })
  })
})

describe('isSafeFreshProfileDir', () => {
  it('allows temp and *fresh-profile* paths only', () => {
    expect(isSafeFreshProfileDir(path.join(tmpdir(), 'orca-fresh-profile-abc'))).toBe(true)
    expect(isSafeFreshProfileDir('/tmp/muster-fresh-profile-mine')).toBe(true)
    expect(isSafeFreshProfileDir(path.join(tmpdir(), 'unrelated'))).toBe(true)
    expect(isSafeFreshProfileDir('/Users/jake/Library/Application Support/muster-dev')).toBe(false)
  })
})

describe('resolveFreshProfileDir', () => {
  it('refuses a userData path that is not a fresh-profile dir', () => {
    expect(() =>
      resolveFreshProfileDir({
        ORCA_FRESH_PROFILE_DIR: '/Users/jake/Library/Application Support/muster-dev'
      })
    ).toThrow(/Refusing ORCA_FRESH_PROFILE_DIR/)
  })

  it('creates an ephemeral temp profile when no dir is requested', () => {
    const resolved = resolveFreshProfileDir({})
    leftover.push(resolved.dir)
    expect(resolved.ephemeral).toBe(true)
    expect(resolved.dir.includes('orca-fresh-profile-')).toBe(true)
    expect(existsSync(resolved.dir)).toBe(true)
  })
})

describe('resetFreshProfileDir', () => {
  it('wipes leftover files so the next launch is empty', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'orca-fresh-profile-reset-'))
    leftover.push(dir)
    writeFileSync(path.join(dir, 'orca-data.json'), '{}')
    resetFreshProfileDir(dir)
    expect(existsSync(path.join(dir, 'orca-data.json'))).toBe(false)
    expect(existsSync(dir)).toBe(true)
  })
})
