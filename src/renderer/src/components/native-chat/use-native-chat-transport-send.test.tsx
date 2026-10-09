// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatThreadSendOutcome } from '../../../../shared/chat-thread-stream-types'
import { useNativeChatTransportSend } from './use-native-chat-transport-send'

vi.mock('@/lib/native-chat-telemetry', () => ({ emitNativeChatMessageSent: vi.fn() }))

function setup(isWorking: boolean, outcome: ChatThreadSendOutcome) {
  const transportSend = vi.fn(async () => outcome)
  const onOptimisticSend = vi.fn(() => 'pending-1')
  const onOptimisticSendCanceled = vi.fn()
  const { result } = renderHook(() =>
    useNativeChatTransportSend({
      agent: 'claude',
      transportSend,
      isWorking,
      onOptimisticSend,
      onOptimisticSendCanceled,
      setHistory: vi.fn(),
      setDraft: vi.fn(),
      setCaret: vi.fn(),
      clearSkillOrigin: vi.fn(),
      setNotice: vi.fn()
    })
  )
  return { send: result.current, transportSend, onOptimisticSend, onOptimisticSendCanceled }
}

describe('stream transport send', () => {
  it('echoes an idle send as a thread bubble', async () => {
    const t = setup(false, 'sent')
    await act(async () => t.send('hello'))
    expect(t.onOptimisticSend).toHaveBeenCalledTimes(1)
    expect(t.onOptimisticSendCanceled).not.toHaveBeenCalled()
  })

  it('leaves a mid-turn send to the queue strip', async () => {
    const t = setup(true, 'queued')
    await act(async () => t.send('later', undefined, 'auto'))
    expect(t.transportSend).toHaveBeenCalledWith('later', undefined, 'auto')
    expect(t.onOptimisticSend).not.toHaveBeenCalled()
  })

  it('passes steer through', async () => {
    const t = setup(true, 'steered')
    await act(async () => t.send('use tabs', undefined, 'steer'))
    expect(t.transportSend).toHaveBeenCalledWith('use tabs', undefined, 'steer')
    expect(t.onOptimisticSend).not.toHaveBeenCalled()
  })

  it('retracts the bubble when main queued a send the renderer thought was idle', async () => {
    const t = setup(false, 'queued')
    await act(async () => t.send('race'))
    expect(t.onOptimisticSendCanceled).toHaveBeenCalledWith('pending-1')
  })

  it('adds the bubble when main sent a message the renderer thought would queue', async () => {
    const t = setup(true, 'sent')
    await act(async () => t.send('race'))
    expect(t.onOptimisticSend).toHaveBeenCalledWith('race', undefined)
  })
})
