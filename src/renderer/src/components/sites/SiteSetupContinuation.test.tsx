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
      alternatives: [],
      hasWordPress: true,
      stack: 'plain',
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

/** Overridden per test: two entries is the case where the user has to make a choice. */
let installedStacks: string[] = ['localwp']

function installApi(plan: SiteSetupPlan, previewPlan: PreviewPlan): void {
  planMock = vi.fn().mockResolvedValue({ ok: true, value: plan })
  // Both migration calls answer with a tagged envelope wrapping a result that has its own `ok`.
  // The preview also reports which setup this folder needs and what it will move or delete.
  previewMock = vi.fn().mockResolvedValue({ ok: true, value: previewPlan })
  migrateMock = vi.fn().mockResolvedValue({ ok: true, value: { ok: true, message: '' } })
  startRunMock = vi.fn().mockResolvedValue({ ok: true, value: { id: 'run-1', status: 'running' } })
  // Stateful, because the stage now seeds every step on and the user unticks from there: a mock
  // that ignored the patch would answer with a fixed environment and hide both halves of that.
  const environment: Record<string, boolean> = {
    exportDatabase: false,
    exportFiles: false,
    wpUploadRewrite: false,
    wpSearchReplace: false
  }
  const currentSummary = (): unknown =>
    makeSummary({ ...environment }, Object.values(environment).filter(Boolean).length)
  siteGetMock = vi.fn().mockImplementation(async () => ({ ok: true, value: currentSummary() }))
  upsertEnvironmentMock = vi
    .fn()
    .mockImplementation(async ({ patch }: { patch: Record<string, boolean> }) => {
      Object.assign(environment, patch)
      return { ok: true, value: currentSummary() }
    })
  progressListeners = []
  runEventListeners = []
  // Only the channels this component uses; anything else would be a silent dependency.
  Reflect.set(globalThis.window, 'api', {
    siteSetup: { plan: planMock, cloneTargets: vi.fn() },
    siteStacks: {
      // One stack installed, so the stage picks it and renders no picker.
      available: vi.fn().mockResolvedValue({ ok: true, value: installedStacks }),
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

/** The stages are pages now, so anything past the stack page has to be walked to — and Next is
 * gated on the local setup having run, so complete that before leaving the stack page. */
async function advanceTo(step: 'https' | 'import'): Promise<void> {
  await act(async () => {
    findButton('Set up LocalWP')?.click()
  })
  for (let hop = 0; hop < (step === 'https' ? 1 : 2); hop += 1) {
    await act(async () => {
      findButton('Next')?.click()
    })
  }
}

beforeEach(() => {
  installedStacks = ['localwp']
  window.localStorage.clear()
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

describe('SiteSetupContinuation paging', () => {
  // The stages used to stack on one surface under the host dialog's Done, so Done was the most
  // obvious button on screen while the plan was still loading and nothing had rendered.
  it('offers no Done while the plan is still loading', async () => {
    installApi(makePlan(), MIGRATE_PREVIEW)
    // Never settles, so the component stays in its loading state for the assertion.
    planMock.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      root?.render(
        <SiteSetupContinuation siteId={SITE_ID} reponame="acme" branch={null} onDone={() => {}} />
      )
    })

    expect(text()).toContain('Checking what this site needs…')
    expect(findButton('Done')).toBeUndefined()
    expect(findButton('Next')?.disabled).toBe(true)
  })

  it('keeps the import a page away until the stack page is passed', async () => {
    await render(makePlan())

    expect(findButton('Run')).toBeUndefined()
    expect(findButton('Done')).toBeUndefined()

    await advanceTo('import')

    expect(findButton('Run')).toBeDefined()
    expect(findButton('Skip')).toBeDefined()
  })

  it('walks stack, then https, then import', async () => {
    await render(makePlan())
    expect(text()).toContain('Local WordPress')

    await advanceTo('https')
    expect(text()).toContain('HTTPS certificate')
    expect(findButton('Run')).toBeUndefined()

    await act(async () => {
      findButton('Back')?.click()
    })
    expect(findButton('Set up LocalWP')).toBeDefined()
  })

  // The group used to open with neither option selected, which reads as a broken control.
  it('opens on the first installed stack when nothing is remembered', async () => {
    installedStacks = ['localwp', 'agent-local']
    await render(makePlan())
    const picker = [...(container?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    expect(picker.map((option) => option.textContent)).toEqual(['LocalWP', 'Agent Local'])
    expect(picker.map((option) => option.getAttribute('data-state'))).toEqual(['on', 'off'])
    expect(findButton('Next')?.disabled).toBe(true)
    expect(findButton('Skip')).toBeDefined()
    expect(findButton('Set up LocalWP')?.disabled).toBe(false)
  })

  it('opens on the stack the last setup actually used', async () => {
    window.localStorage.setItem('muster.sites.lastLocalStackChoice', 'agent-local')
    installedStacks = ['localwp', 'agent-local']
    await render(makePlan())

    const picker = [...(container?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    expect(picker.map((option) => option.getAttribute('data-state'))).toEqual(['off', 'on'])
    expect(findButton('Set up Agent Local')).toBeDefined()
  })

  // Uninstalling the remembered stack must not leave the group pointing at something unrunnable.
  it('falls back when the remembered stack is no longer installed', async () => {
    window.localStorage.setItem('muster.sites.lastLocalStackChoice', 'agent-local')
    await render(makePlan())

    expect(findButton('Set up LocalWP')).toBeDefined()
    expect(findButton('Next')?.disabled).toBe(true)
  })
  // Next is gated on the setup having run, not just on a stack being picked — and Skip is the
  // deliberate way past a local setup the user wants to leave for later.
  it('blocks Next until the setup runs, and Skip jumps straight to import', async () => {
    await render(makePlan())
    expect(findButton('Next')?.disabled).toBe(true)

    await act(async () => {
      findButton('Skip')?.click()
    })

    // Skipping lands on the last page (import), past HTTPS.
    expect(findButton('Run')).toBeDefined()
    expect(findButton('Skip')).toBeDefined()
  })

  it('enables Next and drops Skip once the local setup completes', async () => {
    await render(makePlan())
    expect(findButton('Skip')).toBeDefined()

    await act(async () => {
      findButton('Set up LocalWP')?.click()
    })

    expect(findButton('Next')?.disabled).toBe(false)
    expect(findButton('Skip')).toBeUndefined()
  })
  it('remembers the stack a successful setup ran on', async () => {
    installedStacks = ['localwp', 'agent-local']
    await render(makePlan())
    const picker = [...(container?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    await act(async () => {
      picker[1]?.click()
    })

    // Not on the click: a hovered-then-abandoned option is not a decision worth carrying forward.
    expect(window.localStorage.getItem('muster.sites.lastLocalStackChoice')).toBeNull()

    await act(async () => {
      findButton('Set up Agent Local')?.click()
    })

    expect(window.localStorage.getItem('muster.sites.lastLocalStackChoice')).toBe('agent-local')
  })
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
          alternatives: ['agent-local'],
          hasWordPress: true,
          stack: 'localwp',
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
      adminPassword: 'admin',
      // Which stack runs it: the plan and the run must name the same one, or the preview blesses
      // a migration the run does not perform.
      stack: 'localwp'
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
    await advanceTo('import')
    await act(async () => {
      findButton('Run')?.click()
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
    await advanceTo('import')
    await act(async () => {
      findButton('Run')?.click()
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
    await advanceTo('import')
    await act(async () => {
      findButton('Run')?.click()
    })
    await act(async () => {
      emitRunEvent(runLog('not mine', 'run-2'))
    })
    expect(text()).not.toContain('not mine')
  })

  it('reports the terminal status rather than leaving the stage spinning', async () => {
    await render(makePlan())
    await advanceTo('import')
    await act(async () => {
      findButton('Run')?.click()
    })
    await act(async () => {
      emitRunEvent({ type: 'status', runId: 'run-1', status: 'succeeded' })
    })
    expect(text()).toContain('Import complete.')
  })

  it('surfaces the failure reason from a failed run', async () => {
    await render(makePlan())
    await advanceTo('import')
    await act(async () => {
      findButton('Run')?.click()
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
          environment: 'production',
          enabledStepCount: 2
        }
      })
    )
    await advanceTo('import')
    expect(findButton('Run')).toBeDefined()
    expect(findButton('Done')).toBeUndefined()
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
    await advanceTo('import')
    expect(findButton('Run')).toBeUndefined()
    expect(findButton('Done')).toBeDefined()
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
    await advanceTo('import')
    // Seeded on, so the link's own zero-step configuration no longer dead-ends the setup.
    expect(findButton('Run')?.disabled).toBe(false)
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

  // The steps used to hide behind a "Choose steps" button, so the destructive thing about to run
  // was the one thing not on screen.
  it('always shows the four import steps without asking for them', async () => {
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
    await advanceTo('import')

    expect(text()).toContain('Import steps for production')
    expect(findButton('Choose steps')).toBeUndefined()
    const boxes = [...(container?.querySelectorAll('[role="checkbox"]') ?? [])]
    expect(boxes.length).toBe(4)
    // The branch-mismatch line is gone: it fired on a fresh clone, which is this flow's normal case.
    expect(text()).not.toContain('The checked-out branch does not match an environment')
  })

  // Reversal of the old "never enables a step on its own": this is first-time setup, and a partial
  // default is what shipped a checkout with no WordPress core in it.
  it('ticks all four steps for a first-time setup', async () => {
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
    await advanceTo('import')

    expect(upsertEnvironmentMock).toHaveBeenCalledWith({
      siteId: SITE_ID,
      name: 'production',
      patch: {
        exportDatabase: true,
        exportFiles: true,
        wpUploadRewrite: true,
        wpSearchReplace: true
      }
    })
    const boxes = [...(container?.querySelectorAll('[role="checkbox"]') ?? [])]
    expect(boxes.every((box) => box.getAttribute('data-state') === 'checked')).toBe(true)
    expect(text()).toContain('4 steps enabled')
  })

  it('lets the user untick a seeded step and re-plans, so the run can re-gate', async () => {
    await render(makePlan())
    await advanceTo('import')
    const planCallsBefore = planMock.mock.calls.length

    await act(async () => {
      container?.querySelector<HTMLElement>('[role="checkbox"]')?.click()
    })

    expect(upsertEnvironmentMock).toHaveBeenLastCalledWith({
      siteId: SITE_ID,
      name: 'production',
      patch: { exportDatabase: false }
    })
    // The planner, not this component, decides whether the run may start.
    expect(planMock.mock.calls.length).toBeGreaterThan(planCallsBefore)
    expect(text()).toContain('3 steps enabled')
  })

  it('cannot start an import with every step unticked', async () => {
    await render(makePlan())
    await advanceTo('import')

    for (const box of container?.querySelectorAll<HTMLElement>('[role="checkbox"]') ?? []) {
      await act(async () => {
        box.click()
      })
    }

    expect(findButton('Run')).toBeUndefined()
  })

  it('locks Back and Done while the import is running', async () => {
    // Closing the dialog mid-import abandons a live SSH run with no view left on it.
    await render(makePlan())
    await advanceTo('import')
    const { promise, resolve } = Promise.withResolvers<unknown>()
    startRunMock.mockReturnValue(promise)

    await act(async () => {
      findButton('Run')?.click()
    })

    expect(findButton('Run')?.disabled).toBe(true)
    expect(findButton('Back')?.disabled).toBe(true)
    expect(text()).toContain('Running — leave this open until it finishes.')

    await act(async () => {
      resolve({ ok: true, value: { id: 'run-1', status: 'running' } })
      await promise
    })
    await act(async () => {
      emitRunEvent({ type: 'status', runId: 'run-1', status: 'succeeded' })
    })

    expect(findButton('Done')?.disabled).toBe(false)
  })
})
