import { describe, expect, it } from 'vitest'
import { CLAUDE_SESSION_OPTION_CATALOG } from '../../../shared/agent-session-option-catalog-claude-codex'
import { modelSwitchValues } from './chat-thread-session-option-relaunch'

const catalog = CLAUDE_SESSION_OPTION_CATALOG

describe('modelSwitchValues', () => {
  it('keeps the effort saved for the target model', () => {
    expect(
      modelSwitchValues(catalog, 'opus', { model: 'sonnet', effort: 'low' }, { effort: 'max' })
    ).toEqual({ model: 'opus', effort: 'max' })
  })

  it('carries the current effort over when the target has none saved', () => {
    expect(
      modelSwitchValues(catalog, 'opus', { model: 'sonnet', effort: 'medium' }, undefined)
    ).toEqual({ model: 'opus', effort: 'medium' })
  })

  it('drops options the target model lacks, and flip-only toggles', () => {
    expect(
      modelSwitchValues(catalog, 'haiku', { model: 'opus', effort: 'high' }, undefined)
    ).toEqual({ model: 'haiku' })
    expect(
      modelSwitchValues(catalog, 'opus', { model: 'sonnet', fastMode: true }, undefined)
    ).toEqual({ model: 'opus' })
  })
})
