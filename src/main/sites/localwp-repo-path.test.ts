import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FOLDER_WORKSPACE_INSTANCE_SEPARATOR } from '../../shared/worktree-id'
import {
  migrateLocalWpRepoPathIfNeeded,
  rekeyWorktreeMetaForRepoPathChange,
  resetLocalWpRepoPathMigrationCacheForTests,
  resolveLocalProjectImportPath,
  rewriteWorkspaceSessionWorktreePath
} from './localwp-repo-path'
import { getDefaultWorkspaceSession } from '../../shared/constants'

const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'localwp-repo-path-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  resetLocalWpRepoPathMigrationCacheForTests()
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('resolveLocalProjectImportPath', () => {
  it('remaps a LocalWP site shell to app/public as folder even when nested git exists', async () => {
    const site = await makeTempRoot()
    const appPublic = join(site, 'app', 'public')
    await mkdir(appPublic, { recursive: true })
    await writeFile(join(appPublic, 'wp-config.php'), '<?php\n')
    execFileSync('git', ['init'], { cwd: appPublic, stdio: 'ignore' })

    expect(resolveLocalProjectImportPath(site, 'folder')).toEqual({
      path: appPublic,
      kind: 'folder',
      displayNameSourcePath: site,
      remappedToWordPressRoot: true
    })
    expect(resolveLocalProjectImportPath(site, 'git')).toEqual({
      path: appPublic,
      kind: 'folder',
      displayNameSourcePath: site,
      remappedToWordPressRoot: true
    })
  })

  it('keeps LocalWP app/public imports as folder (no Create worktree)', async () => {
    const site = await makeTempRoot()
    const appPublic = join(site, 'app', 'public')
    await mkdir(appPublic, { recursive: true })
    await writeFile(join(appPublic, 'wp-config.php'), '<?php\n')
    execFileSync('git', ['init'], { cwd: appPublic, stdio: 'ignore' })

    const resolved = resolveLocalProjectImportPath(appPublic, 'git')
    expect(resolved).toEqual({
      path: appPublic,
      kind: 'folder',
      displayNameSourcePath: site,
      remappedToWordPressRoot: true
    })
  })

  it('leaves ordinary paths alone', async () => {
    const root = await makeTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    const nested = join(root, 'packages', 'web')
    await mkdir(nested, { recursive: true })
    const canonicalRoot = realpathSync(root)

    expect(resolveLocalProjectImportPath(nested, 'git')).toEqual({
      path: canonicalRoot,
      kind: 'git',
      displayNameSourcePath: nested,
      remappedToWordPressRoot: false
    })
  })
})

describe('migrateLocalWpRepoPathIfNeeded', () => {
  it('moves a folder LocalWP shell to app/public and keeps folder mode', async () => {
    const site = await makeTempRoot()
    const appPublic = join(site, 'app', 'public')
    await mkdir(appPublic, { recursive: true })
    await writeFile(join(appPublic, 'wp-config.php'), '<?php\n')
    execFileSync('git', ['init'], { cwd: appPublic, stdio: 'ignore' })

    const repoId = 'repo-localwp'
    const rootId = `${repoId}::${site}`
    const instanceId = `${rootId}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}aaaa-bbbb`
    const meta: Record<string, { displayName: string; instanceId: string }> = {
      [rootId]: { displayName: 'orleton', instanceId: 'root-instance' },
      [instanceId]: { displayName: 'session-2', instanceId: 'ghost-instance' }
    }
    const store = {
      getAllWorktreeMeta: () => meta,
      setWorktreeMeta: vi.fn((id: string, value: (typeof meta)[string]) => {
        meta[id] = { ...meta[id], ...value }
        return meta[id]
      }),
      removeWorktreeMeta: vi.fn((id: string) => {
        delete meta[id]
      }),
      updateRepo: vi.fn((id: string, updates: Record<string, unknown>) => ({
        id,
        path: site,
        displayName: 'orleton',
        badgeColor: '#000',
        addedAt: 0,
        kind: 'folder' as const,
        ...updates
      }))
    }

    const migrated = migrateLocalWpRepoPathIfNeeded(store as never, {
      id: repoId,
      path: site,
      displayName: 'orleton',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'folder'
    })

    expect(migrated).toMatchObject({ path: appPublic, kind: 'folder' })
    expect(store.updateRepo).toHaveBeenCalledWith(
      repoId,
      expect.objectContaining({ path: appPublic, kind: 'folder' })
    )
    expect(meta[rootId]).toBeUndefined()
    // Folder workspace instances are rekeyed onto app/public, not dropped.
    expect(meta[`${repoId}::${appPublic}`]).toMatchObject({ displayName: 'orleton' })
    expect(
      meta[`${repoId}::${appPublic}${FOLDER_WORKSPACE_INSTANCE_SEPARATOR}aaaa-bbbb`]
    ).toMatchObject({
      displayName: 'session-2'
    })
  })

  it('skips disk rewrite on a second call for the same repo id', async () => {
    const site = await makeTempRoot()
    const appPublic = join(site, 'app', 'public')
    await mkdir(appPublic, { recursive: true })
    await writeFile(join(appPublic, 'wp-config.php'), '<?php\n')

    const updateRepo = vi.fn((id: string, updates: Record<string, unknown>) => ({
      id,
      path: site,
      displayName: 'orleton',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'folder' as const,
      ...updates
    }))
    const store = {
      getAllWorktreeMeta: () => ({}),
      setWorktreeMeta: vi.fn(),
      removeWorktreeMeta: vi.fn(),
      updateRepo
    }
    const shellRepo = {
      id: 'repo-once',
      path: site,
      displayName: 'orleton',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'folder' as const
    }

    migrateLocalWpRepoPathIfNeeded(store as never, shellRepo)
    expect(updateRepo).toHaveBeenCalledTimes(1)

    // Stale shell snapshot would re-hit disk without the process cache.
    migrateLocalWpRepoPathIfNeeded(store as never, shellRepo)
    expect(updateRepo).toHaveBeenCalledTimes(1)
  })

  it('does not call updateRepo for folder projects already at app/public', async () => {
    const site = await makeTempRoot()
    const appPublic = join(site, 'app', 'public')
    await mkdir(appPublic, { recursive: true })
    await writeFile(join(appPublic, 'wp-config.php'), '<?php\n')

    const updateRepo = vi.fn()
    const store = {
      getAllWorktreeMeta: () => ({}),
      setWorktreeMeta: vi.fn(),
      removeWorktreeMeta: vi.fn(),
      updateRepo
    }

    const migrated = migrateLocalWpRepoPathIfNeeded(store as never, {
      id: 'repo-already',
      path: appPublic,
      displayName: 'orleton',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'folder'
    })

    expect(migrated.path).toBe(appPublic)
    expect(updateRepo).not.toHaveBeenCalled()
  })

  // Why: the "already evaluated" cache used to be permanent for the process. A LocalWP setup
  // relocates the checkout into app/public and the import then writes wp-config.php, so the cached
  // "not a LocalWP shell" answer went stale and the repo kept pointing at a folder with no .git —
  // which is why creating a worktree failed with "no base branch found".
  it('re-evaluates a repo it already checked once wp-config.php appears', async () => {
    const site = await makeTempRoot()
    const appPublic = join(site, 'app', 'public')
    await mkdir(appPublic, { recursive: true })
    execFileSync('git', ['init'], { cwd: appPublic, stdio: 'ignore' })

    const updateRepo = vi.fn((id: string, updates: Record<string, unknown>) => ({
      id,
      path: site,
      displayName: 'orleton',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'git' as const,
      ...updates
    }))
    const store = {
      getAllWorktreeMeta: () => ({}),
      setWorktreeMeta: vi.fn(),
      removeWorktreeMeta: vi.fn(),
      updateRepo
    }
    const repo = {
      id: 'repo-late-wp',
      path: site,
      displayName: 'orleton',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'git' as const
    }

    // First pass: app/public exists but there is no WordPress there yet, so nothing to remap.
    expect(migrateLocalWpRepoPathIfNeeded(store as never, repo).path).toBe(site)
    expect(updateRepo).not.toHaveBeenCalled()

    await writeFile(join(appPublic, 'wp-config.php'), '<?php\n')

    const migrated = migrateLocalWpRepoPathIfNeeded(store as never, repo)
    expect(migrated).toMatchObject({ path: appPublic, kind: 'folder' })
    expect(updateRepo).toHaveBeenCalledWith(
      'repo-late-wp',
      expect.objectContaining({ path: appPublic, kind: 'folder' })
    )
  })
})

describe('rekeyWorktreeMetaForRepoPathChange', () => {
  it('rewrites the root id when the project path changes', () => {
    const meta: Record<string, { displayName: string }> = {
      'repo-1::/old': { displayName: 'old' }
    }
    const store = {
      getAllWorktreeMeta: () => meta,
      setWorktreeMeta: vi.fn((id: string, value: { displayName: string }) => {
        meta[id] = value
        return value
      }),
      removeWorktreeMeta: vi.fn((id: string) => {
        delete meta[id]
      })
    }
    rekeyWorktreeMetaForRepoPathChange(store as never, 'repo-1', '/old', '/old/app/public')
    expect(meta).toEqual({ 'repo-1::/old/app/public': { displayName: 'old' } })
  })
})

describe('rewriteWorkspaceSessionWorktreePath', () => {
  it('rewrites worktree-keyed session maps so hydration purge will not drop them', () => {
    const previous = 'repo-1::/Sites/orleton'
    const next = 'repo-1::/Sites/orleton/app/public'
    const session = {
      ...getDefaultWorkspaceSession(),
      activeWorktreeId: previous,
      activeWorkspaceKey: `worktree:${previous}`,
      activeWorktreeIdsOnShutdown: [previous, 'other::/x'],
      tabsByWorktree: {
        [previous]: [{ id: 'tab-1', worktreeId: previous, title: 't', cwd: '/Sites/orleton' }]
      },
      lastVisitedAtByWorktreeId: { [previous]: 42, 'other::/x': 1 }
    }

    const rewritten = rewriteWorkspaceSessionWorktreePath(session as never, previous, next)

    expect(rewritten.activeWorktreeId).toBe(next)
    expect(rewritten.activeWorkspaceKey).toBe(`worktree:${next}`)
    expect(rewritten.activeWorktreeIdsOnShutdown).toEqual([next, 'other::/x'])
    expect(rewritten.tabsByWorktree[next]).toHaveLength(1)
    expect(rewritten.tabsByWorktree[previous]).toBeUndefined()
    expect(rewritten.lastVisitedAtByWorktreeId).toEqual({ [next]: 42, 'other::/x': 1 })
  })
})
