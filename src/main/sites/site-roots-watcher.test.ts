import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SITE_ROOTS_DEBOUNCE_MS,
  SITE_ROOTS_MAX,
  SITE_ROOTS_SWEEP_MS,
  type SiteRootsChangedEvent
} from '../../shared/site-discovery-types'
import {
  derivePrimarySiteRoot,
  deriveSiteRoots,
  startSiteRootsWatcher,
  type SiteRootsStore,
  type SiteRootsTimerToken,
  type SiteRootsWatchFn
} from './site-roots-watcher'

const NOW = 1_700_000_000_000

function createStore(
  repoPaths: string[] = [],
  sitePaths: string[] = [],
  configured: string[] = []
) {
  const state = { repos: [...repoPaths], sites: [...sitePaths], configured: [...configured] }
  return {
    state,
    store: {
      getRepos: () => state.repos.map((path) => ({ path })),
      listSites: () => state.sites.map((path) => ({ path })),
      getConfiguredSiteRoots: () => state.configured
    } satisfies SiteRootsStore
  }
}

/** Hand-rolled rather than vi.useFakeTimers so a test can assert the exact delays requested. */
function createClock() {
  const timeouts = new Map<number, { handler: () => void; ms: number }>()
  const intervals = new Map<number, { handler: () => void; ms: number }>()
  let nextToken = 1
  return {
    timeouts,
    intervals,
    setTimeout: (handler: () => void, ms: number): SiteRootsTimerToken => {
      const token = nextToken++
      timeouts.set(token, { handler, ms })
      return token
    },
    clearTimeout: (token: SiteRootsTimerToken): void => {
      if (typeof token === 'number') {
        timeouts.delete(token)
      }
    },
    setInterval: (handler: () => void, ms: number): SiteRootsTimerToken => {
      const token = nextToken++
      intervals.set(token, { handler, ms })
      return token
    },
    clearInterval: (token: SiteRootsTimerToken): void => {
      if (typeof token === 'number') {
        intervals.delete(token)
      }
    },
    fireTimeouts: (): void => {
      // Snapshot: a fired handler may schedule another timeout, and iterating the live map
      // would then run it in the same pass.
      for (const [token, timer] of Array.from(timeouts)) {
        timeouts.delete(token)
        timer.handler()
      }
    },
    fireIntervals: (): void => {
      // Snapshot for the same reason as fireTimeouts.
      for (const timer of Array.from(intervals.values())) {
        timer.handler()
      }
    }
  }
}

type FakeWatcher = {
  root: string
  recursive: boolean
  closed: boolean
  emitChange: () => void
  emitError: (error: Error) => void
  close: () => void
  on: (event: 'error', listener: (error: Error) => void) => unknown
}

function createFakeWatch(failingRoots: readonly string[] = []) {
  const opened: FakeWatcher[] = []
  const watch: SiteRootsWatchFn = (root, options, listener) => {
    if (failingRoots.includes(root)) {
      throw new Error(`EPERM: watch '${root}'`)
    }
    let onError: ((error: Error) => void) | null = null
    const watcher: FakeWatcher = {
      root,
      recursive: options.recursive,
      closed: false,
      emitChange: listener,
      emitError: (error) => onError?.(error),
      close: () => {
        watcher.closed = true
      },
      on: (_event, handler) => {
        onError = handler
        return watcher
      }
    }
    opened.push(watcher)
    return watcher
  }
  return {
    opened,
    watch,
    openRoots: (): string[] =>
      opened
        .filter((watcher) => !watcher.closed)
        .map((watcher) => watcher.root)
        .sort()
  }
}

function createHarness(
  repoPaths: string[],
  sitePaths: string[] = [],
  failingRoots: readonly string[] = []
) {
  const events: SiteRootsChangedEvent[] = []
  const clock = createClock()
  const fs = createFakeWatch(failingRoots)
  const { state, store } = createStore(repoPaths, sitePaths)
  const handle = startSiteRootsWatcher(store, {
    onChange: (event) => events.push(event),
    watch: fs.watch,
    directoryExists: () => true,
    now: () => NOW,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval
  })
  return { events, clock, fs, state, handle, reasons: () => events.map((event) => event.reason) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deriveSiteRoots', () => {
  it('derives one root per distinct parent of a repo or site path', () => {
    const { store } = createStore(
      ['/projects/api', '/projects/web'],
      ['/sites/acme', '/projects/blog']
    )

    expect(deriveSiteRoots(store, () => true)).toEqual(['/projects', '/sites'])
  })

  it('skips a root that is not on disk', () => {
    const { store } = createStore(['/projects/api', '/ejected/volume/acme'])

    expect(deriveSiteRoots(store, (candidate) => candidate === '/projects')).toEqual(['/projects'])
  })

  it('skips an empty or relative path, which has no parent worth watching', () => {
    const { store } = createStore(['relative/api', '/projects/api'], [''])

    expect(deriveSiteRoots(store, () => true)).toEqual(['/projects'])
  })

  it('keeps the filesystem root only because a project really does live there', () => {
    const { store } = createStore(['/orphan', '/projects/api'])

    expect(
      deriveSiteRoots({ ...store, getRepos: () => [{ path: '/orphan' }] }, () => true)
    ).toEqual(['/'])
    // Both survive: a depth-1 watch on '/' sees '/orphan''s siblings and nothing under
    // '/projects', so neither root can cover for the other.
    expect(deriveSiteRoots(store, () => true)).toEqual(['/', '/projects'])
  })

  it('ignores a repo that lives on an ssh host', () => {
    const store: SiteRootsStore = {
      getRepos: () => [{ path: '/projects/api' }, { path: '/srv/www/site', connectionId: 'ssh-1' }],
      listSites: () => [],
      getConfiguredSiteRoots: () => []
    }

    expect(deriveSiteRoots(store, () => true)).toEqual(['/projects'])
  })

  it('keeps a root and a root nested inside it, because depth-1 watches do not overlap', () => {
    const { store } = createStore(['/Users/jake/stray', '/Users/jake/Documents/Sites/acme'])

    // Regression: collapsing to the deepest root evicted the folder holding every project the
    // moment one repo was checked out a level deeper inside it.
    expect(deriveSiteRoots(store, () => true)).toEqual([
      '/Users/jake',
      '/Users/jake/Documents/Sites'
    ])
  })

  it('caps at SITE_ROOTS_MAX keeping the parents that account for the most entries', () => {
    const strays = Array.from({ length: SITE_ROOTS_MAX + 3 }, (_, i) => `/stray-${i}/project`)
    const dense = Array.from({ length: 70 }, (_, i) => `/projects/repo-${i}`)
    const { store } = createStore([...strays, ...dense])

    const roots = deriveSiteRoots(store, () => true)

    expect(roots).toHaveLength(SITE_ROOTS_MAX)
    expect(roots).toContain('/projects')
    expect(roots).toEqual([...roots].sort())
  })

  it('returns the configured list in the user order, ignoring the derived parents entirely', () => {
    const { store } = createStore(
      ['/projects/api'],
      ['/sites/acme'],
      ['/Volumes/work', '/Users/jake/Documents/Sites']
    )

    expect(deriveSiteRoots(store, () => true)).toEqual([
      '/Volumes/work',
      '/Users/jake/Documents/Sites'
    ])
  })

  it('keeps a configured root that is not on disk, unlike a derived one', () => {
    const { store } = createStore(['/projects/api'], [], ['/Volumes/ejected'])

    expect(deriveSiteRoots(store, () => false)).toEqual(['/Volumes/ejected'])
  })

  it('falls back to derivation the moment the configured list empties', () => {
    const { state, store } = createStore(['/projects/api'], [], ['/Volumes/work'])

    expect(deriveSiteRoots(store, () => true)).toEqual(['/Volumes/work'])
    state.configured = []
    expect(deriveSiteRoots(store, () => true)).toEqual(['/projects'])
  })
})

describe('derivePrimarySiteRoot', () => {
  it('reports the densest root even when it sorts last in the watched set', () => {
    const { store } = createStore([
      '/Users/jake/stray',
      ...Array.from({ length: 5 }, (_unused, index) => `/Users/jake/Documents/Sites/repo-${index}`)
    ])

    // The pair the renderer needs to keep apart: `roots` is alphabetical for stable rendering, so
    // its first entry is the one-off stray, not the folder holding every project.
    expect(deriveSiteRoots(store, () => true)[0]).toBe('/Users/jake')
    expect(derivePrimarySiteRoot(store, () => true)).toBe('/Users/jake/Documents/Sites')
  })

  it('breaks a density tie the same way the watched set does', () => {
    const { store } = createStore(['/beta/api', '/alpha/api'])

    expect(derivePrimarySiteRoot(store, () => true)).toBe('/alpha')
  })

  it('skips a densest root that is not on disk', () => {
    const { store } = createStore(['/ejected/a', '/ejected/b', '/projects/api'])

    expect(derivePrimarySiteRoot(store, (candidate) => candidate === '/projects')).toBe('/projects')
  })

  it('reports an empty string when no root exists yet, so the caller asks instead of guessing', () => {
    expect(derivePrimarySiteRoot(createStore().store, () => true)).toBe('')
  })

  it('prefers the first reachable configured root over the densest derived one', () => {
    const { store } = createStore(
      Array.from({ length: 5 }, (_unused, index) => `/projects/repo-${index}`),
      [],
      ['/Volumes/ejected', '/Volumes/work']
    )

    expect(derivePrimarySiteRoot(store, (candidate) => candidate !== '/Volumes/ejected')).toBe(
      '/Volumes/work'
    )
  })

  it('asks rather than guessing when every configured root is offline', () => {
    // Falling through to a derived parent here would clone into a folder the user never named,
    // just because a drive was unplugged.
    const { store } = createStore(['/projects/api'], [], ['/Volumes/ejected'])

    expect(derivePrimarySiteRoot(store, (candidate) => candidate === '/projects')).toBe('')
  })
})

describe('startSiteRootsWatcher', () => {
  it('watches every derived root depth-1 only', () => {
    const harness = createHarness(['/projects/api'], ['/sites/acme'])

    expect(harness.fs.openRoots()).toEqual(['/projects', '/sites'])
    expect(harness.fs.opened.every((watcher) => watcher.recursive === false)).toBe(true)

    harness.handle.stop()
  })

  it('moves its handles onto the configured list when the user chooses folders', () => {
    const harness = createHarness(['/projects/api'])

    expect(harness.fs.openRoots()).toEqual(['/projects'])

    harness.state.configured = ['/Volumes/work']
    harness.handle.refreshRoots()

    expect(harness.fs.openRoots()).toEqual(['/Volumes/work'])
    expect(harness.handle.getRoots()).toEqual(['/Volumes/work'])
    expect(harness.reasons()).toEqual(['roots-changed'])

    // Emptying it hands the watch set straight back to derivation, no restart required.
    harness.state.configured = []
    harness.handle.refreshRoots()

    expect(harness.fs.openRoots()).toEqual(['/projects'])

    harness.handle.stop()
  })

  it('collapses a burst of watch events into one debounced emission', () => {
    const harness = createHarness(['/projects/api'])
    const watcher = harness.fs.opened[0]

    watcher.emitChange()
    watcher.emitChange()
    watcher.emitChange()

    expect(harness.events).toEqual([])
    expect([...harness.clock.timeouts.values()].map((timer) => timer.ms)).toEqual([
      SITE_ROOTS_DEBOUNCE_MS
    ])

    harness.clock.fireTimeouts()

    expect(harness.events).toEqual([{ reason: 'watch', roots: ['/projects'], at: NOW }])

    // The next burst is a new burst, not a continuation of the collapsed one.
    watcher.emitChange()
    harness.clock.fireTimeouts()
    expect(harness.reasons()).toEqual(['watch', 'watch'])

    harness.handle.stop()
  })

  it('emits a sweep on its interval', () => {
    const harness = createHarness(['/projects/api'])

    expect([...harness.clock.intervals.values()].map((timer) => timer.ms)).toEqual([
      SITE_ROOTS_SWEEP_MS
    ])

    harness.clock.fireIntervals()
    harness.clock.fireIntervals()

    expect(harness.events).toEqual([
      { reason: 'sweep', roots: ['/projects'], at: NOW },
      { reason: 'sweep', roots: ['/projects'], at: NOW }
    ])

    harness.handle.stop()
  })

  it('emits roots-changed from refreshRoots only when the derived set moved', () => {
    const harness = createHarness(['/projects/api'])

    // A second repo under a root that is already watched does not move the set.
    harness.state.repos.push('/projects/web')
    harness.handle.refreshRoots()

    expect(harness.events).toEqual([])
    expect(harness.handle.getRoots()).toEqual(['/projects'])

    harness.state.sites.push('/sites/acme')
    harness.handle.refreshRoots()

    expect(harness.events).toEqual([
      { reason: 'roots-changed', roots: ['/projects', '/sites'], at: NOW }
    ])
    expect(harness.handle.getRoots()).toEqual(['/projects', '/sites'])
    // The watches were restarted, not stacked: the first '/projects' watcher is closed.
    expect(harness.fs.openRoots()).toEqual(['/projects', '/sites'])
    expect(harness.fs.opened.filter((watcher) => watcher.closed)).toHaveLength(1)

    harness.handle.stop()
  })

  it('survives a root it cannot watch, keeps the others, and logs it once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const harness = createHarness(['/projects/api', '/mnt/share/acme'], [], ['/mnt/share'])

    expect(harness.fs.openRoots()).toEqual(['/projects'])
    expect(warn).toHaveBeenCalledTimes(1)

    // The unwatchable root stays in the reported set — the periodic sweep is what covers it.
    harness.fs.opened[0].emitChange()
    harness.clock.fireTimeouts()
    expect(harness.events).toEqual([
      { reason: 'watch', roots: ['/mnt/share', '/projects'], at: NOW }
    ])

    // Re-opening the watches over a still-broken root must not log a second time.
    harness.state.sites.push('/sites/acme')
    harness.handle.refreshRoots()
    expect(harness.fs.openRoots()).toEqual(['/projects', '/sites'])
    expect(warn).toHaveBeenCalledTimes(1)

    harness.handle.stop()
  })

  it('drops a watcher that fails asynchronously without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const harness = createHarness(['/projects/api'])

    expect(() => harness.fs.opened[0].emitError(new Error('ENOENT'))).not.toThrow()

    expect(harness.fs.openRoots()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(harness.handle.getRoots()).toEqual(['/projects'])

    harness.handle.stop()
  })

  it('stop clears both timers, closes every watcher, and silences later emissions', () => {
    const harness = createHarness(['/projects/api'], ['/sites/acme'])
    harness.fs.opened[0].emitChange()

    expect(harness.clock.timeouts.size).toBe(1)
    expect(harness.clock.intervals.size).toBe(1)

    harness.handle.stop()

    expect(harness.clock.timeouts.size).toBe(0)
    expect(harness.clock.intervals.size).toBe(0)
    expect(harness.fs.opened.every((watcher) => watcher.closed)).toBe(true)

    harness.state.sites.push('/elsewhere/acme')
    harness.handle.refreshRoots()
    harness.clock.fireIntervals()

    expect(harness.events).toEqual([])
  })
})
