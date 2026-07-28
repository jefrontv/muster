// @vitest-environment happy-dom

import { act, cleanup, render, type RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why a constructor spy rather than a render assertion: the shipped defect was a hand-mounted
// `new Terminal()` outside the pane manager, which spawned the PTY and received every byte while
// painting nothing. No amount of "did we write() to it" proves paint, but "we never mount our own
// xterm — we go through TerminalPane, which the app already paints elsewhere" does, and it fails the
// instant someone reintroduces a bare mount here.
const xtermHarness = vi.hoisted(() => ({ constructed: 0 }))
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() {
      xtermHarness.constructed++
    }
  }
}))

const paneHarness = vi.hoisted(() => ({
  props: [] as {
    command: string
    worktreeId?: string
    ariaLabel: string
    description?: string
    onTerminalExit?: () => void
  }[]
}))
vi.mock('@/components/onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: (props: (typeof paneHarness.props)[number]) => {
    paneHarness.props.push(props)
    return <div data-testid="inline-command-terminal" data-worktree-id={props.worktreeId} />
  }
}))

import { ActiveCollabMcpSetupTerminal } from './activecollab-mcp-setup-terminal'

const SETUP_COMMAND = `'/Users/tester/.local/bin/activecollab-mcp' setup; exit`

// Why the xterm counter is never reset: a module-scope `new Terminal()` runs at import time, before
// any beforeEach, so zeroing it here would let exactly that shape slip through.
beforeEach(() => {
  paneHarness.props.length = 0
})

afterEach(() => {
  cleanup()
})

function renderTerminal(
  overrides: { onProcessExit?: () => void; onDismiss?: () => void } = {}
): RenderResult {
  return render(
    <ActiveCollabMcpSetupTerminal
      command={SETUP_COMMAND}
      onProcessExit={overrides.onProcessExit ?? ((): void => {})}
      onDismiss={overrides.onDismiss ?? ((): void => {})}
    />
  )
}

describe('ActiveCollabMcpSetupTerminal', () => {
  it('renders through the app terminal pane instead of mounting its own xterm', () => {
    const view = renderTerminal()

    expect(view.getByTestId('inline-command-terminal')).toBeTruthy()
    // A bare xterm outside the pane manager is exactly the mount that never painted.
    expect(xtermHarness.constructed).toBe(0)
  })

  it('runs the absolute-path setup command in the embedded terminal', () => {
    renderTerminal()

    const props = paneHarness.props.at(-1)
    expect(props?.command).toBe(SETUP_COMMAND)
    expect(props?.command).toContain('/Users/tester/.local/bin/activecollab-mcp')
    expect(props?.command).not.toMatch(/(^|\s)activecollab-mcp setup/)
  })

  it('scopes its ephemeral terminal to its own id so sibling setup panels cannot collide', () => {
    const view = renderTerminal()

    expect(view.getByTestId('inline-command-terminal').dataset.worktreeId).toBe(
      'settings-activecollab-mcp-setup-terminal'
    )
  })

  it('tells the user the terminal is interactive and needs Enter to start', () => {
    renderTerminal()

    const description = paneHarness.props.at(-1)?.description ?? ''
    expect(description).toContain('Enter')
    expect(description).toContain('prompts')
  })

  it('reports the terminal exit so the card can refresh, and switches Cancel to Close', async () => {
    const onProcessExit = vi.fn()
    const view = renderTerminal({ onProcessExit })

    expect(view.getByRole('button').textContent).toBe('Cancel')

    await act(async () => {
      paneHarness.props.at(-1)?.onTerminalExit?.()
    })

    expect(onProcessExit).toHaveBeenCalledOnce()
    expect(view.getByRole('button').textContent).toBe('Close')
  })

  it('dismisses on demand so the backing terminal tab is torn down', async () => {
    const onDismiss = vi.fn()
    const view = renderTerminal({ onDismiss })

    await act(async () => {
      view.getByRole('button').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
