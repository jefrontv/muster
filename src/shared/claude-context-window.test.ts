import { describe, expect, it } from 'vitest'
import {
  claudeContextWindowForModel,
  DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS
} from './claude-context-window'

describe('claudeContextWindowForModel', () => {
  it('sizes the large-window models at one million', () => {
    for (const model of [
      'claude-fable-5',
      'claude-mythos-5',
      'claude-opus-5',
      'claude-opus-4-8',
      'claude-sonnet-4-5[1m]'
    ]) {
      expect(claudeContextWindowForModel(model)).toBe(1_000_000)
    }
  })

  it('defaults everything else to 200k', () => {
    expect(claudeContextWindowForModel('claude-sonnet-5')).toBe(
      DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS
    )
    expect(claudeContextWindowForModel('claude-haiku-4-5-20251001')).toBe(
      DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS
    )
    expect(claudeContextWindowForModel(null)).toBe(DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS)
    expect(claudeContextWindowForModel(undefined)).toBe(DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS)
    expect(claudeContextWindowForModel('')).toBe(DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS)
  })
})
