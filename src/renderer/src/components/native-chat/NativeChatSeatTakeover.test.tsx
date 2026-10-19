// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatSeatTakeover } from './NativeChatSeatTakeover'
import { NativeChatSurfaceProvider } from './native-chat-surface-context'
import type { NativeChatComposerApproval } from './NativeChatApprovalPanel'
import type { NativeChatPermissionRequest } from './native-chat-view-types'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const SEAT = {
  surface: 'code' as const,
  cwd: null,
  openFile: null,
  chatThread: true,
  reportedModel: null,
  seat: true
}

function render(
  request: NativeChatPermissionRequest,
  onDiscuss: () => void = () => {}
): {
  respond: ReturnType<typeof vi.fn>
  cancelTurn: ReturnType<typeof vi.fn>
} {
  const respond = vi.fn()
  const cancelTurn = vi.fn()
  const approval: NativeChatComposerApproval = { request, count: 1, respond, cancelTurn }
  act(() => {
    root.render(
      <NativeChatSurfaceProvider value={SEAT}>
        <NativeChatSeatTakeover approval={approval} onDiscuss={onDiscuss} />
      </NativeChatSurfaceProvider>
    )
  })
  return { respond, cancelTurn }
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  )
  if (!button) {
    throw new Error(`button not found: ${text}`)
  }
  return button
}

function click(button: Element): void {
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  })
}

const bash: NativeChatPermissionRequest = {
  requestId: 'req-1',
  toolName: 'Bash',
  input: { command: 'rm -rf build', description: 'Clean the build folder' }
}

describe('NativeChatSeatTakeover approval card', () => {
  it('shows the waiting strip, the headline and the command', () => {
    render(bash)
    const card = container.querySelector('section')!
    expect(card.className).toContain('border-chat-warn')
    expect(container.textContent).toContain('Waiting for approval')
    expect(container.querySelector('pre')?.textContent).toBe('rm -rf build')
    expect(container.querySelector('pre')?.className).toContain('break-all')
  })

  it('focuses its body when nothing else holds focus, so Enter allows', () => {
    const { respond } = render(bash)
    const body = container.querySelector('[role="group"]')!
    expect(document.activeElement).toBe(body)

    press(body, 'Enter')

    expect(respond).toHaveBeenCalledWith('req-1', 'allow')
  })

  it('rejects on Escape', () => {
    const { respond } = render(bash)
    press(container.querySelector('[role="group"]')!, 'Escape')
    expect(respond).toHaveBeenCalledWith('req-1', 'deny')
  })

  it('ignores the keys with a modifier held, while composing, or on repeat', () => {
    const { respond } = render(bash)
    const body = container.querySelector('[role="group"]')!

    press(body, 'Enter', { metaKey: true })
    press(body, 'Enter', { shiftKey: true })
    press(body, 'Escape', { ctrlKey: true })
    press(body, 'Enter', { isComposing: true })
    press(body, 'Enter', { repeat: true })

    expect(respond).not.toHaveBeenCalled()
  })

  it('leaves Enter on a focused button to the button', () => {
    const { respond } = render(bash)
    press(buttonByText('Reject'), 'Enter')
    expect(respond).not.toHaveBeenCalled()
  })

  it('answers once from the buttons', () => {
    const { respond, cancelTurn } = render(bash)

    click(buttonByText('Reject'))
    click(buttonByText('Allow'))

    expect(respond).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith('req-1', 'deny')
    expect(cancelTurn).not.toHaveBeenCalled()
  })

  it('stops the turn from Cancel turn', () => {
    const { cancelTurn } = render(bash)
    click(buttonByText('Cancel turn'))
    expect(cancelTurn).toHaveBeenCalledTimes(1)
  })
})

describe('NativeChatSeatTakeover plan review card', () => {
  const plan: NativeChatPermissionRequest = {
    requestId: 'plan-1',
    toolName: 'ExitPlanMode',
    input: {
      plan: '# Move the header\n\nShift the **logo** left and add a `nav` slot.\n\n## Steps\n1. Edit'
    }
  }

  it('shows the plan title and lead paragraph', () => {
    render(plan)
    expect(container.textContent).toContain('Plan review')
    expect(container.querySelector('h3')?.textContent).toBe('Move the header')
    expect(container.querySelector('p.line-clamp-2')?.textContent).toBe(
      'Shift the logo left and add a nav slot.'
    )
  })

  it('approves the plan', () => {
    const { respond } = render(plan)
    click(buttonByText('Approve'))
    expect(respond).toHaveBeenCalledWith('plan-1', 'allow')
  })

  it('declines with a message and hands focus back for Discuss', () => {
    const onDiscuss = vi.fn()
    const { respond } = render(plan, onDiscuss)

    click(buttonByText('Discuss'))

    expect(onDiscuss).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith('plan-1', 'deny', expect.stringContaining('discuss'))
  })
})
