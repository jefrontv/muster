import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as FsPromisesModule from 'node:fs/promises'
import { SiteRunStepError } from './pipeline-contract'
import { swapLocalTree } from './local-tree-swap'

const { renameMock } = vi.hoisted(() => ({ renameMock: vi.fn() }))

// A partial mock so `rename` can be made to fail the way a cross-filesystem move does, while every
// other filesystem call stays real — the swap is only worth testing against a real directory tree.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>()
  return { ...actual, rename: renameMock }
})

// vi.importActual is the only way to reach the unmocked rename, and it has no static form.
const actualFsPromises = await vi.importActual<typeof FsPromisesModule>('node:fs/promises')

let workspace: string

function crossDeviceError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('EXDEV: cross-device link not permitted')
  error.code = 'EXDEV'
  return error
}

function seedSource(name = 'incoming'): string {
  const source = path.join(workspace, name)
  mkdirSync(path.join(source, 'nested'), { recursive: true })
  writeFileSync(path.join(source, 'nested', 'new.txt'), 'new')
  return source
}

function seedTarget(name = 'live'): string {
  const target = path.join(workspace, name)
  mkdirSync(target, { recursive: true })
  writeFileSync(path.join(target, 'old.txt'), 'old')
  return target
}

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'muster-swap-'))
  renameMock.mockReset()
  renameMock.mockImplementation(actualFsPromises.rename)
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe('swapLocalTree', () => {
  it('moves the source into place and keeps the previous tree as a backup', async () => {
    const source = seedSource()
    const target = seedTarget()

    const result = await swapLocalTree({ source, target, backup: true })

    expect(result.target).toBe(target)
    expect(readFileSync(path.join(target, 'nested', 'new.txt'), 'utf8')).toBe('new')
    expect(existsSync(source)).toBe(false)
    expect(result.backupPath).toMatch(/live\.muster-backup-\d+$/)
    expect(readFileSync(path.join(result.backupPath ?? '', 'old.txt'), 'utf8')).toBe('old')
  })

  it('deletes the previous tree when no backup is requested', async () => {
    const source = seedSource()
    const target = seedTarget()

    const result = await swapLocalTree({ source, target, backup: false })

    expect(result.backupPath).toBeNull()
    expect(readdirSync(workspace)).toEqual(['live'])
    expect(existsSync(path.join(target, 'old.txt'))).toBe(false)
  })

  it('replaces a symlink at the target without following it', async () => {
    const source = seedSource()
    const elsewhere = path.join(workspace, 'elsewhere')
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(path.join(elsewhere, 'keep.txt'), 'keep')
    const target = path.join(workspace, 'live')
    symlinkSync(elsewhere, target)

    await swapLocalTree({ source, target, backup: false })

    expect(readFileSync(path.join(target, 'nested', 'new.txt'), 'utf8')).toBe('new')
    // Following the symlink would have wiped the directory it pointed at.
    expect(readFileSync(path.join(elsewhere, 'keep.txt'), 'utf8')).toBe('keep')
  })

  it('replaces a broken symlink, which an exists() probe would have missed', async () => {
    const source = seedSource()
    const target = path.join(workspace, 'live')
    symlinkSync(path.join(workspace, 'gone'), target)

    await swapLocalTree({ source, target, backup: false })
    expect(readFileSync(path.join(target, 'nested', 'new.txt'), 'utf8')).toBe('new')
  })

  it('creates missing parent directories for a nested target', async () => {
    const source = seedSource()
    const target = path.join(workspace, 'wp-content', 'uploads', '2026', '05')

    await swapLocalTree({ source, target, backup: false })
    expect(readFileSync(path.join(target, 'nested', 'new.txt'), 'utf8')).toBe('new')
  })

  it('copies then deletes when the move crosses a filesystem boundary', async () => {
    const source = seedSource()
    const target = path.join(workspace, 'live')
    // fs.rename raises EXDEV where Python's shutil.move degrades to copy+delete. A site checkout on
    // an external volume with the download cache in userData is the normal case, not an edge case.
    renameMock.mockImplementationOnce(() => Promise.reject(crossDeviceError()))

    const result = await swapLocalTree({ source, target, backup: false })

    expect(result.target).toBe(target)
    expect(readFileSync(path.join(target, 'nested', 'new.txt'), 'utf8')).toBe('new')
    expect(existsSync(source)).toBe(false)
  })

  it('restores the backup when the move fails, so a failed sync is not a data loss', async () => {
    const target = seedTarget()
    const missingSource = path.join(workspace, 'never-fetched')

    await expect(swapLocalTree({ source: missingSource, target, backup: true })).rejects.toThrow(
      SiteRunStepError
    )

    // The original tree is back where it was, and no stray backup directory is left behind.
    expect(readFileSync(path.join(target, 'old.txt'), 'utf8')).toBe('old')
    expect(readdirSync(workspace)).toEqual(['live'])
  })

  it('reports the target in the failure message', async () => {
    const target = seedTarget()
    await expect(
      swapLocalTree({ source: path.join(workspace, 'never-fetched'), target, backup: false })
    ).rejects.toThrow(new RegExp(`Could not replace ${target.replaceAll('/', '\\/')}`))
  })

  it('picks a free backup name when one is already taken', async () => {
    const source = seedSource()
    const target = seedTarget()
    // Occupy the un-suffixed name a second-within-the-same-second retry would want.
    const taken = `${target}.muster-backup-${Math.floor(Date.now() / 1000)}`
    mkdirSync(taken, { recursive: true })

    const result = await swapLocalTree({ source, target, backup: true })
    expect(result.backupPath).not.toBe(taken)
    expect(result.backupPath).toMatch(/-1$/)
    expect(existsSync(taken)).toBe(true)
  })

  it('succeeds when there was nothing at the target to replace', async () => {
    const source = seedSource()
    const result = await swapLocalTree({
      source,
      target: path.join(workspace, 'fresh'),
      backup: true
    })
    expect(result.backupPath).toBeNull()
    expect(readFileSync(path.join(workspace, 'fresh', 'nested', 'new.txt'), 'utf8')).toBe('new')
  })
})
