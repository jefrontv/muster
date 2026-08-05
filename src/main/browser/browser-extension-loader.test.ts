import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  loadBrowserExtensionsIntoSession,
  normalizeExtensionPaths,
  readExtensionManifest,
  unloadBrowserExtensionFromSession
} from './browser-extension-loader'

let workDir: string

function makeExtension(name: string, manifest: unknown = { name, version: '1.2.3' }): string {
  const dir = path.join(workDir, name)
  mkdirSync(dir, { recursive: true })
  if (manifest !== null) {
    writeFileSync(
      path.join(dir, 'manifest.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    )
  }
  return dir
}

type FakeSession = {
  extensions: {
    loadExtension: ReturnType<typeof vi.fn>
    getAllExtensions: ReturnType<typeof vi.fn>
    removeExtension: ReturnType<typeof vi.fn>
  }
}

function createSession(overrides: Partial<Record<string, unknown>> = {}): FakeSession {
  const loaded: { id: string; path: string; name?: string }[] = []
  const extensions = {
    loadExtension: vi.fn(async (dir: string) => {
      const entry = { id: `id-${loaded.length}`, path: dir, name: path.basename(dir) }
      loaded.push(entry)
      return entry
    }),
    getAllExtensions: vi.fn(() => loaded),
    removeExtension: vi.fn((id: string) => {
      const index = loaded.findIndex((entry) => entry.id === id)
      if (index >= 0) {
        loaded.splice(index, 1)
      }
    }),
    ...overrides
  }
  return { extensions } as unknown as FakeSession
}

describe('browser extension loader', () => {
  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'muster-ext-'))
  })
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  describe('readExtensionManifest', () => {
    it('reads name and version from a valid unpacked extension', () => {
      expect(readExtensionManifest(makeExtension('good'))).toEqual({
        ok: true,
        name: 'good',
        version: '1.2.3',
        settingsPage: null
      })
    })

    it('rejects a folder with no manifest', () => {
      const result = readExtensionManifest(makeExtension('bare', null))
      expect(result).toEqual({ ok: false, error: 'No manifest.json in this folder.' })
    })

    it('rejects malformed manifest JSON', () => {
      const result = readExtensionManifest(makeExtension('broken', '{ not json'))
      expect(result.ok).toBe(false)
    })

    it('rejects a manifest missing required fields', () => {
      const result = readExtensionManifest(makeExtension('partial', { name: 'x' }))
      expect(result).toEqual({
        ok: false,
        error: 'manifest.json is missing "name" or "version".'
      })
    })

    it('rejects a relative path', () => {
      expect(readExtensionManifest('relative/dir').ok).toBe(false)
    })

    it('rejects a missing folder', () => {
      expect(readExtensionManifest(path.join(workDir, 'nope')).ok).toBe(false)
    })

    it('reports the popup page so it can be opened as a tab', () => {
      const dir = makeExtension('popup-ext', {
        name: 'popup-ext',
        version: '1.0',
        action: { default_popup: 'popup.html' }
      })
      expect(readExtensionManifest(dir)).toMatchObject({ settingsPage: 'popup.html' })
    })

    it('falls back to an options page and strips a leading ./', () => {
      const dir = makeExtension('options-ext', {
        name: 'options-ext',
        version: '1.0',
        options_ui: { page: './options.html' }
      })
      expect(readExtensionManifest(dir)).toMatchObject({ settingsPage: 'options.html' })
    })
  })

  describe('normalizeExtensionPaths', () => {
    it('drops blanks, duplicates, and trailing separators', () => {
      expect(normalizeExtensionPaths(['/a/b', '/a/b/', '  ', '/c', '/a/b'])).toEqual(['/a/b', '/c'])
    })

    it('handles an absent list', () => {
      expect(normalizeExtensionPaths(undefined)).toEqual([])
    })
  })

  describe('loadBrowserExtensionsIntoSession', () => {
    it('loads each valid extension once', async () => {
      const sess = createSession()
      const dirs = [makeExtension('one'), makeExtension('two')]

      const statuses = await loadBrowserExtensionsIntoSession(sess as never, dirs)

      expect(statuses.map((s) => s.error)).toEqual([null, null])
      expect(statuses.map((s) => s.name)).toEqual(['one', 'two'])
      expect(sess.extensions.loadExtension).toHaveBeenCalledTimes(2)
    })

    it('reports the manifest error instead of calling Electron', async () => {
      const sess = createSession()
      const statuses = await loadBrowserExtensionsIntoSession(sess as never, [
        makeExtension('bad', null)
      ])

      expect(statuses[0].error).toBe('No manifest.json in this folder.')
      expect(statuses[0].id).toBeNull()
      expect(sess.extensions.loadExtension).not.toHaveBeenCalled()
    })

    it('surfaces an Electron load failure without throwing', async () => {
      const sess = createSession({
        loadExtension: vi.fn(async () => {
          throw new Error('Manifest version 2 is unsupported')
        })
      })

      const statuses = await loadBrowserExtensionsIntoSession(sess as never, [makeExtension('mv2')])

      expect(statuses[0].error).toBe('Manifest version 2 is unsupported')
      expect(statuses[0].id).toBeNull()
    })

    it('does not reload an extension the session already has', async () => {
      const sess = createSession()
      const dir = makeExtension('sticky')

      await loadBrowserExtensionsIntoSession(sess as never, [dir])
      const second = await loadBrowserExtensionsIntoSession(sess as never, [dir])

      expect(sess.extensions.loadExtension).toHaveBeenCalledTimes(1)
      expect(second[0].error).toBeNull()
      expect(second[0].id).toBe('id-0')
    })

    it('reports a build without the extensions API rather than crashing', async () => {
      const statuses = await loadBrowserExtensionsIntoSession({ extensions: {} } as never, [
        makeExtension('any')
      ])

      expect(statuses[0].error).toBe('This Electron build does not expose the extensions API.')
    })

    it('skips work entirely when nothing is configured', async () => {
      const sess = createSession()
      expect(await loadBrowserExtensionsIntoSession(sess as never, [])).toEqual([])
      expect(sess.extensions.loadExtension).not.toHaveBeenCalled()
    })
  })

  describe('unloadBrowserExtensionFromSession', () => {
    it('removes a loaded extension by path', async () => {
      const sess = createSession()
      const dir = makeExtension('removable')
      await loadBrowserExtensionsIntoSession(sess as never, [dir])

      expect(unloadBrowserExtensionFromSession(sess as never, dir)).toBe(true)
      expect(sess.extensions.removeExtension).toHaveBeenCalledWith('id-0')
    })

    it('returns false when the path is not loaded', () => {
      const sess = createSession()
      expect(unloadBrowserExtensionFromSession(sess as never, '/not/loaded')).toBe(false)
    })
  })
})
