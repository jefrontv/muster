import { describe, expect, it } from 'vitest'
import {
  createUrlDraft,
  moveUrlDraft,
  primaryDraftUrl,
  urlsFromDrafts
} from './chat-workspace-url-drafts'

describe('urlsFromDrafts', () => {
  it('keeps order, skips blanks, and dedupes', () => {
    expect(
      urlsFromDrafts([
        createUrlDraft('example.com'),
        createUrlDraft(''),
        createUrlDraft('https://example.com'),
        createUrlDraft('https://staging.example.com')
      ])
    ).toEqual(['https://example.com/', 'https://staging.example.com/'])
  })
})

describe('primaryDraftUrl', () => {
  it('skips empty rows and returns the first valid URL', () => {
    expect(primaryDraftUrl([createUrlDraft(''), createUrlDraft('app.example.com')])).toBe(
      'https://app.example.com/'
    )
    expect(primaryDraftUrl([createUrlDraft('')])).toBeUndefined()
  })
})

describe('moveUrlDraft', () => {
  it('reorders so the dropped row becomes first when placed above it', () => {
    const a = createUrlDraft('a.test')
    const b = createUrlDraft('b.test')
    const c = createUrlDraft('c.test')
    expect(moveUrlDraft([a, b, c], c.key, a.key, false).map((d) => d.key)).toEqual([
      c.key,
      a.key,
      b.key
    ])
  })

  it('places a row after the target', () => {
    const a = createUrlDraft('a.test')
    const b = createUrlDraft('b.test')
    const c = createUrlDraft('c.test')
    expect(moveUrlDraft([a, b, c], a.key, b.key, true).map((d) => d.key)).toEqual([
      b.key,
      a.key,
      c.key
    ])
  })
})
