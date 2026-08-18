// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FEATURE_WALL_SETUP_STEPS,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from './feature-wall-setup-progress'
import { FeatureWallSetupChecklist } from './FeatureWallSetupChecklist'

type StoreState = {
  checkActiveCollabConnection: () => Promise<void>
  closeModal: () => void
  openSettingsPage: () => void
  openSettingsTarget: (target: { pane: string; repoId: string | null }) => void
  setSettingsSearchQuery: (query: string) => void
  settings: { activeRuntimeEnvironmentId: string | null }
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

let root: Root | null = null
let container: HTMLDivElement | null = null

function installStore(): StoreState {
  const state: StoreState = {
    checkActiveCollabConnection: vi.fn(async () => {}),
    closeModal: vi.fn(),
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    setSettingsSearchQuery: vi.fn(),
    settings: { activeRuntimeEnvironmentId: null }
  }
  mocks.store.current = state
  return state
}

function makeProgress(): FeatureWallSetupProgress {
  const stepDone = Object.fromEntries(
    FEATURE_WALL_SETUP_STEPS.map((step) => [step.id, false])
  ) as Record<FeatureWallSetupStepId, boolean>
  return {
    ready: true,
    mode: 'code',
    stepDone,
    coreDoneCount: 0,
    coreTotal: FEATURE_WALL_SETUP_STEPS.length
  }
}

async function renderActiveCollabStep(): Promise<void> {
  const activeStep = FEATURE_WALL_SETUP_STEPS.find((step) => step.id === 'task-sources')
  if (!activeStep) {
    throw new Error('task-sources step missing from setup step definitions')
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <FeatureWallSetupChecklist
        activeStep={activeStep}
        progress={makeProgress()}
        onSelectStep={() => {}}
      />
    )
  })
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = null
  container = null
  mocks.store.current = null
})

describe('FeatureWallSetupChecklist ActiveCollab step', () => {
  it('renders the Connect ActiveCollab step and re-checks the connection on entry', async () => {
    const state = installStore()

    await renderActiveCollabStep()

    expect(container?.textContent).toContain('Connect ActiveCollab')
    expect(container?.textContent).toContain('start work from them without leaving Muster')
    expect(state.checkActiveCollabConnection).toHaveBeenCalled()
  })

  it('deep-links to Settings > Integrations from the step action', async () => {
    const state = installStore()

    await renderActiveCollabStep()

    const button = Array.from(container?.querySelectorAll('button') ?? []).find((candidate) =>
      candidate.textContent?.includes('Open Integrations settings')
    )
    expect(button).toBeDefined()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(state.openSettingsTarget).toHaveBeenCalledWith({ pane: 'integrations', repoId: null })
    expect(state.openSettingsPage).toHaveBeenCalled()
    expect(state.closeModal).toHaveBeenCalled()
  })
})
