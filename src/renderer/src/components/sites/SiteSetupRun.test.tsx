// @vitest-environment happy-dom
//
// Covers the Running/Failed row states from the plan: progress bar width, cancel affordances that
// differ per step (clone can cancel, serve cannot), and the failed footer wiring. Done is covered
// separately for the admin-credential disclosure.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SetupRunStep } from './site-setup-choices'
import { SiteSetupRun } from './SiteSetupRun'
import { SiteSetupDone } from './SiteSetupDone'

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
})

function step(overrides: Partial<SetupRunStep> & { id: SetupRunStep['id'] }): SetupRunStep {
  return {
    state: 'pending',
    detail: '',
    log: [],
    percent: null,
    cancellable: false,
    ...overrides
  }
}

async function renderRun(props: {
  steps: SetupRunStep[]
  phase: 'running' | 'failed'
  onCancelCurrent?: () => void
  onRetry?: () => void
  onFinishLater?: () => void
}): Promise<void> {
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <SiteSetupRun
          steps={props.steps}
          phase={props.phase}
          siteLabel="flex"
          onCancelCurrent={props.onCancelCurrent ?? (() => {})}
          onRetry={props.onRetry ?? (() => {})}
          onFinishLater={props.onFinishLater ?? (() => {})}
        />
      </TooltipProvider>
    )
  })
}

describe('SiteSetupRun', () => {
  it('renders a progress bar at the step percent and wires Cancel for a cancellable step', async () => {
    const onCancelCurrent = vi.fn()
    await renderRun({
      phase: 'running',
      onCancelCurrent,
      steps: [
        step({ id: 'clone', state: 'running', percent: 40, cancellable: true }),
        step({ id: 'register', state: 'pending' }),
        step({ id: 'serve', state: 'pending' }),
        step({ id: 'https', state: 'pending' }),
        step({ id: 'import', state: 'pending' })
      ]
    })

    const bar = container?.querySelector('.bg-primary.transition-\\[width\\]') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.style.width).toBe('40%')

    const cancelButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Cancel'
    )
    expect(cancelButton).toBeTruthy()
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onCancelCurrent).toHaveBeenCalledTimes(1)
  })

  it('offers Cancel on the HTTPS row while it is waiting on LocalWP', async () => {
    const onCancelCurrent = vi.fn()
    await renderRun({
      phase: 'running',
      onCancelCurrent,
      steps: [
        step({ id: 'clone', state: 'done', detail: 'Cloned' }),
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'done', detail: 'Serving at https://flex.local' }),
        step({
          id: 'https',
          state: 'running',
          cancellable: true,
          detail: 'Waiting for LocalWP to finish setting up flex.local…'
        }),
        step({ id: 'import', state: 'pending' })
      ]
    })

    expect(container?.textContent).toContain('Waiting for LocalWP to finish setting up flex.local…')
    const cancelButtons = Array.from(container?.querySelectorAll('button') ?? []).filter(
      (button) => button.textContent === 'Cancel'
    )
    expect(cancelButtons).toHaveLength(1)
    await act(async () => {
      cancelButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onCancelCurrent).toHaveBeenCalledTimes(1)
  })

  it('shows "cannot cancel" for a running, non-cancellable step and renders no Cancel button', async () => {
    await renderRun({
      phase: 'running',
      steps: [
        step({ id: 'clone', state: 'done', detail: 'Cloned' }),
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'running', cancellable: false }),
        step({ id: 'https', state: 'pending' }),
        step({ id: 'import', state: 'pending' })
      ]
    })

    expect(container?.textContent).toContain("Can't be cancelled while running")
    const cancelButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Cancel'
    )
    expect(cancelButton).toBeUndefined()
  })

  it('renders the failed step detail, later steps as not-run, and wires both footer buttons', async () => {
    const onRetry = vi.fn()
    const onFinishLater = vi.fn()
    await renderRun({
      phase: 'failed',
      onRetry,
      onFinishLater,
      steps: [
        step({ id: 'clone', state: 'done', detail: 'Cloned' }),
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'failed', detail: 'LocalWP refused the domain' }),
        step({ id: 'https', state: 'not-run' }),
        step({ id: 'import', state: 'not-run' })
      ]
    })

    expect(container?.textContent).toContain('LocalWP refused the domain')

    const buttons = Array.from(container?.querySelectorAll('button') ?? [])
    const retryButton = buttons.find((button) => button.textContent === 'Change and retry')
    const finishLaterButton = buttons.find((button) => button.textContent === 'Finish later')
    expect(retryButton).toBeTruthy()
    expect(finishLaterButton).toBeTruthy()

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onRetry).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishLaterButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onFinishLater).toHaveBeenCalledTimes(1)
  })
})

describe('SiteSetupDone', () => {
  async function renderDone(props: {
    steps: SetupRunStep[]
    createdLocalWp: boolean
    databaseReplaced: boolean
  }): Promise<void> {
    await act(async () => {
      root?.render(
        <TooltipProvider>
          <SiteSetupDone
            steps={props.steps}
            siteLabel="flex"
            domain="flex.local"
            createdLocalWp={props.createdLocalWp}
            databaseReplaced={props.databaseReplaced}
            onClose={() => {}}
            onOpenSite={null}
          />
        </TooltipProvider>
      )
    })
  }

  it('renders admin credentials when the run created a LocalWP install and did not replace its database', async () => {
    await renderDone({
      createdLocalWp: true,
      databaseReplaced: false,
      steps: [
        step({ id: 'clone', state: 'done', detail: 'Cloned into ~/Sites/flex' }),
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'done', detail: 'Serving at https://flex.local' }),
        step({ id: 'https', state: 'skipped', detail: 'not supported here' }),
        step({ id: 'import', state: 'not-run' })
      ]
    })

    expect(container?.textContent).toContain('hello@efront.com.au')
    expect(container?.textContent).toContain('Local-only account created by LocalWP.')

    const buttons = Array.from(container?.querySelectorAll('button') ?? [])
    const openButton = buttons.find((button) => button.textContent?.startsWith('Open '))
    expect(openButton).toBeUndefined()
  })

  // What retires the card is the database being replaced, not the import row completing: a
  // files-only import (database toggle off) runs the same step to `done` and leaves the LocalWP
  // house account in an untouched database, and the card is the only surface naming it. So the
  // import row's state and the database fact vary independently here.
  it.each([
    {
      label: 'import finished with the database replaced',
      importState: 'done',
      replaced: true,
      shown: false
    },
    { label: 'import finished files-only', importState: 'done', replaced: false, shown: true },
    { label: 'import skipped', importState: 'skipped', replaced: false, shown: true },
    { label: 'import never reached', importState: 'not-run', replaced: false, shown: true }
  ])('$label → credentials shown: $shown', async ({ importState, replaced, shown }) => {
    await renderDone({
      createdLocalWp: true,
      databaseReplaced: replaced,
      steps: [
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'done', detail: 'Serving at https://flex.local' }),
        step({ id: 'https', state: 'done' }),
        step({
          id: 'import',
          state: importState as SetupRunStep['state'],
          detail: importState === 'done' ? 'Imported.' : ''
        })
      ]
    })

    const credentialsShown = container?.textContent?.includes('hello@efront.com.au') ?? false
    expect(credentialsShown).toBe(shown)
    expect(container?.textContent).toContain('flex.local')
  })

  // A bare clone has no import row at all (site-setup-runner's stepsFor), so the gate must not
  // depend on one being present.
  it('shows the credentials when the run has no import step at all', async () => {
    await renderDone({
      createdLocalWp: true,
      databaseReplaced: false,
      steps: [
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'done', detail: 'Serving at https://flex.local' }),
        step({ id: 'https', state: 'done' })
      ]
    })

    expect(container?.textContent).toContain('hello@efront.com.au')
  })

  it('never shows the credentials for a site this run did not create', async () => {
    await renderDone({
      createdLocalWp: false,
      databaseReplaced: false,
      steps: [
        step({ id: 'register', state: 'done' }),
        step({ id: 'serve', state: 'done', detail: 'Serving at https://flex.local' }),
        step({ id: 'https', state: 'done' }),
        step({ id: 'import', state: 'not-run' })
      ]
    })

    expect(container?.textContent).not.toContain('hello@efront.com.au')
  })
})
