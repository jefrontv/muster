import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  emptyAppPublic,
  listRootEntriesToMove,
  moveRootEntriesIntoAppPublic,
  restoreGitAppPublic,
  rewriteLocalDbHost,
  type LocalWpFileOperations
} from './localwp-app-public'
import { fakeFileOperations } from './localwp-app-public.test-fixtures'
import { createLocalWpHost, type LocalWpCommandResult } from './localwp-host'

const SITE_PATH = '/Sites/acme'
const APP_PUBLIC = path.join(SITE_PATH, 'app', 'public')

describe('emptyAppPublic', () => {
  it('clears the contents but keeps the directory', async () => {
    const { operations, entries } = fakeFileOperations({
      [APP_PUBLIC]: null,
      [path.join(APP_PUBLIC, 'index.php')]: '<?php',
      [path.join(APP_PUBLIC, 'wp-admin', 'admin.php')]: '<?php'
    })
    const outcome = await emptyAppPublic(SITE_PATH, operations)
    expect(outcome.ok).toBe(true)
    expect(await operations.listDirectory(APP_PUBLIC)).toEqual([])
    expect(entries.has(APP_PUBLIC)).toBe(true)
  })

  it('fails when app/public does not exist', async () => {
    const { operations } = fakeFileOperations({})
    const outcome = await emptyAppPublic(SITE_PATH, operations)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('app/public not found')
  })
})

describe('restoreGitAppPublic', () => {
  it('reports a restore when git succeeds', async () => {
    const host = createLocalWpHost({
      run: async (): Promise<LocalWpCommandResult> => ({ code: 0, stdout: '', stderr: '' })
    })
    expect(await restoreGitAppPublic(SITE_PATH, host)).toEqual({
      ok: true,
      message: 'Restored app/public from git'
    })
  })

  it('treats a nonzero git exit as a non-event, not a failure', async () => {
    const host = createLocalWpHost({
      run: async (): Promise<LocalWpCommandResult> => ({
        code: 1,
        stdout: '',
        stderr: 'no such path'
      })
    })
    expect(await restoreGitAppPublic(SITE_PATH, host)).toEqual({ ok: true, message: '' })
  })

  it('runs git in the project directory', async () => {
    const calls: { args: string[]; cwd?: string }[] = []
    const host = createLocalWpHost({
      run: async (_file, args, options): Promise<LocalWpCommandResult> => {
        calls.push({ args, cwd: options?.cwd })
        return { code: 0, stdout: '', stderr: '' }
      }
    })
    await restoreGitAppPublic(SITE_PATH, host)
    expect(calls).toEqual([{ args: ['restore', 'app/public'], cwd: SITE_PATH }])
  })
})

describe('moveRootEntriesIntoAppPublic', () => {
  it('moves every root entry except app, in a stable order', async () => {
    const { operations, entries } = fakeFileOperations({
      [path.join(SITE_PATH, 'wp-config.php')]: '<?php',
      [path.join(SITE_PATH, 'wp-content', 'themes', 'acme', 'style.css')]: 'body{}',
      [path.join(SITE_PATH, 'index.php')]: '<?php',
      [path.join(SITE_PATH, 'app', 'public')]: null
    })
    const moved: string[] = []
    const result = await moveRootEntriesIntoAppPublic(SITE_PATH, operations, (message) =>
      moved.push(message.trim())
    )
    expect(result.ok).toBe(true)
    expect(result.moved).toEqual(['index.php', 'wp-config.php', 'wp-content'])
    expect(moved).toEqual(['moved index.php', 'moved wp-config.php', 'moved wp-content'])
    expect(entries.has(path.join(APP_PUBLIC, 'wp-content', 'themes', 'acme', 'style.css'))).toBe(
      true
    )
    expect(entries.has(path.join(SITE_PATH, 'wp-config.php'))).toBe(false)
  })

  it('replaces a colliding destination instead of nesting inside it', async () => {
    const { operations, entries } = fakeFileOperations({
      [path.join(SITE_PATH, 'wp-content', 'themes', 'acme', 'style.css')]: 'project',
      [path.join(APP_PUBLIC, 'wp-content', 'themes', 'twentytwentyfour', 'style.css')]: 'scaffold'
    })
    await moveRootEntriesIntoAppPublic(SITE_PATH, operations)
    expect(entries.has(path.join(APP_PUBLIC, 'wp-content', 'themes', 'acme', 'style.css'))).toBe(
      true
    )
    // The scaffold theme is gone, and nothing was nested under a second wp-content.
    expect(
      entries.has(path.join(APP_PUBLIC, 'wp-content', 'themes', 'twentytwentyfour', 'style.css'))
    ).toBe(false)
    expect(entries.has(path.join(APP_PUBLIC, 'wp-content', 'wp-content'))).toBe(false)
  })

  it('reports the failing entry and stops', async () => {
    const { operations } = fakeFileOperations({
      [path.join(SITE_PATH, 'a.php')]: '',
      [path.join(SITE_PATH, 'b.php')]: ''
    })
    const failing: LocalWpFileOperations = {
      ...operations,
      move: async (from) => {
        throw new Error(`EACCES ${from}`)
      }
    }
    const result = await moveRootEntriesIntoAppPublic(SITE_PATH, failing)
    expect(result.ok).toBe(false)
    expect(result.moved).toEqual([])
    expect(result.message).toContain('Failed to move a.php')
  })

  it('never lists the app directory as movable', async () => {
    const { operations } = fakeFileOperations({
      [path.join(SITE_PATH, 'app', 'public', 'index.php')]: '',
      [path.join(SITE_PATH, 'wp-config.php')]: ''
    })
    expect(await listRootEntriesToMove(SITE_PATH, operations)).toEqual(['wp-config.php'])
  })
})

describe('rewriteLocalDbHost', () => {
  const configPath = path.join(APP_PUBLIC, 'wp-config.php')

  it('rewrites an inherited MAMP host to localhost', async () => {
    const { operations, entries } = fakeFileOperations({
      [configPath]: `<?php\ndefine( 'DB_HOST', '127.0.0.1:8889' );\n`
    })
    expect(await rewriteLocalDbHost(configPath, operations)).toBe(true)
    expect(entries.get(configPath)).toBe(`<?php\ndefine('DB_HOST', 'localhost');\n`)
  })

  it('leaves an already-correct config untouched', async () => {
    const original = `<?php\ndefine('DB_HOST', 'localhost');\n`
    const { operations, entries } = fakeFileOperations({ [configPath]: original })
    expect(await rewriteLocalDbHost(configPath, operations)).toBe(false)
    expect(entries.get(configPath)).toBe(original)
  })

  it('returns false when the config is missing', async () => {
    const { operations } = fakeFileOperations({})
    expect(await rewriteLocalDbHost(configPath, operations)).toBe(false)
  })
})
