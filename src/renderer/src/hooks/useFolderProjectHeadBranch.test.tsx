// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// new-workspace pulls the whole renderer runtime in at import time; the seed name under test needs
// none of it.
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}), subscribe: () => () => {} } }))

import { resolveWorkspaceSeedBranchName } from '../../../shared/workspace-name'
import { getWorkspaceSeedName } from '@/lib/new-workspace'
import { useFolderProjectHeadBranch } from './useFolderProjectHeadBranch'

const SITE_PATH = '/sites/craftflex-om'
const CREATURE = 'nautilus'

/** The wire value the main-side probe produces for this fixture — see repo-head-branch-probe.test. */
const PROBED_STAGING: Record<string, string> = { [SITE_PATH]: 'staging' }

let root: Root | null = null
let container: HTMLDivElement | null = null
let branch = ''
const probe = vi.fn()

function Probe({ dirPath }: { dirPath: string | null; renderTick?: number }): null {
  branch = useFolderProjectHeadBranch(dirPath)
  return null
}

async function render(props: { dirPath: string | null; renderTick?: number }): Promise<void> {
  await act(async () => {
    root?.render(<Probe {...props} />)
  })
}

/** What the composer does with the hook's answer for a folder project on a blank name. */
function seedNameFor(probedHeadBranch: string): string {
  return getWorkspaceSeedName({
    explicitName: '',
    prompt: '',
    linkedIssueNumber: null,
    linkedPR: null,
    branchName: resolveWorkspaceSeedBranchName({
      baseBranch: null,
      mainWorktreeBranch: '',
      probedHeadBranch
    }),
    fallbackName: CREATURE
  })
}

beforeEach(() => {
  branch = ''
  probe.mockReset()
  probe.mockResolvedValue({})
  window.api = { repoHeadBranch: { probe } } as never
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('useFolderProjectHeadBranch', () => {
  it('reports the branch the probe found for the requested path', async () => {
    probe.mockResolvedValue(PROBED_STAGING)

    await render({ dirPath: SITE_PATH })

    expect(probe).toHaveBeenCalledWith({ paths: [SITE_PATH] })
    expect(branch).toBe('staging')
  })

  it('probes nothing when the caller passes no path', async () => {
    await render({ dirPath: null })

    expect(probe).not.toHaveBeenCalled()
    expect(branch).toBe('')
  })

  // The composer re-renders on every keystroke; only a project switch is worth a disk read.
  it('probes once per path, not once per render', async () => {
    probe.mockResolvedValue(PROBED_STAGING)

    await render({ dirPath: SITE_PATH, renderTick: 1 })
    await render({ dirPath: SITE_PATH, renderTick: 2 })
    await render({ dirPath: SITE_PATH, renderTick: 3 })

    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('discards an answer that lands after the user switched projects', async () => {
    let settleFirst: ((value: Record<string, string>) => void) | null = null
    probe.mockImplementationOnce(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          settleFirst = resolve
        })
    )
    probe.mockResolvedValue({ '/sites/second': 'develop' })

    await render({ dirPath: '/sites/first' })
    await render({ dirPath: '/sites/second' })
    await act(async () => settleFirst?.({ '/sites/first': 'master' }))

    expect(branch).toBe('develop')
  })

  it('degrades to no branch when the probe rejects', async () => {
    probe.mockRejectedValue(new Error('main process is gone'))

    await render({ dirPath: SITE_PATH })

    expect(branch).toBe('')
  })

  it('degrades to no branch when the preload predates the channel', async () => {
    window.api = {} as never

    await render({ dirPath: SITE_PATH })

    expect(branch).toBe('')
  })
})

// The renderer half of the fix: before the probe existed the hook had nothing to report for a
// LocalWP folder project, and the seed fell straight through to the creature name.
describe('seeding a workspace name from the probed branch', () => {
  it('names the workspace after the nested checkout instead of a marine creature', async () => {
    probe.mockResolvedValue(PROBED_STAGING)

    await render({ dirPath: SITE_PATH })

    expect(seedNameFor(branch)).toBe('staging')
    // What the same project produced before the probe was wired in.
    expect(seedNameFor('')).toBe(CREATURE)
  })

  it('still falls back to the creature name when the probe finds no branch', async () => {
    await render({ dirPath: SITE_PATH })

    expect(branch).toBe('')
    expect(seedNameFor(branch)).toBe(CREATURE)
  })

  it('keeps a name the user typed ahead of a branch that arrives later', async () => {
    let settle: ((value: Record<string, string>) => void) | null = null
    probe.mockImplementation(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          settle = resolve
        })
    )
    const typed = (probedHeadBranch: string): string =>
      getWorkspaceSeedName({
        explicitName: 'hand-written',
        prompt: '',
        linkedIssueNumber: null,
        linkedPR: null,
        branchName: probedHeadBranch,
        fallbackName: CREATURE
      })

    await render({ dirPath: SITE_PATH })
    expect(typed(branch)).toBe('hand-written')

    await act(async () => settle?.(PROBED_STAGING))

    expect(branch).toBe('staging')
    expect(typed(branch)).toBe('hand-written')
  })
})
