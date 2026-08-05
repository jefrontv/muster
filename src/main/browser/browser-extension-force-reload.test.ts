import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let workDir: string
const fakeSessions = new Map<string, ReturnType<typeof createSession>>()

vi.mock('electron', () => ({
  session: {
    fromPartition: (partition: string) => {
      const existing = fakeSessions.get(partition)
      if (existing) {
        return existing
      }
      const created = createSession()
      fakeSessions.set(partition, created)
      return created
    }
  }
}))

function createSession() {
  const loaded: { id: string; path: string; name: string }[] = []
  return {
    loadCount: 0,
    extensions: {
      loadExtension: vi.fn(async function (this: void, dir: string) {
        const entry = { id: `id-${dir}`, path: dir, name: path.basename(dir) }
        loaded.push(entry)
        return entry
      }),
      getAllExtensions: vi.fn(() => [...loaded]),
      removeExtension: vi.fn((id: string) => {
        const index = loaded.findIndex((entry) => entry.id === id)
        if (index >= 0) {
          loaded.splice(index, 1)
        }
      })
    }
  }
}

const {
  getBrowserExtensionStatuses,
  registerBrowserExtensionSettingsBridge,
  reloadBrowserExtensionsEverywhere,
  resetBrowserExtensionStateForTest
} = await import('./browser-extension-service')

function makeExtension(name: string): string {
  const dir = path.join(workDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name, version: '1.0.0' }))
  return dir
}

describe('forced extension reload', () => {
  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'muster-reload-'))
    fakeSessions.clear()
    resetBrowserExtensionStateForTest()
  })

  it('re-loads an already-loaded extension so edited files take effect', async () => {
    const dir = makeExtension('configurable')
    registerBrowserExtensionSettingsBridge({
      getPaths: () => [dir],
      setPaths: () => {},
      listPartitions: () => ['persist:test']
    })

    await reloadBrowserExtensionsEverywhere(['persist:test'])
    const sess = fakeSessions.get('persist:test')
    expect(sess?.extensions.loadExtension).toHaveBeenCalledTimes(1)

    // Without force this is a no-op, which is how a regenerated config.js went unnoticed.
    await reloadBrowserExtensionsEverywhere(['persist:test'])
    expect(sess?.extensions.loadExtension).toHaveBeenCalledTimes(1)

    await reloadBrowserExtensionsEverywhere(['persist:test'], { force: true })
    expect(sess?.extensions.removeExtension).toHaveBeenCalledTimes(1)
    expect(sess?.extensions.loadExtension).toHaveBeenCalledTimes(2)

    rmSync(workDir, { recursive: true, force: true })
  })

  it('stops reporting extensions once none are configured', async () => {
    const dir = makeExtension('transient')
    let paths = [dir]
    registerBrowserExtensionSettingsBridge({
      getPaths: () => paths,
      setPaths: (next) => {
        paths = next
      },
      listPartitions: () => ['persist:test']
    })

    await reloadBrowserExtensionsEverywhere(['persist:test'])
    expect(getBrowserExtensionStatuses()).toHaveLength(1)

    paths = []
    await reloadBrowserExtensionsEverywhere(['persist:test'])

    // A stale entry here is what made a removed extension look like it was still loaded.
    expect(getBrowserExtensionStatuses()).toEqual([])

    rmSync(workDir, { recursive: true, force: true })
  })
})
