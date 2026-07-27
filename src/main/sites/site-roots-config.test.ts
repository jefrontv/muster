// Everything here runs against real directories created under os.tmpdir(). The feature's whole
// point is filesystem truth — "does this path exist, is it a directory, is it reachable right now"
// — so a mocked fs would test the mock. Nothing touches the operator's own project folders.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_ROOTS_MAX } from '../../shared/site-discovery-types'
import {
  addConfiguredSiteRoot,
  describeConfiguredSiteRoots,
  normalizeConfiguredSiteRoots,
  removeConfiguredSiteRoot,
  reorderConfiguredSiteRoot,
  type SiteRootsConfigStore
} from './site-roots-config'

// Enough of Electron for the real Store to boot: the reload tests below are only worth running
// against the actual persistence file, not a stand-in for it.
const userData = { dir: '' }

vi.mock('electron', () => ({
  app: { getPath: () => userData.dir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (plaintext: string) => Buffer.from(plaintext, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8')
  }
}))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn() }))
vi.mock('../ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => [],
  sshConfigHostsToTargets: () => []
}))

let workspace = ''

function directory(...segments: string[]): string {
  const path = join(workspace, ...segments)
  mkdirSync(path, { recursive: true })
  return path
}

function memoryStore(initial: readonly string[] = []): SiteRootsConfigStore {
  let roots = [...initial]
  return {
    getConfiguredSiteRoots: () => roots,
    setConfiguredSiteRoots: (next) => {
      roots = [...next]
    }
  }
}

/**
 * A fresh Store reading the same data file — the only honest way to test "survives a reload".
 *
 * Dynamic import, as persistence.test.ts does: `initDataPath()` captures the userData path once per
 * module instance, so a second Store only re-reads from disk after `vi.resetModules()` drops the
 * first one. A static import would hand back the same already-initialised module.
 */
async function loadStore() {
  vi.resetModules()
  const { Store, initDataPath } = await import('../persistence')
  initDataPath()
  return new Store()
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'muster-site-roots-'))
  userData.dir = directory('userData')
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe('normalizeConfiguredSiteRoots', () => {
  it('keeps the user order and drops what cannot be a root', () => {
    expect(
      normalizeConfiguredSiteRoots([
        '/second',
        '  ',
        42,
        '/first',
        'relative/path',
        null,
        '/second'
      ])
    ).toEqual(['/second', '/first'])
  })

  it('treats a trailing slash as the same root, keeping the form the user gave first', () => {
    expect(normalizeConfiguredSiteRoots(['/projects/', '/projects'])).toEqual(['/projects/'])
  })

  it('caps a hand-edited list rather than trusting it', () => {
    const many = Array.from({ length: SITE_ROOTS_MAX + 5 }, (_, index) => `/root-${index}`)

    expect(normalizeConfiguredSiteRoots(many)).toHaveLength(SITE_ROOTS_MAX)
  })

  it('reports nothing for a value that is not a list at all', () => {
    expect(normalizeConfiguredSiteRoots(undefined)).toEqual([])
    expect(normalizeConfiguredSiteRoots({ roots: ['/projects'] })).toEqual([])
  })
})

describe('addConfiguredSiteRoot', () => {
  it('appends the folder and reports it reachable', () => {
    const sites = directory('Sites')
    const store = memoryStore()

    expect(addConfiguredSiteRoot(store, sites)).toEqual([{ path: sites, missing: false }])
  })

  it('rejects a path that does not exist', () => {
    const store = memoryStore()
    const absent = join(workspace, 'no-such-folder')

    expect(() => addConfiguredSiteRoot(store, absent)).toThrow(
      `That folder does not exist: ${absent}`
    )
    expect(store.getConfiguredSiteRoots()).toEqual([])
  })

  it('rejects a file that is not a directory', () => {
    const store = memoryStore()
    const file = join(directory('Sites'), 'notes.txt')
    writeFileSync(file, 'not a folder')

    expect(() => addConfiguredSiteRoot(store, file)).toThrow(`Not a folder: ${file}`)
    expect(store.getConfiguredSiteRoots()).toEqual([])
  })

  it('rejects a duplicate, including one spelled with a trailing slash', () => {
    const sites = directory('Sites')
    const store = memoryStore([sites])

    expect(() => addConfiguredSiteRoot(store, `${sites}/`)).toThrow(`Already listed: ${sites}/`)
    expect(store.getConfiguredSiteRoots()).toEqual([sites])
  })

  it('rejects an empty choice and a relative path', () => {
    const store = memoryStore()

    expect(() => addConfiguredSiteRoot(store, '   ')).toThrow('Choose a folder to add.')
    expect(() => addConfiguredSiteRoot(store, 'Sites')).toThrow('Not an absolute path: Sites')
  })

  it('refuses to grow past the cap', () => {
    const roots = Array.from({ length: SITE_ROOTS_MAX }, (_, index) => directory(`root-${index}`))
    const store = memoryStore(roots)

    expect(() => addConfiguredSiteRoot(store, directory('one-more'))).toThrow(
      `at most ${SITE_ROOTS_MAX}`
    )
  })

  it('accepts a root nested inside another, because a depth-1 scan cannot see through it', () => {
    // <Sites> lists `client` as one folder and never its children, so <Sites>/client is the only
    // root that can surface them. Rejecting it would deny a real setup, and the scanner dedupes by
    // path, so the same site still cannot appear twice.
    const sites = directory('Sites')
    const nested = directory('Sites', 'client')
    const store = memoryStore([sites])

    expect(addConfiguredSiteRoot(store, nested).map((entry) => entry.path)).toEqual([sites, nested])
  })
})

describe('removeConfiguredSiteRoot', () => {
  it('removes by path and keeps the rest in order', () => {
    const first = directory('first')
    const second = directory('second')
    const third = directory('third')
    const store = memoryStore([first, second, third])

    expect(removeConfiguredSiteRoot(store, second).map((entry) => entry.path)).toEqual([
      first,
      third
    ])
  })

  it('allows removing the last root, which hands discovery back to derivation', () => {
    const store = memoryStore([directory('Sites')])

    expect(removeConfiguredSiteRoot(store, directory('Sites'))).toEqual([])
    expect(store.getConfiguredSiteRoots()).toEqual([])
  })

  it('rejects a path that is not configured', () => {
    const store = memoryStore([directory('Sites')])

    expect(() => removeConfiguredSiteRoot(store, '/elsewhere')).toThrow(
      'Not a configured folder: /elsewhere'
    )
  })
})

describe('describeConfiguredSiteRoots', () => {
  it('marks an unreachable root missing, keeps it listed, and clears the mark when it returns', () => {
    const volume = directory('Volumes', 'devcenter-repos')
    const store = memoryStore([directory('Sites'), volume])

    rmSync(volume, { recursive: true, force: true })
    expect(describeConfiguredSiteRoots(store)).toEqual([
      { path: join(workspace, 'Sites'), missing: false },
      { path: volume, missing: true }
    ])
    // The setting itself is untouched: nothing pruned the ejected volume behind the user's back.
    expect(store.getConfiguredSiteRoots()).toContain(volume)

    mkdirSync(volume, { recursive: true })
    expect(describeConfiguredSiteRoots(store)).toEqual([
      { path: join(workspace, 'Sites'), missing: false },
      { path: volume, missing: false }
    ])
  })

  it('lets a missing root be removed like any other', () => {
    const volume = directory('Volumes', 'gone')
    const store = memoryStore([volume])
    rmSync(volume, { recursive: true, force: true })

    expect(removeConfiguredSiteRoot(store, volume)).toEqual([])
  })

  it('reports an empty list when nothing is configured', () => {
    expect(describeConfiguredSiteRoots(memoryStore())).toEqual([])
  })
})

describe('reorderConfiguredSiteRoot', () => {
  it('moves an entry to a position, keyed on its path rather than its old index', () => {
    const first = directory('first')
    const second = directory('second')
    const third = directory('third')
    const store = memoryStore([first, second, third])

    expect(reorderConfiguredSiteRoot(store, third, 0).map((entry) => entry.path)).toEqual([
      third,
      first,
      second
    ])
  })

  it('clamps a position past either end instead of failing', () => {
    const first = directory('first')
    const second = directory('second')
    const store = memoryStore([first, second])

    expect(reorderConfiguredSiteRoot(store, first, 99).map((entry) => entry.path)).toEqual([
      second,
      first
    ])
    expect(reorderConfiguredSiteRoot(store, first, -5).map((entry) => entry.path)).toEqual([
      first,
      second
    ])
  })

  it('rejects a path that is not configured, and a position that is not a number', () => {
    const first = directory('first')
    const store = memoryStore([first])

    expect(() => reorderConfiguredSiteRoot(store, '/elsewhere', 0)).toThrow(
      'Not a configured folder: /elsewhere'
    )
    expect(() => reorderConfiguredSiteRoot(store, first, Number.NaN)).toThrow('Not a position')
  })
})

describe('persistence through the real Store', () => {
  it('keeps an added root across a reload', async () => {
    const sites = directory('Sites')
    const added = await loadStore()

    addConfiguredSiteRoot(added, sites)
    added.flush()

    const reloaded = await loadStore()
    expect(reloaded.getConfiguredSiteRoots()).toEqual([sites])
    expect(describeConfiguredSiteRoots(reloaded)).toEqual([{ path: sites, missing: false }])
  })

  it('keeps a removal, and the surviving order, across a reload', async () => {
    const first = directory('first')
    const second = directory('second')
    const third = directory('third')
    const written = await loadStore()

    addConfiguredSiteRoot(written, first)
    addConfiguredSiteRoot(written, second)
    addConfiguredSiteRoot(written, third)
    reorderConfiguredSiteRoot(written, third, 0)
    removeConfiguredSiteRoot(written, first)
    written.flush()

    const reloaded = await loadStore()
    expect(reloaded.getConfiguredSiteRoots()).toEqual([third, second])
  })

  it('keeps a root whose volume went away, so remounting restores it', async () => {
    const volume = directory('Volumes', 'devcenter-repos')
    const written = await loadStore()

    addConfiguredSiteRoot(written, volume)
    written.flush()
    rmSync(volume, { recursive: true, force: true })

    const offline = await loadStore()
    expect(describeConfiguredSiteRoots(offline)).toEqual([{ path: volume, missing: true }])

    mkdirSync(volume, { recursive: true })
    expect(describeConfiguredSiteRoots(await loadStore())).toEqual([
      { path: volume, missing: false }
    ])
  })
})
