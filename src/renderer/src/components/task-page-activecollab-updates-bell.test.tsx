// @vitest-environment happy-dom
//
// Drives the shipped bell against the REAL ActiveCollab slice with only the runtime client mocked,
// so the degradation latch is proved by the code that ships rather than by a stub standing in for
// it — the same arrangement as task-page-activecollab-task-search-overlay.test.tsx.

import '@testing-library/jest-dom/vitest'

import { useSyncExternalStore } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { create } from 'zustand'

import type { AppState } from '@/store/types'
import { createActiveCollabSlice } from '@/store/slices/activecollab'
import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabObjectUpdate,
  ActiveCollabUpdates
} from '../../../shared/activecollab-types'

type UpdatesResult = ActiveCollabResult<ActiveCollabUpdates>

const holder = vi.hoisted(() => ({
  store: null as {
    getState: () => AppState
    setState: (partial: Partial<AppState>) => void
    subscribe: (cb: () => void) => () => void
  } | null,
  listUpdates: vi.fn<(args?: { page?: number }) => Promise<UpdatesResult>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: AppState) => unknown) =>
    useSyncExternalStore(
      (onStoreChange) => holder.store!.subscribe(onStoreChange),
      () => selector(holder.store!.getState())
    )
}))

vi.mock('@/runtime/runtime-activecollab-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  activeCollabListUpdates: (...args: unknown[]) =>
    holder.listUpdates(args[0] as { page?: number } | undefined)
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { ActiveCollabMyWorkHeader } from './task-page-activecollab-my-work-header'
import { ActiveCollabUpdatesBell } from './task-page-activecollab-updates-bell'

const BELL_NAME = /^My updates/

const API_FAILURE: UpdatesResult = {
  ok: false,
  kind: 'api',
  error: 'Internal Server Error',
  status: 500
}

function updateFixture(
  overrides: Partial<ActiveCollabObjectUpdate> = {}
): ActiveCollabObjectUpdate {
  return {
    taskId: 509_749,
    projectId: 5937,
    projectName: 'Muster UI',
    taskNumber: 12,
    name: 'Ship the codec',
    lastUpdateOn: Date.now() - 29 * 60_000,
    kinds: [{ kind: 'comment', count: 3 }],
    isSubscribed: true,
    ...overrides
  }
}

function page(
  updates: ActiveCollabObjectUpdate[],
  extra: Partial<ActiveCollabUpdates> = {}
): UpdatesResult {
  return { ok: true, value: { updates, totalUnread: updates.length, hasMore: false, ...extra } }
}

type Rendered = { onSelect: Mock<(ref: ActiveCollabTaskRef) => void>; user: UserEvent }

function renderBell(): Rendered {
  const onSelect = vi.fn<(ref: ActiveCollabTaskRef) => void>()
  const user = userEvent.setup()
  render(
    <TooltipProvider>
      <ActiveCollabUpdatesBell onSelect={onSelect} />
    </TooltipProvider>
  )
  return { onSelect, user }
}

async function openBell(): Promise<Rendered> {
  const rendered = renderBell()
  await rendered.user.click(screen.getByRole('button', { name: BELL_NAME }))
  return rendered
}

/** Radix renders the panel as a portalled dialog, so it is never inside the rendered tree. */
function panel(): HTMLElement {
  const content = document.querySelector('[data-slot="popover-content"]')
  if (!(content instanceof HTMLElement)) {
    throw new Error('the My Updates panel is not open')
  }
  return content
}

async function closeBell(user: UserEvent): Promise<void> {
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.querySelector('[data-slot="popover-content"]')).toBeNull())
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  holder.listUpdates.mockReset()
  holder.store = create<AppState>()(
    (...a) => ({ settings: null, ...createActiveCollabSlice(...a) }) as AppState
  )
})

afterEach(cleanup)

describe('ActiveCollabUpdatesBell fetch discipline', () => {
  it('costs nothing until the bell is clicked, then reads page one exactly once', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture()]))
    const { user } = renderBell()

    expect(holder.listUpdates).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: BELL_NAME }))

    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(1))
    expect(holder.listUpdates).toHaveBeenCalledWith({ page: 1 })
  })

  it('re-reads on reopen, because a stale feed is the one thing a bell must not show', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture()]))
    const { user } = await openBell()
    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(1))

    await closeBell(user)
    await user.click(screen.getByRole('button', { name: BELL_NAME }))

    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(2))
  })

  it('spins while the first read is in flight', async () => {
    const { promise, resolve } = Promise.withResolvers<UpdatesResult>()
    holder.listUpdates.mockReturnValue(promise)
    await openBell()

    expect(await screen.findByTestId('activecollab-updates-loading')).toBeInTheDocument()

    resolve(page([]))
    await waitFor(() => expect(screen.queryByTestId('activecollab-updates-loading')).toBeNull())
  })
})

describe('ActiveCollabUpdatesBell unread badge', () => {
  it('stays bare for a count the instance would not compute', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture()], { totalUnread: null }))
    await openBell()

    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('activecollab-updates-badge')).toBeNull()
    // Null is unknown, not none — so the panel must not claim "No new updates" either.
    expect(panel()).not.toHaveTextContent('No new updates')
  })

  it('stays bare at zero and says so in the panel', async () => {
    holder.listUpdates.mockResolvedValue(page([], { totalUnread: 0 }))
    await openBell()

    expect(await screen.findByText('No new updates')).toBeInTheDocument()
    expect(screen.queryByTestId('activecollab-updates-badge')).toBeNull()
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument()
  })

  it('carries a real positive count on the bell and in the panel header', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture()], { totalUnread: 4 }))
    await openBell()

    expect(await screen.findByTestId('activecollab-updates-badge')).toHaveTextContent('4')
    expect(screen.getByRole('button', { name: 'My updates, 4 unread' })).toBeInTheDocument()
  })

  it('caps a large count so it cannot widen the header band', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture()], { totalUnread: 31 }))
    await openBell()

    expect(await screen.findByTestId('activecollab-updates-badge')).toHaveTextContent('9+')
  })
})

describe('ActiveCollabUpdatesBell rows', () => {
  it('reads as name over project, time and what changed, and opens the task it names', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture()]))
    const { onSelect, user } = await openBell()

    const row = await screen.findByRole('button', { name: /Ship the codec/ })
    // Dots separate the visible parts; the accessible name keeps commas, which read as a sentence.
    expect(row).toHaveTextContent('Muster UI·29 minutes ago·3 new comments')
    expect(row.getAttribute('aria-label')).toBe(
      'Ship the codec — Muster UI, 29 minutes ago, 3 new comments'
    )

    await user.click(row)

    expect(onSelect).toHaveBeenCalledWith({ projectId: 5937, taskId: 509_749 })
    await waitFor(() => expect(document.querySelector('[data-slot="popover-content"]')).toBeNull())
  })

  it('drops the separator when the sidecar omitted the project name', async () => {
    holder.listUpdates.mockResolvedValue(page([updateFixture({ projectName: '' })]))
    await openBell()

    const row = await screen.findByRole('button', { name: /Ship the codec/ })
    expect(row).toHaveTextContent('29 minutes ago')
    expect(row.textContent).not.toContain(', 29 minutes ago')
  })

  it('appends the next page in place and retires the footer once nothing is left', async () => {
    holder.listUpdates.mockResolvedValueOnce(
      page([updateFixture()], { hasMore: true, totalUnread: 2 })
    )
    holder.listUpdates.mockResolvedValueOnce(
      page([updateFixture({ taskId: 2, name: 'Second page task' })], {
        hasMore: false,
        totalUnread: 2
      })
    )
    const { user } = await openBell()

    await user.click(await screen.findByRole('button', { name: 'View all my updates' }))

    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(2))
    expect(holder.listUpdates).toHaveBeenLastCalledWith({ page: 2 })
    // Appended, not replaced: the row the user was already looking at stays put.
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Second page task/ })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'View all my updates' })).toBeNull()
    )
  })
})

describe('ActiveCollabUpdatesBell degradation', () => {
  it('latches on an api refusal and then reads nothing on reopen', async () => {
    holder.listUpdates.mockResolvedValue(API_FAILURE)
    const { user } = await openBell()

    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent(/notification stream/)
    expect(holder.store!.getState().activeCollabUpdatesUnsupported).toBe(true)

    await closeBell(user)
    await user.click(screen.getByRole('button', { name: BELL_NAME }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/notification stream/)
    expect(holder.listUpdates).toHaveBeenCalledTimes(1)
  })

  it('lets "Try again" clear the latch and read exactly once', async () => {
    holder.listUpdates.mockResolvedValueOnce(API_FAILURE)
    holder.listUpdates.mockResolvedValueOnce(page([], { totalUnread: 0 }))
    const { user } = await openBell()

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(holder.listUpdates).toHaveBeenCalledTimes(2))
    expect(holder.store!.getState().activeCollabUpdatesUnsupported).toBe(false)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
  })

  it('keeps the shared failure copy for a network failure and does not latch', async () => {
    holder.listUpdates.mockResolvedValue({
      ok: false,
      kind: 'network',
      error: 'ECONNRESET',
      status: null
    })
    await openBell()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach ActiveCollab. Check your internet connection and try again.'
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(holder.store!.getState().activeCollabUpdatesUnsupported).toBe(false)
  })
})

describe('ActiveCollabUpdatesBell in the header band', () => {
  it('joins the control cluster without growing the 41px band', async () => {
    holder.listUpdates.mockResolvedValue(page([]))
    render(
      <TooltipProvider>
        <ActiveCollabMyWorkHeader count={3} onOpenCreate={() => {}} onSelect={() => {}} />
      </TooltipProvider>
    )

    const bell = screen.getByRole('button', { name: BELL_NAME })
    expect(bell.closest('div.h-\\[41px\\]')).not.toBeNull()
    // Nothing was read: the band mounted, nobody clicked.
    expect(holder.listUpdates).not.toHaveBeenCalled()
  })
})

describe('ActiveCollabUpdatesBell row detail', () => {
  it('says what changed, and singles out a mention', async () => {
    holder.listUpdates.mockResolvedValue(
      page([
        updateFixture({ taskId: 1, name: 'Menu colour', kinds: [{ kind: 'mention', count: 1 }] }),
        updateFixture({ taskId: 2, name: 'Title Block', kinds: [{ kind: 'comment', count: 3 }] })
      ])
    )
    await openBell()

    // The whole point of reading `kinds`: before this, both rows said only "something happened".
    const mentioned = await waitFor(() =>
      within(panel()).getByRole('button', { name: /Menu colour/ })
    )
    expect(mentioned.getAttribute('aria-label')).toMatch(/mentioned you/)
    expect(within(mentioned).getByText('mentioned you').className).toContain('text-primary')

    const commented = within(panel()).getByRole('button', { name: /Title Block/ })
    expect(commented.getAttribute('aria-label')).toMatch(/3 new comments/)
    expect(within(commented).queryByText('mentioned you')).toBeNull()
  })

  it('stays silent about an update kind it cannot name', async () => {
    holder.listUpdates.mockResolvedValue(
      page([updateFixture({ name: 'Odd one', kinds: [{ kind: 'other', count: 2 }] })])
    )
    await openBell()

    // `other` is the codec's unknown-key bucket; the row falls back to project and time only.
    const row = await waitFor(() => within(panel()).getByRole('button', { name: /Odd one/ }))
    expect(row.getAttribute('aria-label')).toMatch(/Muster UI/)
    expect(row.getAttribute('aria-label')).not.toMatch(/other/i)
  })
})

describe('ActiveCollabUpdatesBell read and unread', () => {
  /** The per-task model the sidebar badge and the task rows already draw from. */
  function seedUnread(byTask: Record<string, number>): void {
    holder.store!.setState({
      activeCollabUnread: {
        total: Object.values(byTask).reduce((sum, count) => sum + count, 0),
        byTask
      }
    } as Partial<AppState>)
  }

  it('recedes a row the user has already opened and holds the one they have not', async () => {
    seedUnread({ '7': 1 })
    holder.listUpdates.mockResolvedValue(
      page([
        updateFixture({ taskId: 7, name: 'Still waiting' }),
        updateFixture({ taskId: 8, name: 'Already seen' })
      ])
    )
    await openBell()

    const unread = await waitFor(() =>
      within(panel()).getByRole('button', { name: /Still waiting/ })
    )
    const read = within(panel()).getByRole('button', { name: /Already seen/ })
    expect(unread.getAttribute('data-unread')).toBe('true')
    expect(read.getAttribute('data-unread')).toBeNull()
    // The receding treatment is the whole ask: read titles drop to the muted token, unread hold
    // full-strength foreground so the few that still want you are the ones the eye lands on.
    expect(within(unread).getByText('Still waiting').className).toContain('text-foreground')
    expect(within(read).getByText('Already seen').className).toContain('text-muted-foreground')
  })

  it('says "unread" as well as showing it, because colour alone is not a signal', async () => {
    seedUnread({ '7': 1 })
    holder.listUpdates.mockResolvedValue(
      page([updateFixture({ taskId: 7, name: 'Still waiting' })])
    )
    await openBell()

    const row = await waitFor(() => within(panel()).getByRole('button', { name: /Still waiting/ }))
    expect(row.getAttribute('aria-label')).toMatch(/Unread/)
  })

  it("ignores the row's own kinds, which this API leaves empty while work is still unread", async () => {
    // Measured against a live instance: all 29 rows carried `updates: []` while `total_unread`
    // read 1. Deriving the emphasis from `kinds` muted every row and singled out nothing.
    seedUnread({ '7': 1 })
    holder.listUpdates.mockResolvedValue(
      page([
        updateFixture({ taskId: 7, name: 'Empty kinds', kinds: [] }),
        updateFixture({ taskId: 8, name: 'Loud kinds', kinds: [{ kind: 'comment', count: 3 }] })
      ])
    )
    await openBell()

    const quiet = await waitFor(() => within(panel()).getByRole('button', { name: /Empty kinds/ }))
    expect(quiet.getAttribute('data-unread')).toBe('true')
    expect(
      within(panel())
        .getByRole('button', { name: /Loud kinds/ })
        .getAttribute('data-unread')
    ).toBeNull()
  })

  it('treats a missing unread slice as nothing unread rather than taking the panel down', async () => {
    // The store hydrates progressively and several suites mount this band on a partial stand-in.
    holder.listUpdates.mockResolvedValue(page([updateFixture({ taskId: 7, name: 'Lonely' })]))
    await openBell()

    const row = await waitFor(() => within(panel()).getByRole('button', { name: /Lonely/ }))
    expect(row.getAttribute('data-unread')).toBeNull()
  })
})
