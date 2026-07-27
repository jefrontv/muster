// @vitest-environment happy-dom
//
// Drives the shipped Radix dialog against the REAL store slice with only the runtime client
// mocked, so "opening the lightbox costs no bytes" and "Escape puts focus back on the thumbnail"
// are proved by the components that ship rather than by stubs standing in for them.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

import type { AppState } from '@/store/types'
import { createActiveCollabSlice } from '@/store/slices/activecollab'
import { clearActiveCollabAttachmentImageFetches } from '@/store/slices/activecollab-attachment-images'
import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'

type ImageResult = ActiveCollabResult<ActiveCollabAttachmentImage>

const holder = vi.hoisted(() => ({
  state: null as unknown,
  getAttachmentImage: vi.fn<(args: { attachmentId: number }) => Promise<ImageResult>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(holder.state)
}))

vi.mock('@/runtime/runtime-activecollab-client', () => ({
  activeCollabStatus: vi.fn(),
  activeCollabConnect: vi.fn(),
  activeCollabDisconnect: vi.fn(),
  activeCollabListAssignedTasks: vi.fn(),
  activeCollabListProjects: vi.fn(),
  activeCollabGetTaskDetail: vi.fn(),
  activeCollabGetAttachmentImage: (args: { attachmentId: number }) =>
    holder.getAttachmentImage(args),
  activeCollabUpdateTask: vi.fn(),
  activeCollabCompleteTask: vi.fn(),
  activeCollabReopenTask: vi.fn(),
  activeCollabPostComment: vi.fn(),
  activeCollabListLabels: vi.fn(),
  activeCollabListUsers: vi.fn(),
  activeCollabListProjectMembers: vi.fn()
}))

import { ActiveCollabAttachmentGrid } from './activecollab-attachment-grid'

const DATA_URL_PREFIX = 'data:image/png;base64,image'

const IMAGES: ActiveCollabAttachment[] = [
  { id: 1, name: 'first.png', mimeType: 'image/png', size: 10, isImage: true },
  { id: 2, name: 'second.png', mimeType: 'image/png', size: 20, isImage: true },
  { id: 3, name: 'third.png', mimeType: 'image/png', size: 30, isImage: true }
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The slice's in-flight map outlives any one store, so isolate it like the DOM container.
  clearActiveCollabAttachmentImageFetches()
  holder.getAttachmentImage.mockReset()
  holder.getAttachmentImage.mockImplementation(async ({ attachmentId }) => ({
    ok: true,
    value: { dataUrl: `${DATA_URL_PREFIX}${attachmentId}`, mimeType: 'image/png' }
  }))
  const store = create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createActiveCollabSlice(...a)
      }) as AppState
  )
  holder.state = store.getState()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

async function mount(attachments: ActiveCollabAttachment[]): Promise<void> {
  await act(async () => {
    root.render(<ActiveCollabAttachmentGrid attachments={attachments} />)
  })
}

function thumbnails(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Open "]'))
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
}

function dialogImageSrc(): string | null {
  return dialog()?.querySelector('img')?.getAttribute('src') ?? null
}

async function openThumbnail(index: number): Promise<HTMLButtonElement> {
  const button = thumbnails()[index]
  // A real pointer focuses the button before activating it; happy-dom's click() does not.
  button.focus()
  await act(async () => {
    button.click()
  })
  return button
}

async function pressKey(key: string): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  // Radix defers focus restore to a macrotask so React can finish unmounting the layer first.
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 0)
  await act(async () => {
    await promise
  })
}

/**
 * happy-dom's WheelEvent drops `ctrlKey` from its init dict, so it is pinned on afterwards.
 * Chromium is what reports a trackpad pinch this way; the flag is the whole gesture signal.
 */
function pinchEvent(deltaY: number): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'ctrlKey', { value: true })
  return event
}

describe('ActiveCollab image lightbox', () => {
  it('opens the clicked image full size, and reads no new bytes to do it', async () => {
    await mount(IMAGES)
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(3)

    await openThumbnail(1)

    expect(dialogImageSrc()).toBe(`${DATA_URL_PREFIX}2`)
    expect(dialog()?.textContent).toContain('second.png')
    // The grid already held these bytes, so the modal must not re-enter the read at all.
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(3)
  })

  it('opens from the keyboard and hands focus back to the same thumbnail on Escape', async () => {
    await mount(IMAGES)

    const button = thumbnails()[0]
    button.focus()
    // Enter on a focused <button> fires a click; asserting that keeps this about real semantics.
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      button.click()
    })
    expect(dialogImageSrc()).toBe(`${DATA_URL_PREFIX}1`)

    await pressKey('Escape')

    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('pages between images with arrow keys and says which one is showing', async () => {
    await mount(IMAGES)
    await openThumbnail(0)
    expect(dialog()?.textContent).toContain('1 of 3')

    await pressKey('ArrowRight')
    expect(dialogImageSrc()).toBe(`${DATA_URL_PREFIX}2`)
    expect(dialog()?.textContent).toContain('2 of 3')

    // Wraps rather than dead-ending, so the pager never strands you on the last image.
    await pressKey('ArrowLeft')
    await pressKey('ArrowLeft')
    expect(dialogImageSrc()).toBe(`${DATA_URL_PREFIX}3`)
    expect(dialog()?.textContent).toContain('3 of 3')
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(3)
  })

  it('pages from the on-screen control without closing', async () => {
    await mount(IMAGES)
    await openThumbnail(0)

    const next = dialog()?.querySelector<HTMLButtonElement>('button[aria-label="Next image"]')
    await act(async () => {
      next?.click()
    })

    expect(dialog()).not.toBeNull()
    expect(dialogImageSrc()).toBe(`${DATA_URL_PREFIX}2`)
  })

  it('hides the pager for a lone image', async () => {
    await mount([IMAGES[0]])
    await openThumbnail(0)

    expect(dialog()?.querySelector('button[aria-label="Next image"]')).toBeNull()
    expect(dialog()?.textContent).not.toContain('1 of 1')
  })

  it('gives a still-loading thumbnail nothing to activate, so no empty modal can open', async () => {
    const pending = Promise.withResolvers<ImageResult>()
    holder.getAttachmentImage.mockReturnValue(pending.promise)

    await mount([IMAGES[0]])

    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(thumbnails()).toHaveLength(0)

    await act(async () => {
      container.querySelector<HTMLElement>('[role="status"]')?.click()
    })
    expect(dialog()).toBeNull()

    // Hand the slot back: the slice's concurrency budget is module-wide, not per test.
    pending.resolve({ ok: true, value: { dataUrl: `${DATA_URL_PREFIX}1`, mimeType: 'image/png' } })
    await act(async () => {})
  })

  it('explains a failed image instead of showing an empty frame', async () => {
    holder.getAttachmentImage.mockImplementation(async ({ attachmentId }) =>
      attachmentId === 2
        ? { ok: false, kind: 'api', error: 'attachment is gone', status: 404 }
        : {
            ok: true,
            value: { dataUrl: `${DATA_URL_PREFIX}${attachmentId}`, mimeType: 'image/png' }
          }
    )

    await mount(IMAGES)
    // The broken one is not activatable from the grid either.
    expect(thumbnails().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open first.png',
      'Open third.png'
    ])

    await openThumbnail(0)
    await pressKey('ArrowRight')

    const alert = dialog()?.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('attachment is gone')
    expect(dialog()?.querySelector('img')).toBeNull()
    expect(dialog()?.textContent).toContain('2 of 3')
  })

  it('zooms the image on a trackpad pinch through a non-passive ctrl-wheel listener', async () => {
    const wheelRegistrations: {
      element: HTMLDivElement
      options: boolean | AddEventListenerOptions | undefined
    }[] = []
    const originalAddEventListener = HTMLDivElement.prototype.addEventListener
    HTMLDivElement.prototype.addEventListener = function (
      this: HTMLDivElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void {
      if (type === 'wheel') {
        wheelRegistrations.push({ element: this, options })
      }
      originalAddEventListener.call(this, type, listener, options)
    }

    try {
      await mount(IMAGES)
      await openThumbnail(0)
    } finally {
      HTMLDivElement.prototype.addEventListener = originalAddEventListener
    }

    const surface = document.querySelector<HTMLDivElement>('[data-slot="image-viewer-surface"]')
    // Scoped to this surface on purpose: the scroll-lock layer also registers a non-passive wheel
    // listener, so an unscoped assertion would pass with the image's own listener missing.
    expect(wheelRegistrations.find((entry) => entry.element === surface)?.options).toEqual({
      passive: false
    })
    expect(dialog()?.textContent).toContain('100%')

    await act(async () => {
      surface?.dispatchEvent(pinchEvent(-120))
    })

    // exp(120/300) = 1.4918, so the pinch reaches the image rather than the app around it.
    expect(dialog()?.textContent).toContain('149%')
  })

  it('starts each newly opened image back at 100%', async () => {
    await mount(IMAGES)
    await openThumbnail(0)

    const surface = document.querySelector<HTMLElement>('[data-slot="image-viewer-surface"]')
    await act(async () => {
      surface?.dispatchEvent(pinchEvent(-120))
    })
    expect(dialog()?.textContent).not.toContain('100%')

    await pressKey('ArrowRight')

    expect(dialog()?.textContent).toContain('100%')
  })
})
