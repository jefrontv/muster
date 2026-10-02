import { describe, expect, it } from 'vitest'
import {
  claudeModelDisplayName,
  claudeModelShortName,
  latestClaudeSightings
} from './claude-model-name'

describe('claudeModelShortName', () => {
  it.each([
    ['claude-opus-5-5', 'Opus 5.5'],
    ['claude-opus-5', 'Opus 5'],
    ['claude-sonnet-5-5', 'Sonnet 5.5'],
    ['claude-sonnet-5', 'Sonnet 5'],
    ['claude-fable-5-1', 'Fable 5.1'],
    ['claude-fable-5', 'Fable 5'],
    ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
    ['claude-opus-4-8', 'Opus 4.8'],
    ['claude-opus-4', 'Opus 4'],
    ['claude-sonnet-4-6', 'Sonnet 4.6'],
    ['claude-sonnet-4-5', 'Sonnet 4.5'],
    ['claude-sonnet-4', 'Sonnet 4'],
    ['claude-3-5-sonnet-20241022', 'Sonnet 3.5'],
    ['claude-opus-5-5[1m]', 'Opus 5.5'],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'Sonnet 4.5'],
    ['claude-opus-4-1@20250805', 'Opus 4.1']
  ])('%s -> %s', (id, name) => {
    expect(claudeModelShortName(id)).toBe(name)
  })

  it('is null for anything that is not a Claude model', () => {
    expect(claudeModelShortName('gpt-5')).toBeNull()
    expect(claudeModelShortName('my-proxy')).toBeNull()
    expect(claudeModelShortName(null)).toBeNull()
  })
})

describe('claudeModelDisplayName', () => {
  it('prefers the model the session reports over the pick', () => {
    expect(claudeModelDisplayName({ picked: 'opus', reported: 'claude-opus-5-5' })).toBe('Opus 5.5')
    expect(claudeModelDisplayName({ picked: null, reported: 'claude-sonnet-5' })).toBe('Sonnet 5')
  })

  it('names an alias from the newest sighting, then the bare family', () => {
    const latestSighting = latestClaudeSightings({
      'claude-opus-4-8': { lastSeenAt: 1 },
      'claude-opus-5-5': { lastSeenAt: 3 },
      'claude-sonnet-5': { lastSeenAt: 2 }
    })
    expect(claudeModelDisplayName({ picked: 'opus', latestSighting })).toBe('Opus 5.5')
    expect(claudeModelDisplayName({ picked: 'haiku', latestSighting })).toBe('Haiku')
  })

  it('shows "Default" with the resolved name when known', () => {
    expect(claudeModelDisplayName({ picked: 'default' })).toBe('Default')
    expect(claudeModelDisplayName({ picked: 'default', reported: 'claude-opus-5-5' })).toBe(
      'Default · Opus 5.5'
    )
  })

  it('marks an explicit 1M pick only when the model is not 1M already', () => {
    expect(
      claudeModelDisplayName({ picked: 'sonnet[1m]', reported: 'claude-sonnet-4-5[1m]' })
    ).toBe('Sonnet 4.5 (1M)')
    expect(claudeModelDisplayName({ picked: 'opus[1m]', reported: 'claude-opus-5-5[1m]' })).toBe(
      'Opus 5.5'
    )
    expect(claudeModelDisplayName({ picked: 'opus', reported: 'claude-sonnet-4-5[1m]' })).toBe(
      'Sonnet 4.5'
    )
  })

  it('never names an unrecognised id in the pill', () => {
    expect(claudeModelDisplayName({ picked: 'my-proxy-model' })).toBeNull()
  })
})
