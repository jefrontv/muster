import { describe, expect, it } from 'vitest'
import { chatThreadTurnErrorCopy } from './chat-thread-turn-error-copy'

describe('chatThreadTurnErrorCopy', () => {
  it('maps known CLI result subtypes to plain copy and keeps the code as details', () => {
    expect(chatThreadTurnErrorCopy('error_max_turns')).toEqual({
      summary: 'Claude hit its step limit for this reply.',
      details: 'error_max_turns'
    })
    expect(chatThreadTurnErrorCopy('error_during_execution').summary).toBe(
      'Something went wrong while running.'
    )
  })

  it('never headlines raw CLI text', () => {
    expect(chatThreadTurnErrorCopy('API Error: 529 overloaded')).toEqual({
      summary: "That didn't finish",
      details: 'API Error: 529 overloaded'
    })
  })
})
