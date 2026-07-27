// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { ActiveCollabResult } from '../../../../shared/activecollab-api-types'
import type {
  ActiveCollabConnection,
  ActiveCollabConnectionStatus
} from '../../../../shared/activecollab-types'
import { ActiveCollabIntegrationCard } from './activecollab-integration-card'

type StoreState = {
  activeCollabStatus: ActiveCollabConnectionStatus
  activeCollabStatusChecked: boolean
  activeCollabStatusContextKey: string | null
  checkActiveCollabConnection: () => Promise<void>
  disconnectActiveCollab: () => Promise<ActiveCollabResult<ActiveCollabConnectionStatus>>
  settings: { activeRuntimeEnvironmentId: string | null }
  openSettingsPage: () => void
  openSettingsTarget: (target: { pane: string; repoId: string | null }) => void
}

const mocks = vi.hoisted(() => ({
  store: { current: null as StoreState | null }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => {
    if (!mocks.store.current) {
      throw new Error('Store state was not installed')
    }
    return selector(mocks.store.current)
  }
}))

vi.mock('@/components/activecollab-connect-dialog', () => ({
  ActiveCollabConnectDialog: ({ onConnected }: { onConnected?: () => void }) => (
    <button type="button" data-testid="simulate-connected" onClick={onConnected}>
      Simulate ActiveCollab connected
    </button>
  )
}))

const CONNECTION: ActiveCollabConnection = {
  instanceUrl: 'https://projects.example.com',
  userId: 42,
  userName: 'Ada Lovelace',
  userEmail: 'ada@example.com'
}

const DISCONNECTED: ActiveCollabConnectionStatus = {
  configured: false,
  connection: null,
  reason: 'No ActiveCollab token is stored on this runtime.'
}

let root: Root | null = null
let container: HTMLDivElement | null = null

function installStore(overrides: Partial<StoreState> = {}): StoreState {
  const settings = overrides.settings ?? { activeRuntimeEnvironmentId: null }
  const state: StoreState = {
    activeCollabStatus: { configured: true, connection: CONNECTION, reason: '' },
    activeCollabStatusChecked: true,
    activeCollabStatusContextKey: getProviderRuntimeContextKey(settings),
    checkActiveCollabConnection: vi.fn(async () => {}),
    disconnectActiveCollab: vi.fn(async () => ({
      ok: true as const,
      value: DISCONNECTED
    })),
    settings,
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    ...overrides
  }
  mocks.store.current = state
  return state
}

async function renderCard(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ActiveCollabIntegrationCard />)
  })
  return container
}

async function click(rendered: HTMLDivElement, matcher: (button: HTMLButtonElement) => boolean) {
  const button = Array.from(rendered.querySelectorAll('button')).find(matcher)
  expect(button).toBeTruthy()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  mocks.store.current = null
})

describe('ActiveCollabIntegrationCard', () => {
  it('shows the single connected account and its instance', async () => {
    installStore()

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Connected')
    expect(rendered.textContent).toContain('Ada Lovelace')
    expect(rendered.textContent).toContain('ada@example.com · https://projects.example.com')
    expect(rendered.textContent).toContain('Account scope')
  })

  it('offers the one-time exchange and the stored reason when nothing is connected', async () => {
    installStore({ activeCollabStatus: DISCONNECTED })

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Not connected')
    expect(rendered.textContent).toContain('No ActiveCollab token is stored on this runtime.')
    expect(rendered.textContent).toContain('Exchange your ActiveCollab URL, email, and password')
    expect(rendered.textContent).toContain('The password is never stored')
    await click(rendered, (button) => button.textContent === 'Connect ActiveCollab')
  })

  it('withholds setup actions until the status matches the active runtime context', async () => {
    installStore({ activeCollabStatusContextKey: 'runtime:stale#0' })

    const rendered = await renderCard()

    const labels = Array.from(rendered.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).not.toContain('Connect ActiveCollab')
    expect(labels).not.toContain('Reconnect')
  })

  it('surfaces a failed disconnect with kind-specific copy', async () => {
    const state = installStore({
      disconnectActiveCollab: vi.fn(async () => ({
        ok: false as const,
        kind: 'api' as const,
        error: 'instance is in maintenance',
        status: 503
      }))
    })

    const rendered = await renderCard()
    await click(
      rendered,
      (button) => button.getAttribute('aria-label') === 'Disconnect ActiveCollab'
    )

    expect(state.disconnectActiveCollab).toHaveBeenCalledTimes(1)
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain(
      'reconnecting will not fix: instance is in maintenance'
    )
  })

  it('re-reads the connection once the dialog reports a successful exchange', async () => {
    const state = installStore({ activeCollabStatus: DISCONNECTED })

    const rendered = await renderCard()
    await click(rendered, (button) => button.dataset.testid === 'simulate-connected')

    expect(state.checkActiveCollabConnection).toHaveBeenCalledTimes(1)
  })
})
