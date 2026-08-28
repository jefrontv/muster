// @vitest-environment happy-dom
//
// The write contract for in-app step authoring: every mutation sends the WHOLE customSteps array in
// one site patch, so a reorder cannot land a half-renumbered lane and a remove cannot drop a
// sibling. Also pins that promoting to the library copies rather than moves.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site, SiteCustomStep, SiteSummary } from '../../../../shared/site-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SiteCustomStepList } from './SiteCustomStepList'

const storeMocks = vi.hoisted(() => ({ applySiteSummary: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeMocks) => unknown) => selector(storeMocks)
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

let root: Root | null = null
let container: HTMLDivElement | null = null
let updateMock: ReturnType<typeof vi.fn>
let promoteMock: ReturnType<typeof vi.fn>

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

let libraryChanges: SiteCustomStep[][] = []

async function render(steps: SiteCustomStep[]): Promise<void> {
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <SiteCustomStepList
          summary={summary(steps)}
          editingId={null}
          onEditingIdChange={() => {}}
          onLibraryChanged={(library) => libraryChanges.push(library)}
        />
      </TooltipProvider>
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
  promoteMock = vi.fn(async () => ({ ok: true as const, value: [{ id: 'library-new' }] }))
  ;(window as unknown as { api: unknown }).api = {
    sites: {
      update: updateMock,
      stepLibrary: { promote: promoteMock }
    }
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  libraryChanges = []
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

  it('delegates promotion to main and hands the refreshed library to the parent', async () => {
    // Main owns this: embedding the step's script means reading the checkout, which the renderer
    // cannot do. A renderer-side copy would silently produce a library entry with no script.
    await render([step({ id: 'a', name: 'Purge CDN' })])
    await click(iconButton('Copy to library'))

    expect(promoteMock).toHaveBeenCalledWith({ siteId: 'site-1', stepId: 'a' })
    expect(libraryChanges.at(-1)).toEqual([expect.objectContaining({ id: 'library-new' })])
    // A promote is a copy: the site's own steps are never rewritten.
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('leaves the library alone when the promote fails', async () => {
    promoteMock.mockResolvedValue({ ok: false, error: 'script missing' })
    await render([step({ id: 'a' })])
    await click(iconButton('Copy to library'))

    expect(libraryChanges).toHaveLength(0)
  })
})
