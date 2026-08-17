import { describe, expect, it } from 'vitest'
import { mapChatThreadStreamRecord, resultModelWindows } from './chat-thread-stream-decode'

describe('resultModelWindows', () => {
  it('returns every model with a positive window', () => {
    expect(
      resultModelWindows({
        type: 'result',
        modelUsage: {
          'claude-fable-5': { inputTokens: 300, contextWindow: 1_000_000 },
          'claude-haiku-4-5-20251001': { inputTokens: 40, contextWindow: 200_000 },
          '<synthetic>': { inputTokens: 0 }
        }
      })
    ).toEqual([
      { model: 'claude-fable-5', contextWindow: 1_000_000, inputTokens: 300 },
      { model: 'claude-haiku-4-5-20251001', contextWindow: 200_000, inputTokens: 40 }
    ])
  })

  it('accepts snake_case field drift', () => {
    expect(
      resultModelWindows({
        modelUsage: { 'claude-opus-5': { input_tokens: 9, context_window: 1_000_000 } }
      })
    ).toEqual([{ model: 'claude-opus-5', contextWindow: 1_000_000, inputTokens: 9 }])
  })

  it('returns empty without modelUsage', () => {
    expect(resultModelWindows({ type: 'result' })).toEqual([])
  })
})

describe('mapChatThreadStreamRecord result window', () => {
  it('picks the busiest model window for turn-complete', () => {
    const event = mapChatThreadStreamRecord('t1', {
      type: 'result',
      subtype: 'success',
      modelUsage: {
        'claude-haiku-4-5-20251001': { inputTokens: 40, contextWindow: 200_000 },
        'claude-fable-5': { inputTokens: 300, contextWindow: 1_000_000 }
      }
    })
    expect(event).toMatchObject({ kind: 'turn-complete', contextWindow: 1_000_000 })
  })
})
