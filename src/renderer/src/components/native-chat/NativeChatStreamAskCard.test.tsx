// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatPermissionRequest } from './native-chat-view-types'

const { COFFEE_INPUT, storeState } = vi.hoisted(() => {
  const COFFEE_INPUT = {
    questions: [
      {
        question: 'What coffee should I make you?',
        header: 'Coffee',
        options: [
          { label: 'Espresso', description: 'Short and strong' },
          { label: 'Flat white', description: 'Milk, not too much foam' },
          { label: 'Filter', description: 'Just coffee' }
        ]
      }
    ]
  }
  const storeState = {
    agentStatusByPaneKey: {
      'chat:thread-1': {
        interactivePrompt: JSON.stringify(COFFEE_INPUT),
        toolName: 'AskUserQuestion',
        state: 'waiting' as const,
        agentType: 'claude' as const,
        prompt: 'ask',
        updatedAt: Date.now(),
        stateStartedAt: Date.now()
      }
    }
  }
  return { COFFEE_INPUT, storeState }
})

vi.mock('../../store', () => {
  const useAppStore = Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
  return { useAppStore }
})

import { NativeChatStreamAskCard } from './NativeChatStreamAskCard'

const liveRequest: NativeChatPermissionRequest = {
  requestId: 'req-1',
  toolName: 'AskUserQuestion',
  input: COFFEE_INPUT
}

describe('NativeChatStreamAskCard dismiss latch', () => {
  const onRespond = vi.fn()
  const inferQuestionAnswered = vi.fn(() => Promise.resolve(true))

  beforeEach(() => {
    vi.clearAllMocks()
    storeState.agentStatusByPaneKey['chat:thread-1'].interactivePrompt =
      JSON.stringify(COFFEE_INPUT)
    storeState.agentStatusByPaneKey['chat:thread-1'].toolName = 'AskUserQuestion'
    vi.stubGlobal('api', { agentStatus: { inferQuestionAnswered } })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { agentStatus: { inferQuestionAnswered } }
    })
  })

  afterEach(() => {
    cleanup()
  })

  function renderCard(request: NativeChatPermissionRequest | null = liveRequest): void {
    render(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={request}
        onRespond={onRespond}
      />
    )
  }

  it('does not resurrect the same question after submit while the hook still has it', () => {
    const view = render(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={liveRequest}
        onRespond={onRespond}
      />
    )
    expect(screen.getByText('What coffee should I make you?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Flat white/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onRespond).toHaveBeenCalledOnce()
    expect(screen.queryByText('What coffee should I make you?')).not.toBeInTheDocument()

    // Hook + live request still advertise the same AskUserQuestion (the stream
    // linger that used to re-latch `current ?? hook` and pop the card back up).
    view.rerender(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={liveRequest}
        onRespond={onRespond}
      />
    )
    expect(screen.queryByText('What coffee should I make you?')).not.toBeInTheDocument()

    view.rerender(
      <NativeChatStreamAskCard paneKey="chat:thread-1" liveRequest={null} onRespond={onRespond} />
    )
    expect(screen.queryByText('What coffee should I make you?')).not.toBeInTheDocument()
  })

  it('shows a later different question after the previous one was answered', () => {
    const view = render(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={liveRequest}
        onRespond={onRespond}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Espresso/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    const nextInput = {
      questions: [
        {
          question: 'Anything else?',
          options: [{ label: 'No' }, { label: 'Yes' }]
        }
      ]
    }
    storeState.agentStatusByPaneKey['chat:thread-1'].interactivePrompt = JSON.stringify(nextInput)
    view.rerender(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={{ requestId: 'req-2', toolName: 'AskUserQuestion', input: nextInput }}
        onRespond={onRespond}
      />
    )
    expect(screen.getByText('Anything else?')).toBeInTheDocument()
  })

  it('shows the same question again when the CLI re-asks it under a new request id', () => {
    const view = render(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={liveRequest}
        onRespond={onRespond}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Espresso/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.queryByText('What coffee should I make you?')).not.toBeInTheDocument()

    // The answer is delivered as a denial, so the model often retries the very
    // same question. A new request id is a fresh blocking ask, not the linger.
    view.rerender(
      <NativeChatStreamAskCard
        paneKey="chat:thread-1"
        liveRequest={{ requestId: 'req-2', toolName: 'AskUserQuestion', input: COFFEE_INPUT }}
        onRespond={onRespond}
      />
    )
    expect(screen.getByText('What coffee should I make you?')).toBeInTheDocument()
  })

  it('renders from the hook when the live request has already cancelled', () => {
    renderCard(null)
    expect(screen.getByText('What coffee should I make you?')).toBeInTheDocument()
  })
})
