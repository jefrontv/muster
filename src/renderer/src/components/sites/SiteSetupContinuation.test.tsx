// @vitest-environment happy-dom
//
// These pin the stage gating, which is the whole point of the component: it must never offer an
// action that would fail, and it must always say why a stage is off the table.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import type { SiteRunEvent } from '../../../../shared/site-run-types'
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
let siteGetMock: ReturnType<typeof vi.fn>
let upsertEnvironmentMock: ReturnType<typeof vi.fn>

let progressListeners: ((event: { siteId: string; message: string }) => void)[]
let runEventListeners: ((event: SiteRunEvent) => void)[]

function emitProgress(siteId: string, message: string): void {
  for (const listener of progressListeners) {
    listener({ siteId, message })
  }
}

function emitRunEvent(event: SiteRunEvent): void {
  for (const listener of runEventListeners) {
    listener(event)
  }
}

function runLog(text: string, runId = 'run-1'): SiteRunEvent {
  return { type: 'log', runId, line: { at: 0, level: 'info', text } }
}

function makeSummary(environment: Record<string, boolean>, importSelectedCount: number): unknown {
  return {
    site: { id: SITE_ID, environments: { production: environment } },
    importSelectedCount
  }
}

/** The migration-plan shape the stack stage reads: mode plus what it will move and delete. */
type PreviewPlan = {
  ok: boolean
  blockedReason: string
  mode: 'create' | 'migrate'
  moves: { from: string; to: string }[]
  appPublicEntries: string[]
}

const MIGRATE_PREVIEW: PreviewPlan = {
  ok: true,
  blockedReason: '',
  mode: 'migrate',
  moves: [{ from: '/Sites/acme/wp-config.php', to: '/Sites/acme/app/public/wp-config.php' }],
  appPublicEntries: []
}

function installApi(plan: SiteSetupPlan, previewPlan: PreviewPlan): void {
  planMock = vi.fn().mockResolvedValue({ ok: true, value: plan })
  // Both migration calls answer with a tagged envelope wrapping a result that has its own `ok`.
  // The preview also reports which setup this folder needs and what it will move or delete.
  previewMock = vi.fn().mockResolvedValue({ ok: true, value: previewPlan })
  migrateMock = vi.fn().mockResolvedValue({ ok: true, value: { ok: true, message: '' } })
  startRunMock = vi.fn().mockResolvedValue({ ok: true, value: { id: 'run-1', status: 'running' } })
  siteGetMock = vi.fn().mockResolvedValue({
    ok: true,
    value: makeSummary(
      {
        exportDatabase: false,
        exportFiles: false,
        wpUploadRewrite: false,
        wpSearchReplace: false
      },
      plan.import.enabledStepCount
    )
  })
  upsertEnvironmentMock = vi.fn().mockResolvedValue({
    ok: true,
    value: makeSummary(
      {
        exportDatabase: true,
        exportFiles: false,
        wpUploadRewrite: false,
        wpSearchReplace: false
      },
      1
    )
  })
  progressListeners = []
  runEventListeners = []
  // Only the channels this component uses; anything else would be a silent dependency.
  Reflect.set(globalThis.window, 'api', {
    siteSetup: { plan: planMock, cloneTargets: vi.fn() },
    siteStacks: {
      previewMigration: previewMock,
      runMigration: migrateMock,
      onMigrationProgress: (callback: (event: { siteId: string; message: string }) => void) => {
        progressListeners.push(callback)
        return () => {
          progressListeners = progressListeners.filter((entry) => entry !== callback)
        }
      }
    },
    sites: { get: siteGetMock, upsertEnvironment: upsertEnvironmentMock },
    siteRuns: {
      start: startRunMock,
      onEvent: (callback: (event: SiteRunEvent) => void) => {
        runEventListeners.push(callback)
        return () => {
          runEventListeners = runEventListeners.filter((entry) => entry !== callback)
        }
      }
    }
  })
}

async function render(plan: SiteSetupPlan, previewPlan = MIGRATE_PREVIEW): Promise<void> {
  installApi(plan, previewPlan)
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
    // Regression: the admin account was omitted, so every migration died on
    // "adminEmail must be a non-empty string" before LocalWP was ever contacted. The values are
    // ocsites' own house defaults (tui_deploy:2792, :3035).
    const expected = {
      siteId: SITE_ID,
      domain: 'acme.local',
      adminEmail: 'hello@efront.com.au',
      adminPassword: 'admin'
    }
    expect(previewMock).toHaveBeenCalledWith(expected)
    expect(migrateMock).toHaveBeenCalledWith(expected)
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

  it('does not migrate when the preview is blocked, even though the envelope says ok', async () => {
    // The envelope reports "the call succeeded"; the plan inside reports "the migration cannot
    // run". Reading only the envelope is what turned a blocked migration into a checkmark.
    await render(makePlan())
    previewMock.mockResolvedValue({
      ok: true,
      value: { ok: false, blockedReason: 'The Local app is not running. Open Local and try again.' }
    })
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(migrateMock).not.toHaveBeenCalled()
    expect(text()).toContain('The Local app is not running.')
    expect(text()).not.toContain('LocalWP site ready.')
    expect(findButton('Try again')).toBeDefined()
  })

  it('surfaces the reason when the migration itself fails rather than looking complete', async () => {
    await render(makePlan())
    migrateMock.mockResolvedValue({
      ok: true,
      value: {
        ok: false,
        message: 'Timed out waiting for the LocalWP MySQL socket (3 min). Is the Local app open?'
      }
    })
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(text()).toContain('LocalWP setup did not finish.')
    expect(text()).toContain('Timed out waiting for the LocalWP MySQL socket (3 min).')
    expect(text()).not.toContain('LocalWP site ready.')
  })

  it('reaches a completed stage on success and ends the log at "LocalWP site ready."', async () => {
    await render(makePlan())
    migrateMock.mockImplementation(async () => {
      emitProgress(SITE_ID, 'Creating LocalWP site: acme.local…')
      emitProgress(SITE_ID, 'Socket ready.')
      return { ok: true, value: { ok: true, message: 'Migration complete.' } }
    })
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(text()).toContain('Creating LocalWP site: acme.local…')
    expect(text()).toContain('Socket ready.')
    expect(text()).toContain('LocalWP site ready.')
    // Terminal: no action left to take in this stage, so the dialog's Done is the next step.
    expect(findButton('Set up LocalWP')).toBeUndefined()
    expect(findButton('Try again')).toBeUndefined()
  })

  it('shows the OS-password hint and streamed lines while the migration is still running', async () => {
    // Local raises a system password prompt behind Muster. Without this hint a multi-minute wait
    // reads as "nothing triggered" — the report this stage exists to answer.
    await render(makePlan())
    const { promise, resolve } = Promise.withResolvers<unknown>()
    migrateMock.mockImplementation(() => {
      emitProgress(SITE_ID, 'Waiting for LocalWP to complete setup…')
      return promise
    })
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(text()).toContain('LocalWP may ask for your macOS password — check the Local app.')
    expect(text()).toContain('Waiting for LocalWP to complete setup…')
    await act(async () => {
      resolve({ ok: true, value: { ok: true, message: 'Migration complete.' } })
      await promise
    })
    expect(text()).not.toContain('LocalWP may ask for your macOS password')
  })

  it('ignores progress addressed to another site so two windows cannot cross-wire', async () => {
    await render(makePlan())
    migrateMock.mockImplementation(async () => {
      emitProgress('some-other-site', 'Clearing app/public for a different project…')
      emitProgress(SITE_ID, 'Socket ready.')
      return { ok: true, value: { ok: true, message: 'Migration complete.' } }
    })
    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })
    expect(text()).not.toContain('a different project')
    expect(text()).toContain('Socket ready.')
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

  // Why: this used to say "progress is on the site page", which asked the user to leave the dialog
  // that started a multi-minute SSH run to find out whether it worked.
  it('streams the run log into the dialog instead of sending the user elsewhere', async () => {
    await render(makePlan())
    await act(async () => {
      findButton('Run import now')?.click()
    })
    await act(async () => {
      emitRunEvent(runLog('Pulling database…'))
      emitRunEvent(runLog('Imported 1 table'))
    })
    expect(text()).toContain('Pulling database…')
    expect(text()).toContain('Imported 1 table')
    expect(text()).not.toContain('progress is on the site page')
  })

  it('ignores log lines belonging to another site\u2019s run', async () => {
    await render(makePlan())
    await act(async () => {
      findButton('Run import now')?.click()
    })
    await act(async () => {
      emitRunEvent(runLog('not mine', 'run-2'))
    })
    expect(text()).not.toContain('not mine')
  })

  it('reports the terminal status rather than leaving the stage spinning', async () => {
    await render(makePlan())
    await act(async () => {
      findButton('Run import now')?.click()
    })
    await act(async () => {
      emitRunEvent({ type: 'status', runId: 'run-1', status: 'succeeded' })
    })
    expect(text()).toContain('Import complete.')
  })

  it('surfaces the failure reason from a failed run', async () => {
    await render(makePlan())
    await act(async () => {
      findButton('Run import now')?.click()
    })
    await act(async () => {
      emitRunEvent({
        type: 'status',
        runId: 'run-1',
        status: 'failed',
        error: 'Access denied for user'
      })
    })
    expect(text()).toContain('Import failed.')
    expect(text()).toContain('Access denied for user')
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

  it('offers to create a LocalWP site when the folder has no WordPress yet', async () => {
    // The dead end this replaces: a freshly cloned repo was refused with the migrate path's
    // "wp-config.php not found … Migration requires a WordPress install at the project root".
    await render(makePlan(), {
      ok: true,
      blockedReason: '',
      mode: 'create',
      moves: [
        { from: '/Sites/acme/composer.json', to: '/Sites/acme/app/public/composer.json' },
        { from: '/Sites/acme/.git', to: '/Sites/acme/app/public/.git' }
      ],
      appPublicEntries: []
    })
    expect(findButton('Create LocalWP site')).toBeDefined()
    expect(findButton('Set up LocalWP')).toBeUndefined()
    expect(text()).toContain('No WordPress here yet.')
    // Destructive preview: the move count is on screen before the button is pressed.
    expect(text()).toContain('2 project entries move into app/public')
  })

  it('shows what a forced run would delete before it is started', async () => {
    await render(makePlan(), {
      ok: true,
      blockedReason: '',
      mode: 'create',
      moves: [{ from: '/Sites/acme/composer.json', to: '/Sites/acme/app/public/composer.json' }],
      appPublicEntries: ['leftover.php', 'stale']
    })
    expect(text()).toContain('2 existing entries under app/public are deleted first')
  })

  it('surfaces a create-mode block from the mount preview instead of waiting for the click', async () => {
    await render(makePlan(), {
      ok: false,
      blockedReason: 'The Local app is not running. Open Local and try again.',
      mode: 'create',
      moves: [],
      appPublicEntries: []
    })
    expect(text()).toContain('The Local app is not running.')
  })

  it('offers the import toggles instead of a dead end when no steps are enabled', async () => {
    // "No import steps are enabled for this environment — pick at least one" was an instruction
    // with nowhere to follow it: the toggles live on the site page and this dialog had neither.
    await render(
      makePlan({
        stages: [
          { id: 'target', state: 'done', reason: '' },
          { id: 'bind', state: 'done', reason: '' },
          { id: 'stack', state: 'pending', reason: '' },
          {
            id: 'import',
            state: 'blocked',
            reason:
              'No import steps are enabled for this environment — pick at least one. The checked-out branch does not match an environment — confirm the target before importing.'
          }
        ],
        import: {
          ready: false,
          blockedBy: ['no-steps-selected', 'unmatched-branch'],
          confirmable: false,
          environment: 'production',
          enabledStepCount: 0
        }
      })
    )
    expect(text()).toContain('Import steps for production')
    expect(text()).toContain('Pull/import server DB')
    expect(text()).toContain('Nothing is enabled yet.')
    // The branch mismatch stays visible as a confirm-the-target warning, not a second blocker.
    expect(text()).toContain('The checked-out branch does not match an environment')
    // Nothing may start until a step is picked.
    expect(findButton('Run anyway')?.disabled).toBe(true)
  })

  it('never enables an import step on its own', async () => {
    await render(
      makePlan({
        import: {
          ready: false,
          blockedBy: ['no-steps-selected'],
          confirmable: false,
          environment: 'production',
          enabledStepCount: 0
        }
      })
    )
    expect(upsertEnvironmentMock).not.toHaveBeenCalled()
    const boxes = [...(container?.querySelectorAll('[role="checkbox"]') ?? [])]
    expect(boxes.length).toBe(4)
    expect(boxes.every((box) => box.getAttribute('data-state') === 'unchecked')).toBe(true)
  })

  it('enables the step the user picked and re-plans, so the run can unblock', async () => {
    await render(
      makePlan({
        import: {
          ready: false,
          blockedBy: ['no-steps-selected'],
          confirmable: false,
          environment: 'production',
          enabledStepCount: 0
        }
      })
    )
    const planCallsBefore = planMock.mock.calls.length
    await act(async () => {
      container?.querySelector<HTMLElement>('[role="checkbox"]')?.click()
    })
    expect(upsertEnvironmentMock).toHaveBeenCalledWith({
      siteId: SITE_ID,
      name: 'production',
      patch: { exportDatabase: true }
    })
    // The planner, not this component, decides whether the run may start.
    expect(planMock.mock.calls.length).toBeGreaterThan(planCallsBefore)
    expect(text()).toContain('1 steps enabled')
  })
})
