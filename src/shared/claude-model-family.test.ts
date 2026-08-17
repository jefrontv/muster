import { describe, expect, it } from 'vitest'
import { claudeModelFamilyFromId } from './claude-model-family'

describe('claudeModelFamilyFromId', () => {
  it('derives current-generation families', () => {
    expect(claudeModelFamilyFromId('claude-fable-5')).toEqual({ id: 'fable', label: 'Fable' })
    expect(claudeModelFamilyFromId('claude-opus-4-8')).toEqual({ id: 'opus', label: 'Opus' })
    expect(claudeModelFamilyFromId('claude-haiku-4-5-20251001')).toEqual({
      id: 'haiku',
      label: 'Haiku'
    })
  })

  it('derives an unseen future family', () => {
    expect(claudeModelFamilyFromId('claude-muse-6')).toEqual({ id: 'muse', label: 'Muse' })
  })

  it('handles legacy version-first ids', () => {
    expect(claudeModelFamilyFromId('claude-3-5-sonnet-20241022')).toEqual({
      id: 'sonnet',
      label: 'Sonnet'
    })
  })

  it('handles Bedrock-style prefixes', () => {
    expect(claudeModelFamilyFromId('anthropic.claude-sonnet-4-5[1m]')).toEqual({
      id: 'sonnet',
      label: 'Sonnet'
    })
  })

  it('keeps multi-word families', () => {
    expect(claudeModelFamilyFromId('claude-fable-mini-6')).toEqual({
      id: 'fable-mini',
      label: 'Fable Mini'
    })
  })

  it('rejects non-Claude ids', () => {
    expect(claudeModelFamilyFromId('<synthetic>')).toBeNull()
    expect(claudeModelFamilyFromId('deepseek-v4-flash')).toBeNull()
    expect(claudeModelFamilyFromId('')).toBeNull()
    expect(claudeModelFamilyFromId(null)).toBeNull()
    expect(claudeModelFamilyFromId(undefined)).toBeNull()
  })
})
