// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children: ReactNode
    variant?: string
    size?: string
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('./NativeChatSessionOptionPickers', () => ({
  NativeChatSessionOptionPickers: () => <div data-testid="session-option-pickers" />
}))

vi.mock('./NativeChatStashMenu', () => ({
  NativeChatStashMenu: () => <div data-testid="stash-menu" />
}))

import { NativeChatComposerActions } from './NativeChatComposerActions'
import {
  NativeChatSurfaceProvider,
  type NativeChatSurfaceContextValue
} from './native-chat-surface-context'
import { CHAT_CONVERSATION_LEAD_CLASS } from './chat-seat-composer-classes'
import type { NativeChatPromptStash } from './use-native-chat-prompt-stash'
import type { NativeChatDictation } from './use-native-chat-dictation'

const dictation = (configured: boolean): NativeChatDictation => ({
  configured,
  isDictating: false,
  isHoldMode: false,
  toggle: vi.fn(),
  holdStart: vi.fn(),
  holdEnd: vi.fn(),
  openSetup: vi.fn()
})

const stubStash: NativeChatPromptStash = {
  entries: [],
  pulse: false,
  refresh: () => undefined,
  restore: () => undefined,
  remove: () => undefined,
  handleKeyDown: () => false,
  hasDraft: false,
  stashCurrent: () => undefined
}

afterEach(() => cleanup())

function renderActions(
  overrides: Partial<React.ComponentProps<typeof NativeChatComposerActions>> = {},
  surface?: Partial<NativeChatSurfaceContextValue>
): void {
  const actions = (
    <NativeChatComposerActions
      attachDisabled={false}
      dictationDisabled={false}
      dictation={dictation(true)}
      sendDisabled={false}
      isWorking={false}
      onAttach={vi.fn()}
      onSend={vi.fn()}
      sessionOptionsSurface={null}
      sessionOptionsSnapshot={[]}
      stash={stubStash}
      contextUsedTokens={null}
      {...overrides}
    />
  )
  render(
    surface ? (
      <NativeChatSurfaceProvider
        value={{
          surface: 'chat',
          cwd: null,
          openFile: null,
          chatThread: true,
          reportedModel: null,
          seat: true,
          ...surface
        }}
      >
        {actions}
      </NativeChatSurfaceProvider>
    ) : (
      actions
    )
  )
}

describe('NativeChatComposerActions', () => {
  it('places the model and effort trigger immediately beside dictation', () => {
    renderActions()
    const pickers = screen.getByTestId('session-option-pickers')
    const mic = screen.getByRole('button', { name: 'Start dictation' })
    expect(pickers.nextElementSibling).toBe(mic)
  })

  it('keeps the mic visible without a speech model', () => {
    renderActions({ dictation: dictation(false) })
    expect(screen.getByRole('button', { name: 'Voice typing' })).not.toBeNull()
  })

  it('shows the context donut only past half the window', () => {
    renderActions({ contextUsedTokens: 40_000, contextMaxTokens: 200_000 })
    expect(screen.queryByRole('img')).toBeNull()
    cleanup()
    renderActions({ contextUsedTokens: 120_000, contextMaxTokens: 200_000 })
    expect(screen.getByRole('img')).not.toBeNull()
  })

  it('lays the seat row out with the lead slot and the voice button', () => {
    renderActions({}, { composerLeadSlot: <span data-testid="lead-slot" /> })
    const lead = screen.getByTestId('stash-menu').parentElement
    expect(lead?.className).toBe(CHAT_CONVERSATION_LEAD_CLASS)
    expect(lead?.contains(screen.getByTestId('lead-slot'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Voice options' })).not.toBeNull()
  })
})
