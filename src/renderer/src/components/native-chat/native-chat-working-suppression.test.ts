import { describe, expect, it } from 'vitest'
import {
  shouldClearNativeChatWorkingSuppression,
  shouldShowNativeChatWorking
} from './native-chat-working-suppression'

describe('native chat working suppression', () => {
  it('hides stale working state after a user interrupt', () => {
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: true,
        interrupted: true
      })
    ).toBe(false)
  })

  it('shows working before an interrupt', () => {
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: true,
        interrupted: false
      })
    ).toBe(true)
  })

  it('shows working while an optimistic send awaits its first agent signal', () => {
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: false,
        awaitingSend: true,
        interrupted: false
      })
    ).toBe(true)
  })

  it('stops claiming work while the agent is parked on a permission prompt', () => {
    // A send made while the CLI is blocked queues behind the prompt, so its
    // optimistic echo never clears; the spinner used to run forever and hide
    // the prompt that would release it.
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: false,
        awaitingSend: true,
        awaitingUser: true,
        interrupted: false
      })
    ).toBe(false)
  })

  it('still shows real work even while a prompt is open', () => {
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: true,
        awaitingSend: true,
        awaitingUser: true,
        interrupted: false
      })
    ).toBe(true)
  })

  it('keeps an awaiting send hidden after an interrupt', () => {
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: false,
        awaitingSend: true,
        interrupted: true
      })
    ).toBe(false)
  })

  it('stays idle with no work and no pending send', () => {
    expect(
      shouldShowNativeChatWorking({
        isConversation: true,
        working: false,
        interrupted: false
      })
    ).toBe(false)
  })

  it('clears suppression after reconciled working clears', () => {
    expect(shouldClearNativeChatWorkingSuppression({ working: true })).toBe(false)
    expect(shouldClearNativeChatWorkingSuppression({ working: false })).toBe(true)
  })

  it('clears suppression when a newer working epoch starts while interrupted', () => {
    expect(
      shouldClearNativeChatWorkingSuppression({
        working: true,
        interrupted: true,
        workingEpoch: 20,
        previousWorkingEpoch: 10
      })
    ).toBe(true)
    expect(
      shouldClearNativeChatWorkingSuppression({
        working: true,
        interrupted: true,
        workingEpoch: 10,
        previousWorkingEpoch: 10
      })
    ).toBe(false)
  })
})
