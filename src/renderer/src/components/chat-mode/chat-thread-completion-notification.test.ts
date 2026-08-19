import { describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { GlobalSettings } from '../../../../shared/types'
import {
  CHAT_COMPLETION_CONFIRM_MS,
  isChatCompletionStillSettled,
  scheduleChatCompletionNotification,
  shouldNotifyChatTurnComplete
} from './chat-thread-completion-notification'

type Settings = Pick<GlobalSettings, 'notifications'> | null

function settings(overrides: { enabled?: boolean; agentTaskComplete?: boolean } = {}): Settings {
  return {
    notifications: {
      enabled: overrides.enabled ?? true,
      agentTaskComplete: overrides.agentTaskComplete ?? true
    }
  } as unknown as Settings
}

const entry = (state: string): AgentStatusEntry => ({ state }) as unknown as AgentStatusEntry

describe('shouldNotifyChatTurnComplete', () => {
  it('notifies for a background thread that finished cleanly', () => {
    expect(
      shouldNotifyChatTurnComplete({ isError: false, watched: false, settings: settings() })
    ).toBe(true)
  })

  it('stays quiet when the user watched it land', () => {
    expect(
      shouldNotifyChatTurnComplete({ isError: false, watched: true, settings: settings() })
    ).toBe(false)
  })

  it('stays quiet on failure, which already shows its own banner', () => {
    expect(
      shouldNotifyChatTurnComplete({ isError: true, watched: false, settings: settings() })
    ).toBe(false)
  })

  it('respects both notification switches', () => {
    expect(
      shouldNotifyChatTurnComplete({
        isError: false,
        watched: false,
        settings: settings({ enabled: false })
      })
    ).toBe(false)
    expect(
      shouldNotifyChatTurnComplete({
        isError: false,
        watched: false,
        settings: settings({ agentTaskComplete: false })
      })
    ).toBe(false)
  })

  it('treats absent settings as enabled, matching the terminal path', () => {
    expect(shouldNotifyChatTurnComplete({ isError: false, watched: false, settings: null })).toBe(
      true
    )
  })
})

describe('isChatCompletionStillSettled', () => {
  it('is false once the agent is working again', () => {
    expect(isChatCompletionStillSettled(entry('working'))).toBe(false)
  })

  it('is true for a quiet or unknown pane', () => {
    expect(isChatCompletionStillSettled(entry('done'))).toBe(true)
    expect(isChatCompletionStillSettled(undefined)).toBe(true)
  })
})

describe('scheduleChatCompletionNotification', () => {
  function harness(options: { statusAtFire?: string } = {}) {
    const dispatch = vi.fn()
    let fire: (() => void) | null = null
    const cancel = scheduleChatCompletionNotification(
      { threadId: 't1', paneKey: 'chat:t1', title: 'Staging triage' },
      {
        readAgentStatus: () =>
          options.statusAtFire === undefined ? undefined : entry(options.statusAtFire),
        dispatch,
        setTimer: (callback, ms) => {
          expect(ms).toBe(CHAT_COMPLETION_CONFIRM_MS)
          fire = callback
          return 1
        }
      }
    )
    return { dispatch, cancel, fire: () => fire?.() }
  }

  it('dispatches once the turn is confirmed finished', () => {
    const { dispatch, fire } = harness({ statusAtFire: 'done' })
    expect(dispatch).not.toHaveBeenCalled()
    fire()
    expect(dispatch).toHaveBeenCalledWith({
      paneKey: 'chat:t1',
      title: 'Staging triage',
      dedupeKey: 'chat-thread:t1'
    })
  })

  it('withholds the banner when work resumed inside the window', () => {
    // The point of the deferred confirmation: a turn that keeps going after a
    // brief pause never announces itself as finished.
    const { dispatch, fire } = harness({ statusAtFire: 'working' })
    fire()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('can be retracted before it fires', () => {
    const { dispatch, cancel, fire } = harness({ statusAtFire: 'done' })
    cancel()
    fire()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('keys dedupe per thread so two finishing together both surface', () => {
    const dispatch = vi.fn()
    const timers: (() => void)[] = []
    for (const id of ['t1', 't2']) {
      scheduleChatCompletionNotification(
        { threadId: id, paneKey: `chat:${id}`, title: id },
        {
          readAgentStatus: () => undefined,
          dispatch,
          setTimer: (callback) => {
            timers.push(callback)
            return 1
          }
        }
      )
    }
    for (const fire of timers) {
      fire()
    }
    expect(dispatch.mock.calls.map((call) => call[0].dedupeKey)).toEqual([
      'chat-thread:t1',
      'chat-thread:t2'
    ])
  })
})
