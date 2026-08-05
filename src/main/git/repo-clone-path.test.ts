import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clonePathExists,
  deriveValidatedClonePath,
  getClonePathComparisonKey
} from './repo-clone-path'

describe('repo clone path helpers', () => {
  it('allows safe repository names that start with two dots', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'orca-clone-path-'))
    try {
      expect(
        deriveValidatedClonePath({
          url: 'https://example.com/..repo.git',
          destination
        })
      ).toBe(join(destination, '..repo'))
    } finally {
      await rm(destination, { recursive: true, force: true })
    }
  })

  it('rejects Windows-looking destinations on non-Windows hosts', async () => {
    if (process.platform === 'win32') {
      return
    }
    expect(() =>
      deriveValidatedClonePath({
        url: 'https://example.com/orca.git',
        destination: 'C:\\Users\\me\\src'
      })
    ).toThrow('Clone destination must be an absolute path')
    expect(() =>
      deriveValidatedClonePath({
        url: 'https://example.com/orca.git',
        destination: '\\\\server\\share'
      })
    ).toThrow('Clone destination must be an absolute path')
    expect(() =>
      deriveValidatedClonePath({
        url: 'https://example.com/orca.git',
        destination: '//server/share'
      })
    ).toThrow('Clone destination must be an absolute path')
    expect(() =>
      deriveValidatedClonePath({
        url: 'https://example.com/orca.git',
        destination: '//wsl.localhost/Ubuntu/home/me'
      })
    ).toThrow('Clone destination must be an absolute path')
  })

  it('canonicalizes WSL UNC server aliases without folding Linux path casing', () => {
    expect(getClonePathComparisonKey('\\\\wsl.localhost\\Ubuntu\\home\\User\\repo')).toBe(
      getClonePathComparisonKey('\\\\wsl$\\ubuntu\\home\\User\\repo')
    )
    expect(getClonePathComparisonKey('\\\\wsl.localhost\\Ubuntu\\home\\User\\repo\\')).toBe(
      getClonePathComparisonKey('\\\\wsl$\\ubuntu\\home\\User\\repo')
    )
    expect(getClonePathComparisonKey('\\\\wsl.localhost\\Ubuntu\\home\\User\\repo')).not.toBe(
      getClonePathComparisonKey('\\\\wsl$\\ubuntu\\home\\user\\repo')
    )
  })

  // Why: clone de-duplication reads this to decide whether a surviving Repo record still has a
  // checkout. A false positive makes `repos:clone` report success while creating nothing, and the
  // caller then binds a path that is not there.
  describe('clonePathExists', () => {
    it('reports a directory that is present', async () => {
      const destination = await mkdtemp(join(tmpdir(), 'orca-clone-exists-'))
      try {
        expect(await clonePathExists(destination)).toBe(true)
      } finally {
        await rm(destination, { recursive: true, force: true })
      }
    })

    it('reports a folder deleted outside Muster as gone', async () => {
      const destination = await mkdtemp(join(tmpdir(), 'orca-clone-gone-'))
      await rm(destination, { recursive: true, force: true })
      expect(await clonePathExists(destination)).toBe(false)
    })

    it('does not throw for a path whose parent does not exist either', async () => {
      expect(await clonePathExists(join(tmpdir(), 'orca-absent-parent', 'nested', 'repo'))).toBe(
        false
      )
    })
  })
})
