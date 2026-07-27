import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, removed, probeRepoHeadBranches } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[],
  probeRepoHeadBranches: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      removed.push(channel)
    })
  }
}))

// The disk reads have their own tests; what is under test here is the channel surface — its name,
// its argument validation, and that a malformed call costs no branches instead of rejecting.
vi.mock('../sites/repo-head-branch-probe', () => ({ probeRepoHeadBranches }))

import { registerRepoHeadBranchHandlers } from './repo-head-branch'

async function probe(args?: unknown): Promise<Record<string, string>> {
  const handler = handlers.get('repoHeadBranch:probe')
  if (!handler) {
    throw new Error('No handler registered for repoHeadBranch:probe')
  }
  return (await handler({}, args)) as Record<string, string>
}

beforeEach(() => {
  handlers.clear()
  removed.length = 0
  vi.clearAllMocks()
  probeRepoHeadBranches.mockResolvedValue({ '/sites/craftflex-om': 'staging' })
  registerRepoHeadBranchHandlers()
})

describe('registerRepoHeadBranchHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double-bind', () => {
    expect([...handlers.keys()]).toEqual(['repoHeadBranch:probe'])
    expect(removed).toEqual(['repoHeadBranch:probe'])
  })

  it('passes the requested paths through and returns the path-keyed branches', async () => {
    expect(await probe({ paths: ['/sites/craftflex-om'] })).toEqual({
      '/sites/craftflex-om': 'staging'
    })
    expect(probeRepoHeadBranches).toHaveBeenCalledWith(['/sites/craftflex-om'])
  })

  it('drops entries that are not usable paths before touching the disk', async () => {
    await probe({ paths: ['/sites/one', '', 7, null, '/sites/two'] })

    expect(probeRepoHeadBranches).toHaveBeenCalledWith(['/sites/one', '/sites/two'])
  })

  it('answers a malformed or empty call with no branches instead of rejecting', async () => {
    for (const args of [undefined, {}, { paths: 'not-an-array' }, { paths: [] }, { paths: [''] }]) {
      expect(await probe(args)).toEqual({})
    }
    expect(probeRepoHeadBranches).not.toHaveBeenCalled()
  })

  it('bounds how many paths one call can sweep', async () => {
    const paths = Array.from({ length: 600 }, (_unused, index) => `/sites/repo-${index}`)

    await probe({ paths })

    expect(probeRepoHeadBranches.mock.calls[0]?.[0]).toHaveLength(500)
  })
})
