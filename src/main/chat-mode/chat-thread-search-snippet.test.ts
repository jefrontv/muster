import { describe, expect, it } from 'vitest'
import {
  buildSearchSnippet,
  normalizeSearchQuery,
  normalizeSearchText
} from './chat-thread-search-snippet'

describe('normalizeSearchText', () => {
  it('collapses newlines so a match across a line break reads as one line', () => {
    expect(normalizeSearchText('  deploy\n  the\tstaging  site ')).toBe('deploy the staging site')
  })
})

describe('normalizeSearchQuery', () => {
  it('rejects a query too short to be worth reading transcripts for', () => {
    expect(normalizeSearchQuery('a')).toBeNull()
    expect(normalizeSearchQuery('   ')).toBeNull()
  })

  it('lowercases and collapses so matching is case- and whitespace-insensitive', () => {
    expect(normalizeSearchQuery('  Staging   Site ')).toBe('staging site')
  })

  it('clips an over-long paste rather than refusing to search', () => {
    expect(normalizeSearchQuery('x'.repeat(5_000))).toHaveLength(200)
  })
})

describe('buildSearchSnippet', () => {
  it('returns null when the text does not contain the query', () => {
    expect(buildSearchSnippet('nothing relevant here', 'staging')).toBeNull()
  })

  it('returns short text whole, with no ellipses', () => {
    expect(buildSearchSnippet('deploy the staging site', 'staging')).toBe('deploy the staging site')
  })

  it('windows around the match and marks both cut points', () => {
    const text = `${'a '.repeat(200)}needle${' b'.repeat(200)}`
    const snippet = buildSearchSnippet(text, 'needle', 40)
    expect(snippet).toContain('needle')
    expect(snippet?.startsWith('…')).toBe(true)
    expect(snippet?.endsWith('…')).toBe(true)
    expect(snippet?.length).toBeLessThanOrEqual(42)
  })

  it('does not run off the end when the match is near the tail', () => {
    const text = `${'a '.repeat(200)}needle`
    const snippet = buildSearchSnippet(text, 'needle', 40)
    expect(snippet?.endsWith('needle')).toBe(true)
    expect(snippet?.endsWith('…')).toBe(false)
  })

  it('matches case-insensitively but keeps the original casing in the excerpt', () => {
    expect(buildSearchSnippet('Deploy the STAGING site', 'staging')).toBe('Deploy the STAGING site')
  })
})
