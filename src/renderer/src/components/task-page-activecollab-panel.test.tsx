// @vitest-environment happy-dom

// Covers the connection gate: which of spinner / guided setup / task list the panel picks, and that
// a rejected token does not read like a missing one.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { ActiveCollabFailureKind } from '../../../shared/activecollab-api-types'
import type { ActiveCollabConnectionStatus } from '../../../shared/activecollab-types'
import { TaskPageActiveCollabPanel } from './task-page-activecollab-panel'

type StoreState = {
  activeCollabStatus: ActiveCollabConnectionStatus
  activeCollabStatusChecked: boolean
  activeCollabStatusContextKey: string | null
  activeCollabLastFailureKind: ActiveCollabFailureKind | null
  checkActiveCollabConnection: () => Promise<void>
  settings: { activeRuntimeEnvironmentId: string | null }
  openSettingsPage: () => void
  openSettingsTarget: (target: { pane: string; repoId: string | null }) => void
}

const mocks = vi.hoisted(() => ({ store: { current: null as StoreState | null } }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => {
    if (!mocks.store.current) {
      throw new Error('Store state was not installed')
    }
    return selector(mocks.store.current)
  }
}))

vi.mock('@/components/task-page-activecollab-task-list', () => ({
  ActiveCollabTaskList: () => <div data-testid="task-list" />
}))

vi.mock('@/components/ActiveCollabTaskWorkspace', () => ({
  ActiveCollabTaskWorkspace: () => <div data-testid="task-workspace" />
}))

const SETTINGS = { activeRuntimeEnvironmentId: null }

const NOT_CONFIGURED: ActiveCollabConnectionStatus = {
  configured: false,
  connection: null,
  reason: 'ActiveCollab is not connected. Add your instance URL and sign in to connect.'
}

const CONNECTED: ActiveCollabConnectionStatus = {
  configured: true,
  connection: {
    instanceUrl: 'https://projects.example.com',
    userId: 42,
    userName: 'Ada Lovelace',
    userEmail: 'ada@example.com'
  },
  reason: ''
}

let root: Root | null = null
let container: HTMLDivElement | null = null

function installStore(overrides: Partial<StoreState> = {}): StoreState {
  const state: StoreState = {
    activeCollabStatus: NOT_CONFIGURED,
    activeCollabStatusChecked: true,
    activeCollabStatusContextKey: getProviderRuntimeContextKey(SETTINGS),
    activeCollabLastFailureKind: null,
    checkActiveCollabConnection: vi.fn(async () => {}),
    settings: SETTINGS,
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    ...overrides
  }
  mocks.store.current = state
  return state
}

function renderPanel(onConnect = vi.fn()): { onConnect: typeof onConnect; text: () => string } {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<TaskPageActiveCollabPanel onConnect={onConnect} />)
  })
  return { onConnect, text: () => container?.textContent ?? '' }
}

function buttonWith(label: string): HTMLElement {
  const match = [...(container?.querySelectorAll('button') ?? [])].find((node) =>
    node.textContent?.includes(label)
  )
  if (!(match instanceof HTMLElement)) {
    throw new Error(`No button labelled ${label}`)
  }
  return match
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  mocks.store.current = null
  vi.clearAllMocks()
})

describe('TaskPageActiveCollabPanel connection gate', () => {
  it('shows only a spinner while the status is unknown', () => {
    installStore({ activeCollabStatusChecked: false })
    const { text } = renderPanel()

    expect(container?.querySelector('.animate-spin')).not.toBeNull()
    expect(text()).not.toContain('Connect ActiveCollab')
  })

  it('does not flash setup at a connected user whose status answered for another runtime', () => {
    installStore({ activeCollabStatus: CONNECTED, activeCollabStatusContextKey: 'runtime:other#0' })
    const { text } = renderPanel()

    expect(container?.querySelector('.animate-spin')).not.toBeNull()
    expect(text()).not.toContain('Connect ActiveCollab')
    expect(container?.querySelector('[data-testid="task-list"]')).toBeNull()
  })

  it('renders the guided setup screen when nothing is connected', () => {
    installStore()
    const { text } = renderPanel()
    const copy = text()

    expect(copy).toContain('Connect ActiveCollab to see your work here')
    expect(copy).toContain('What connecting gives you')
    expect(copy).toContain('Every task assigned to you, grouped by project.')
    expect(copy).toContain('Comment threads, with replies posted from here.')
    expect(copy).toContain('Attachments and inline images')
    expect(copy).toContain('Notifications when a task you follow changes.')
    expect(copy).toContain('What it asks you for')
    expect(copy).toContain('instance URL')
    expect(copy).toContain('email and password')
    expect(copy).toContain('The password is never stored')
    expect(copy).toContain(NOT_CONFIGURED.reason)
  })

  it('offers both the connect dialog and the Integrations settings route', () => {
    const state = installStore()
    const { onConnect } = renderPanel()

    act(() => {
      buttonWith('Connect ActiveCollab').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onConnect).toHaveBeenCalledTimes(1)

    act(() => {
      buttonWith('Open Integrations settings').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    expect(state.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'integrations',
      repoId: null
    })
    expect(state.openSettingsPage).toHaveBeenCalledTimes(1)
  })

  it('asks a rejected credential to reconnect, not to connect', () => {
    installStore({ activeCollabStatus: CONNECTED, activeCollabLastFailureKind: 'auth' })
    const { text } = renderPanel()
    const copy = text()

    expect(copy).toContain('Reconnect ActiveCollab to see your work here')
    expect(copy).toContain('the instance refused it')
    expect(copy).not.toContain('Connect ActiveCollab to see your work here')
    expect(buttonWith('Reconnect ActiveCollab')).toBeTruthy()
  })

  it('does not tell a user to reconnect a credential that is gone', () => {
    // A stale auth verdict outliving the credential must not produce "reconnect" instructions for
    // someone who now has nothing stored.
    installStore({ activeCollabLastFailureKind: 'auth' })
    const { text } = renderPanel()

    expect(text()).toContain('Connect ActiveCollab to see your work here')
    expect(text()).not.toContain('Reconnect')
  })

  it('reads differently for a never-connected account than for a rejected token', () => {
    installStore()
    const neverConnected = renderPanel().text()

    act(() => {
      root?.unmount()
    })
    container?.remove()
    installStore({ activeCollabStatus: CONNECTED, activeCollabLastFailureKind: 'auth' })
    const rejected = renderPanel().text()

    expect(neverConnected).not.toBe(rejected)
  })

  it('does not gate a non-auth failure behind the setup screen', () => {
    installStore({ activeCollabStatus: CONNECTED, activeCollabLastFailureKind: 'api' })
    const { text } = renderPanel()

    expect(container?.querySelector('[data-testid="task-list"]')).not.toBeNull()
    expect(text()).not.toContain('to see your work here')
  })

  it('never shows setup to a connected user once the status resolves', () => {
    installStore({ activeCollabStatus: CONNECTED })
    const { text } = renderPanel()

    expect(container?.querySelector('[data-testid="task-list"]')).not.toBeNull()
    expect(container?.querySelector('.animate-spin')).toBeNull()
    expect(text()).not.toContain('to see your work here')
  })
})
