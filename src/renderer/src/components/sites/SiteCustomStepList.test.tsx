// @vitest-environment happy-dom
//
// The write contract for in-app step authoring: every mutation sends the WHOLE customSteps array in
// one site patch, so a reorder cannot land a half-renumbered lane and a remove cannot drop a
// sibling. Also pins that promoting to the library copies rather than moves.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site, SiteCustomStep, SiteSummary } from '../../../../shared/site-types'
import { SiteCustomStepList } from './SiteCustomStepList'

const storeMocks = vi.hoisted(() => ({ applySiteSummary: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeMocks) => unknown) => selector(storeMocks)
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

let root: Root | null = null
let container: HTMLDivElement | null = null
let updateMock: ReturnType<typeof vi.fn>
let librarySetMock: ReturnType<typeof vi.fn>
let libraryListMock: ReturnType<typeof vi.fn>

function step(overrides: Partial<SiteCustomStep> = {}): SiteCustomStep {
  return {
    id: 'step-1',
    name: 'Warm the cache',
    group: 'deploy',
    runsOn: 'remote',
    command: 'curl -s https://acme.com',
    position: 'after',
    order: 0,
    enabled: true,
    ...overrides
  }
}

function summary(steps: SiteCustomStep[]): SiteSummary {
  const site = { id: 'site-1', displayName: 'Acme', customSteps: steps } as unknown as Site
  return { site } as unknown as SiteSummary
}

async function render(steps: SiteCustomStep[]): Promise<void> {
  await act(async () => {
    root?.render(
      <SiteCustomStepList summary={summary(steps)} editingId={null} onEditingIdChange={() => {}} />
    )
  })
}

function iconButton(label: string): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
}

async function click(button: HTMLButtonElement | null): Promise<void> {
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** The customSteps array the component last asked main to persist. */
function lastPatch(): SiteCustomStep[] {
  return updateMock.mock.calls.at(-1)?.[0].patch.customSteps
}

/** The library array the component last asked main to save. Indexed, not optional-chained, so a
 *  missing call fails the assertion rather than throwing during destructuring. */
function lastLibrarySteps(): SiteCustomStep[] {
  const [args] = librarySetMock.mock.calls.slice(-1)
  return (args[0] as { steps: SiteCustomStep[] }).steps
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  updateMock = vi.fn(
    async (args: { siteId: string; patch: { customSteps: SiteCustomStep[] } }) => ({
      ok: true as const,
      value: summary(args.patch.customSteps)
    })
  )
  libraryListMock = vi.fn(async () => ({ ok: true as const, value: [] as SiteCustomStep[] }))
  librarySetMock = vi.fn(async () => ({ ok: true as const, value: [] as SiteCustomStep[] }))
  ;(window as unknown as { api: unknown }).api = {
    sites: {
      update: updateMock,
      stepLibrary: { list: libraryListMock, set: librarySetMock }
    }
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  vi.clearAllMocks()
})

describe('SiteCustomStepList', () => {
  const lane = [
    step({ id: 'a', name: 'First', order: 0 }),
    step({ id: 'b', name: 'Second', order: 1 })
  ]

  it('renders each step with the command it will actually run', async () => {
    await render(lane)

    expect(document.body.textContent).toContain('First')
    expect(document.body.textContent).toContain('curl -s https://acme.com')
  })

  it('persists the whole renumbered lane when a step moves', async () => {
    await render(lane)
    // Two rows, so the second row's "move earlier" is the one that does something.
    const moveUps = [
      ...document.body.querySelectorAll<HTMLButtonElement>('button[aria-label="Move earlier"]')
    ]
    await click(moveUps[1])

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(lastPatch().map((entry) => [entry.id, entry.order])).toEqual([
      ['a', 1],
      ['b', 0]
    ])
  })

  it('removes only the targeted step', async () => {
    await render(lane)
    const removes = [
      ...document.body.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove"]')
    ]
    await click(removes[0])

    expect(lastPatch().map((entry) => entry.id)).toEqual(['b'])
  })

  it('toggling enabled rewrites just that flag', async () => {
    await render([step({ id: 'a', enabled: true })])
    const checkbox = document.body.querySelector<HTMLButtonElement>('button[role="checkbox"]')
    await click(checkbox)

    expect(lastPatch()).toEqual([expect.objectContaining({ id: 'a', enabled: false })])
  })

  it('promoting copies to the library with a new id, disabled, and leaves the site alone', async () => {
    await render([step({ id: 'a', name: 'Purge CDN' })])
    await click(iconButton('Copy to library'))

    const [entry] = lastLibrarySteps()
    expect(entry.name).toBe('Purge CDN')
    expect(entry.id).not.toBe('a')
    expect(entry.enabled).toBe(false)
    expect(entry.origin).toEqual({ kind: 'library', libraryId: 'a' })
    // A promote is a copy: the site's own steps are never rewritten.
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('appends to the library rather than replacing what is already there', async () => {
    libraryListMock.mockResolvedValue({ ok: true, value: [step({ id: 'existing' })] })
    await render([step({ id: 'a' })])
    await click(iconButton('Copy to library'))

    const steps = lastLibrarySteps()
    expect(steps.map((entry) => entry.id)[0]).toBe('existing')
    expect(steps).toHaveLength(2)
  })
})
