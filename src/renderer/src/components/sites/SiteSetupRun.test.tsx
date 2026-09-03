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
  it('renders admin credentials when showAdminCredentials is true and no Open button when onOpenSite is null', async () => {
    await act(async () => {
      root?.render(
        <TooltipProvider>
          <SiteSetupDone
            steps={[
              step({ id: 'clone', state: 'done', detail: 'Cloned into ~/Sites/flex' }),
              step({ id: 'register', state: 'done' }),
              step({ id: 'serve', state: 'done', detail: 'Serving at https://flex.local' }),
              step({ id: 'https', state: 'skipped', detail: 'not supported here' }),
              step({ id: 'import', state: 'not-run' })
            ]}
            siteLabel="flex"
            domain="flex.local"
            showAdminCredentials
            onClose={() => {}}
            onOpenSite={null}
          />
        </TooltipProvider>
      )
    })

    expect(container?.textContent).toContain('hello@efront.com.au')
    expect(container?.textContent).toContain('admin')

    const buttons = Array.from(container?.querySelectorAll('button') ?? [])
    const openButton = buttons.find((button) => button.textContent?.startsWith('Open '))
    expect(openButton).toBeUndefined()
  })
})
