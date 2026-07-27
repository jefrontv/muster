// @vitest-environment happy-dom
//
// Mounts the grid against the REAL store slice with only the runtime client mocked, so the
// "re-selection does not refetch" claim is proved end to end rather than against a stub action.

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

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

const IMAGE: ActiveCollabAttachment = {
  id: 249086,
  name: 'ticker-size.png',
  mimeType: 'image/png',
  size: 29789,
  isImage: true
}

const FILE: ActiveCollabAttachment = {
  id: 249087,
  name: 'brief.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  isImage: false
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The slice's in-flight map outlives any one store, so isolate it like the DOM container.
  clearActiveCollabAttachmentImageFetches()
  holder.getAttachmentImage.mockReset()
  holder.getAttachmentImage.mockResolvedValue({
    ok: true,
    value: { dataUrl: DATA_URL, mimeType: 'image/png' }
  })
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

function remount(): void {
  act(() => {
    root.unmount()
  })
  container.remove()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
}

describe('ActiveCollabAttachmentGrid', () => {
  it('renders nothing when there is nothing attached', async () => {
    await mount([])

    expect(container.innerHTML).toBe('')
    expect(holder.getAttachmentImage).not.toHaveBeenCalled()
  })

  it('inlines an image from the fetched data URL with the attachment name as alt text', async () => {
    await mount([IMAGE])

    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe(DATA_URL)
    expect(image?.getAttribute('alt')).toBe(IMAGE.name)
  })

  it('keeps every sibling readable while an image is still in flight', async () => {
    let release!: (value: ImageResult) => void
    holder.getAttachmentImage.mockReturnValue(
      new Promise<ImageResult>((settle) => {
        release = settle
      })
    )

    await mount([IMAGE, FILE])

    // A pending transfer shows its own placeholder and blanks nothing around it.
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector('[data-activecollab-attachment-chip]')?.textContent).toContain(
      FILE.name
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()

    // Hand the slot back: the slice's concurrency budget is module-wide, not per test.
    release({ ok: true, value: { dataUrl: DATA_URL, mimeType: 'image/png' } })
    await act(async () => {})
  })

  it('does not refetch when the task is re-selected, because the slice already holds the bytes', async () => {
    await mount([IMAGE])
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(1)

    remount()
    await mount([IMAGE])

    expect(container.querySelector('img')?.getAttribute('src')).toBe(DATA_URL)
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(1)
  })

  it('opens one transfer for a repeated attachment rather than one per thumbnail', async () => {
    await mount([IMAGE, IMAGE])

    expect(container.querySelectorAll('img')).toHaveLength(2)
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(1)
  })

  it('shows the failure copy for one image without touching its siblings', async () => {
    holder.getAttachmentImage.mockImplementation(async ({ attachmentId }) =>
      attachmentId === IMAGE.id
        ? { ok: false, kind: 'api', error: 'attachment is gone', status: 404 }
        : { ok: true, value: { dataUrl: DATA_URL, mimeType: 'image/png' } }
    )

    await mount([IMAGE, { ...IMAGE, id: 999, name: 'other.png' }])

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('attachment is gone')
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('renders a non-image as an inert named chip and never fetches it', async () => {
    await mount([FILE])

    const chip = container.querySelector('[data-activecollab-attachment-chip]')
    expect(chip?.textContent).toContain(FILE.name)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(holder.getAttachmentImage).not.toHaveBeenCalled()
  })
})
