// @vitest-environment happy-dom
//
// Mounts the composer against the REAL store slice with only the runtime client mocked, so the
// "roster is fetched lazily, and once" claim is proved through the cache that actually enforces it
// rather than against a stub action.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

import { createActiveCollabSlice } from '@/store/slices/activecollab'
import { clearActiveCollabInflightReads } from '@/store/slices/activecollab-reads'
import type { AppState } from '@/store/types'
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

type UsersResult = ActiveCollabResult<ActiveCollabUser[]>

const holder = vi.hoisted(() => ({
  state: null as unknown,
  listUsers: vi.fn<() => Promise<UsersResult>>()
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
  activeCollabGetAttachmentImage: vi.fn(),
  activeCollabUpdateTask: vi.fn(),
  activeCollabCompleteTask: vi.fn(),
  activeCollabReopenTask: vi.fn(),
  activeCollabPostComment: vi.fn(),
  activeCollabListLabels: vi.fn(),
  activeCollabListUsers: () => holder.listUsers()
}))

import { ActiveCollabCommentComposer } from './activecollab-comment-composer'

const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace' }
const ALAN: ActiveCollabUser = { id: 88, name: 'Alan Turing' }
const JAKE: ActiveCollabUser = { id: 407, name: 'Jake Varrese' }

/** Jake is the CONNECTED user throughout, so every suggestion list must exclude him. */
const CONNECTION = {
  instanceUrl: 'https://projects.example.com',
  userId: JAKE.id,
  userName: JAKE.name,
  userEmail: 'jake@example.com'
}

let container: HTMLDivElement
let root: Root
let posted: string[]

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The slice's in-flight map outlives any one store, so isolate it like the DOM container.
  clearActiveCollabInflightReads()
  holder.listUsers.mockReset()
  holder.listUsers.mockResolvedValue({ ok: true, value: [ADA, ALAN, JAKE] })
  const store = create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createActiveCollabSlice(...a),
        activeCollabStatus: { configured: true, connection: CONNECTION, reason: '' }
      }) as AppState
  )
  holder.state = store.getState()
  posted = []
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

async function mount(): Promise<void> {
  await act(async () => {
    root.render(
      <ActiveCollabCommentComposer
        disabled={false}
        busy={false}
        onSubmit={(bodyHtml) => posted.push(bodyHtml)}
      />
    )
  })
}

function field(): HTMLTextAreaElement {
  const element = container.querySelector('textarea')
  if (element === null) {
    throw new Error('composer textarea missing')
  }
  return element
}

/** Types a whole draft the way React sees it, caret parked at the end. */
async function type(text: string): Promise<void> {
  const element = field()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      value: string
    ) => void
    setter.call(element, text)
    element.setSelectionRange(text.length, text.length)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function press(key: string): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  await act(async () => {
    field().dispatchEvent(event)
  })
  return event.defaultPrevented
}

function options(): string[] {
  return [...container.querySelectorAll('[role="option"]')].map((node) => node.textContent ?? '')
}

function selectedOption(): string | null {
  return container.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null
}

async function clickOption(index: number): Promise<void> {
  const option = container.querySelectorAll('[role="option"]')[index]
  await act(async () => {
    option.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
  })
}

describe('ActiveCollabCommentComposer roster fetching', () => {
  it('never asks for the roster while the author writes a comment with no @', async () => {
    await mount()
    await type('Shipped the header fix')

    expect(holder.listUsers).not.toHaveBeenCalled()
    expect(options()).toEqual([])
  })

  it('fetches the roster once, however many characters the author types after the @', async () => {
    await mount()
    await type('Ping @')
    await type('Ping @a')
    await type('Ping @al')
    await type('Ping @ala')

    expect(holder.listUsers).toHaveBeenCalledTimes(1)
  })
})

describe('ActiveCollabCommentComposer menu', () => {
  it('opens on a bare @ and lists people, never the connected user', async () => {
    await mount()
    await type('Ping @')

    expect(options()).toEqual(['Ada Lovelace', 'Alan Turing'])
  })

  it('filters by the typed query', async () => {
    await mount()
    await type('Ping @ada')

    expect(options()).toEqual(['Ada Lovelace'])
  })

  it('stays shut when nothing matches, rather than showing an empty box', async () => {
    await mount()
    await type('Ping @zzz')

    expect(options()).toEqual([])
  })

  it('moves the highlight with Down and Up, wrapping at both ends', async () => {
    await mount()
    await type('Ping @')

    expect(selectedOption()).toBe('Ada Lovelace')
    expect(await press('ArrowDown')).toBe(true)
    expect(selectedOption()).toBe('Alan Turing')
    await press('ArrowDown')
    expect(selectedOption()).toBe('Ada Lovelace')
    await press('ArrowUp')
    expect(selectedOption()).toBe('Alan Turing')
  })

  it('accepts the highlighted person on Enter, inserting the name and closing the menu', async () => {
    await mount()
    await type('Ping @a')
    await press('ArrowDown')
    await press('Enter')

    expect(field().value).toBe('Ping @Alan Turing ')
    expect(options()).toEqual([])
  })

  it('accepts on Tab as well', async () => {
    await mount()
    await type('Ping @ada')
    await press('Tab')

    expect(field().value).toBe('Ping @Ada Lovelace ')
  })

  it('accepts on click without stealing focus from the field', async () => {
    await mount()
    await type('Ping @')
    await clickOption(1)

    expect(field().value).toBe('Ping @Alan Turing ')
    expect(document.activeElement).toBe(field())
  })

  it('leaves the caret after the inserted name and the rest of the draft untouched', async () => {
    await mount()
    const element = field()
    // Caret parked immediately after "@ad", with trailing text the pick must not disturb.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
        ?.set as (value: string) => void
      setter.call(element, 'Ping @ad about the header')
      element.setSelectionRange(8, 8)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await press('Enter')

    expect(element.value).toBe('Ping @Ada Lovelace about the header')
    expect(element.selectionStart).toBe(18)
  })

  it('stays dismissed after Escape, so Escape is not undone by the next keystroke', async () => {
    await mount()
    await type('Ping @a')

    expect(await press('Escape')).toBe(true)
    expect(options()).toEqual([])

    // Still the same `@`: the author dismissed this token deliberately and kept typing.
    await type('Ping @al')
    expect(options()).toEqual([])
  })

  it('reopens on a fresh @ typed after a dismissal', async () => {
    await mount()
    await type('Ping @a')
    await press('Escape')

    await type('Ping @a and @al')
    expect(options()).toEqual(['Alan Turing'])
  })

  it('closes when the field loses focus, so the menu cannot sit over the thread below it', async () => {
    await mount()
    field().focus()
    await type('Ping @a')

    expect(options()).not.toEqual([])
    await act(async () => {
      field().blur()
    })

    expect(options()).toEqual([])
  })

  it('does not hijack Enter when no menu is open, so a plain Enter still types a newline', async () => {
    await mount()
    await type('First line')

    expect(await press('Enter')).toBe(false)
    expect(posted).toEqual([])
  })

  it('does not hijack Escape or the arrows when no menu is open', async () => {
    await mount()
    await type('First line')

    expect(await press('Escape')).toBe(false)
    expect(await press('ArrowDown')).toBe(false)
  })
})

describe('ActiveCollabCommentComposer posting', () => {
  it('posts the picked mention as a new_mention span the server recognises', async () => {
    await mount()
    await type('Ping @ada')
    await press('Enter')
    await type(`${field().value}please look`)
    await act(async () => {
      container
        .querySelector('button:not([role="option"])')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(posted).toEqual([
      '<p>Ping <span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span>' +
        ' please look</p>'
    ])
  })

  it('clears the picks with the draft, so the next comment does not inherit them', async () => {
    await mount()
    await type('Ping @ada')
    await press('Enter')
    const post = (): Promise<void> =>
      act(async () => {
        container
          .querySelector('button:not([role="option"])')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    await post()

    expect(field().value).toBe('')

    // A second comment that happens to repeat the name must NOT become a mention.
    await type('Ada Lovelace already reviewed it')
    await post()

    expect(posted[1]).toBe('<p>Ada Lovelace already reviewed it</p>')
  })
})
