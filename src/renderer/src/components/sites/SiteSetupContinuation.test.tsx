// @vitest-environment happy-dom
//
// These pin the stage gating, which is the whole point of the component: it must never offer an
// action that would fail, and it must always say why a stage is off the table.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import { SiteSetupContinuation } from './SiteSetupContinuation'

const SITE_ID = 'site-1'

function makePlan(overrides: Partial<SiteSetupPlan> = {}): SiteSetupPlan {
  return {
    siteId: SITE_ID,
    stages: [
      { id: 'target', state: 'done', reason: '' },
      { id: 'bind', state: 'done', reason: '' },
      { id: 'stack', state: 'pending', reason: '' },
      { id: 'import', state: 'pending', reason: '' }
    ],
    clone: { connectorConfigured: true, targets: [], error: '' },
    stack: {
      supported: true,
      alreadyLocalWp: false,
      suggestedDomain: 'acme.local',
      reason: ''
    },
    import: {
      ready: true,
      blockedBy: [],
      confirmable: false,
      environment: 'production',
      enabledStepCount: 3
    },
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let planMock: ReturnType<typeof vi.fn>
let previewMock: ReturnType<typeof vi.fn>
let migrateMock: ReturnType<typeof vi.fn>
let startRunMock: ReturnType<typeof vi.fn>

function installApi(plan: SiteSetupPlan): void {
  planMock = vi.fn().mockResolvedValue({ ok: true, value: plan })
  previewMock = vi.fn().mockResolvedValue({ ok: true, value: {} })
  migrateMock = vi.fn().mockResolvedValue({ ok: true, value: {} })
  startRunMock = vi.fn().mockResolvedValue({ ok: true, value: { id: 'run-1' } })
  // Only the channels this component uses; anything else would be a silent dependency.
  Reflect.set(globalThis.window, 'api', {
    siteSetup: { plan: planMock, cloneTargets: vi.fn() },
    siteStacks: { previewMigration: previewMock, runMigration: migrateMock },
    siteRuns: { start: startRunMock }
  })
}

async function render(plan: SiteSetupPlan): Promise<void> {
  installApi(plan)
  await act(async () => {
    root?.render(
      <SiteSetupContinuation siteId={SITE_ID} reponame="acme" branch={null} onDone={() => {}} />
    )
  })
}

function text(): string {
  return container?.textContent ?? ''
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...(container?.querySelectorAll('button') ?? [])].find((button) =>
    (button.textContent ?? '').includes(label)
  )
}

beforeEach(() => {
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
})

describe('SiteSetupContinuation', () => {
  it('offers LocalWP setup with the suggested domain prefilled', async () => {
    await render(makePlan())
    expect(findButton('Set up LocalWP')).toBeDefined()
    const input = container?.querySelector('input')
    expect(input?.value).toBe('acme.local')
  })

  it('reports the reason instead of an action when the stack stage is unavailable', async () => {
    await render(
      makePlan({
        stages: [
          { id: 'target', state: 'done', reason: '' },
          { id: 'bind', state: 'done', reason: '' },
          { id: 'stack', state: 'unavailable', reason: 'This project is already a LocalWP site.' },
          { id: 'import', state: 'pending', reason: '' }
        ],
        stack: {
          supported: true,
          alreadyLocalWp: true,
          suggestedDomain: 'acme.local',
          reason: 'This project is already a LocalWP site.'
        }
      })
    )
    expect(text()).toContain('This project is already a LocalWP site.')
    expect(findButton('Set up LocalWP')).toBeUndefined()
  })

  it('previews before migrating, so an unusable domain fails as a message', async () => {
    await render(makePlan())
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(previewMock).toHaveBeenCalledWith({ siteId: SITE_ID, domain: 'acme.local' })
    expect(migrateMock).toHaveBeenCalledWith({ siteId: SITE_ID, domain: 'acme.local' })
  })

  it('does not migrate when the preview rejects the domain', async () => {
    await render(makePlan())
    previewMock.mockResolvedValue({ ok: false, error: 'Domain already in use' })
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(migrateMock).not.toHaveBeenCalled()
    expect(text()).toContain('Domain already in use')
  })

  it('starts the import against the environment the planner resolved', async () => {
    await render(makePlan())
    await act(async () => {
      findButton('Run import now')?.click()
    })
    expect(startRunMock).toHaveBeenCalledWith({
      siteId: SITE_ID,
      group: 'import',
      environment: 'production'
    })
  })

  it('offers an override when the only block is a branch mismatch', async () => {
    await render(
      makePlan({
        import: {
          ready: false,
          blockedBy: ['unmatched-branch'],
          confirmable: true,
          environment: 'staging',
          enabledStepCount: 2
        }
      })
    )
    expect(findButton('Run anyway')).toBeDefined()
    expect(findButton('Run import now')).toBeUndefined()
  })

  it('refuses the import outright when it is blocked and not confirmable', async () => {
    await render(
      makePlan({
        stages: [
          { id: 'target', state: 'done', reason: '' },
          { id: 'bind', state: 'done', reason: '' },
          { id: 'stack', state: 'pending', reason: '' },
          {
            id: 'import',
            state: 'blocked',
            reason: 'Add the SSH password for this environment before importing.'
          }
        ],
        import: {
          ready: false,
          blockedBy: ['missing-ssh-credentials'],
          confirmable: false,
          environment: 'production',
          enabledStepCount: 3
        }
      })
    )
    expect(findButton('Run import now')).toBeUndefined()
    expect(findButton('Run anyway')).toBeUndefined()
    expect(text()).toContain('Add the SSH password for this environment before importing.')
  })

  it('cannot start an import the link configured no steps for', async () => {
    await render(
      makePlan({
        import: {
          ready: true,
          blockedBy: [],
          confirmable: false,
          environment: 'production',
          enabledStepCount: 0
        }
      })
    )
    expect(findButton('Run import now')?.disabled).toBe(true)
  })
})
