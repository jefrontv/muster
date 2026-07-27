// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { SiteRootEntry } from '../../../../shared/site-discovery-types'
import { SiteRootsDialog } from './SiteRootsDialog'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const SITES = '/tmp/muster-fixture/Sites'
const VOLUME = '/tmp/muster-fixture/Volumes/devcenter-repos'

let root: Root | null = null
let container: HTMLDivElement | null = null
let configuredMock: Mock
let addMock: Mock
let removeMock: Mock
let reorderMock: Mock
let pickDirectoryMock: Mock

function entries(...paths: [string, boolean][]): SiteRootEntry[] {
  return paths.map(([path, missing]) => ({ path, missing }))
}

function installApi(configured: SiteRootEntry[]): void {
  configuredMock = vi.fn().mockResolvedValue({ ok: true, value: configured })
  addMock = vi.fn()
  removeMock = vi.fn()
  reorderMock = vi.fn()
  pickDirectoryMock = vi.fn()
  // Only the channels this dialog uses; anything else would be a silent dependency.
  Reflect.set(globalThis.window, 'api', {
    siteRoots: {
      configured: configuredMock,
      add: addMock,
      remove: removeMock,
      reorder: reorderMock
    },
    repos: { pickDirectory: pickDirectoryMock }
  })
}

async function render(effectiveRoots: string[] = []): Promise<void> {
  await act(async () => {
    root?.render(<SiteRootsDialog open onOpenChange={() => {}} effectiveRoots={effectiveRoots} />)
  })
}

/** Radix portals the dialog out of the render container, so every query starts at the body. */
function rows(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('.font-mono')].map(
    (path) => path.parentElement as HTMLElement
  )
}

function button(label: string, within: ParentNode = document.body): HTMLButtonElement | undefined {
  return [...within.querySelectorAll('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === label ||
      (candidate.textContent ?? '').includes(label)
  )
}

async function click(target: HTMLButtonElement | undefined): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  installApi(entries([SITES, false]))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
  toastError.mockReset()
})

describe('SiteRootsDialog', () => {
  it('lists the configured folders in order and marks the unreachable one', async () => {
    installApi(entries([SITES, false], [VOLUME, true]))
    await render()

    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining(SITES),
      expect.stringContaining(VOLUME)
    ])
    // The ejected volume is still a row, not a gap: the setting survived, it just cannot be read.
    expect(rows()[1]?.textContent).toContain('Missing')
    expect(rows()[0]?.textContent).not.toContain('Missing')
  })

  it('explains that an empty list means the roots are being derived, and names them', async () => {
    installApi([])
    await render(['/tmp/muster-fixture/projects'])

    expect(document.body.textContent).toContain('/tmp/muster-fixture/projects')
    expect(document.body.textContent).toContain('No folders chosen yet')
  })

  it('adds the folder the picker returned and renders the list the write answered with', async () => {
    pickDirectoryMock.mockResolvedValue(VOLUME)
    addMock.mockResolvedValue({ ok: true, value: entries([SITES, false], [VOLUME, false]) })
    await render()

    await click(button('Add folder'))

    expect(addMock).toHaveBeenCalledWith(VOLUME)
    expect(rows()).toHaveLength(2)
  })

  it('does not write when the picker is dismissed', async () => {
    pickDirectoryMock.mockResolvedValue(null)
    await render()

    await click(button('Add folder'))

    expect(addMock).not.toHaveBeenCalled()
  })

  it('surfaces a rejected add without disturbing the rows', async () => {
    pickDirectoryMock.mockResolvedValue('/tmp/muster-fixture/notes.txt')
    addMock.mockResolvedValue({ ok: false, error: 'Not a folder: /tmp/muster-fixture/notes.txt' })
    await render()

    await click(button('Add folder'))

    expect(toastError).toHaveBeenCalledWith('Not a folder: /tmp/muster-fixture/notes.txt')
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining(SITES)])
  })

  it('reorders by path and target position, with the ends disabled', async () => {
    installApi(entries([SITES, false], [VOLUME, true]))
    reorderMock.mockResolvedValue({ ok: true, value: entries([VOLUME, true], [SITES, false]) })
    await render()

    expect(button('Move up', rows()[0])?.disabled).toBe(true)
    expect(button('Move down', rows()[1])?.disabled).toBe(true)

    await click(button('Move up', rows()[1]))

    expect(reorderMock).toHaveBeenCalledWith({ path: VOLUME, toIndex: 0 })
    expect(rows()[0]?.textContent).toContain(VOLUME)
  })

  it('removes by path, including a folder that is not reachable', async () => {
    installApi(entries([SITES, false], [VOLUME, true]))
    removeMock.mockResolvedValue({ ok: true, value: entries([SITES, false]) })
    await render()

    await click(button('Remove', rows()[1]))

    expect(removeMock).toHaveBeenCalledWith(VOLUME)
    expect(rows()).toHaveLength(1)
  })
})
