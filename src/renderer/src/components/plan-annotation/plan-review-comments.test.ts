import { describe, expect, it } from 'vitest'
import { createNote, toAnnotations, type DraftNote } from './plan-annotation-notes'
import {
  isStandaloneKind,
  narrowLinesToQuote,
  planNoteTone,
  toPlanReviewComment
} from './plan-review-comments'

function note(overrides: Partial<DraftNote>): DraftNote {
  return {
    id: '1700000000000-abc123',
    kind: 'comment',
    quote: 'the passage',
    startLine: 3,
    endLine: 5,
    body: 'why this?',
    ...overrides
  }
}

describe('toPlanReviewComment', () => {
  it('maps a passage note onto the line range and quote the review rail reads', () => {
    const comment = toPlanReviewComment(note({ attachments: ['/tmp/a.png'] }), 0)
    expect(comment).toMatchObject({
      id: '1700000000000-abc123',
      selectedText: 'the passage',
      startLine: 3,
      lineNumber: 5,
      body: 'why this?',
      createdAt: 1700000000000,
      planKind: 'comment',
      attachments: ['/tmp/a.png']
    })
  })

  it('anchors whole-plan notes to the first line with no highlight, sorted ahead', () => {
    const passage = toPlanReviewComment(note({ startLine: 1, endLine: 1 }), 0)
    const whole = toPlanReviewComment(
      note({ id: '1800000000000-zzz', kind: 'global', quote: '', startLine: 0, endLine: 0 }),
      1
    )
    expect(whole.selectedText).toBe('')
    expect(whole.lineNumber).toBe(1)
    expect(whole.startLine).toBeUndefined()
    // Created later, but must still stack above a passage note on the same first block.
    expect(whole.createdAt).toBeLessThan(passage.createdAt)
  })

  it('falls back to list order when an id carries no timestamp', () => {
    expect(toPlanReviewComment(note({ id: 'legacy' }), 4).createdAt).toBe(4)
  })
})

describe('note kinds', () => {
  it('paints removals and approvals in their own tone', () => {
    expect(planNoteTone('delete')).toBe('remove')
    expect(planNoteTone('looks_good')).toBe('good')
    expect(planNoteTone('comment')).toBeUndefined()
  })

  it('lets only verbs that speak for themselves save without text', () => {
    expect(isStandaloneKind('delete')).toBe(true)
    expect(isStandaloneKind('looks_good')).toBe(true)
    expect(isStandaloneKind('comment')).toBe(false)
    expect(isStandaloneKind('global')).toBe(false)
  })
})

describe('toAnnotations', () => {
  it('exports in source order with whole-plan notes last and no draft ids', () => {
    const later = createNote({
      kind: 'delete',
      body: '',
      anchor: { quote: 'b', startLine: 9, endLine: 9 }
    })
    const whole = createNote({ kind: 'global', body: 'overall', anchor: null })
    const earlier = createNote({
      kind: 'comment',
      body: 'x',
      anchor: { quote: 'a', startLine: 2, endLine: 4 },
      attachments: ['/tmp/s.png']
    })
    expect(toAnnotations([whole, later, earlier])).toEqual([
      {
        kind: 'comment',
        quote: 'a',
        startLine: 2,
        endLine: 4,
        body: 'x',
        attachments: ['/tmp/s.png']
      },
      { kind: 'delete', quote: 'b', startLine: 9, endLine: 9, body: '' },
      { kind: 'global', quote: '', startLine: 0, endLine: 0, body: 'overall' }
    ])
  })
})

describe('narrowLinesToQuote', () => {
  const markdown = [
    '## Steps',
    '',
    '1. Add a `CacheKey` type.',
    '2. Invalidate on **batch writes** and [syncs](https://x.test).',
    '3. Remove the legacy sweep.'
  ].join('\n')
  const list = { startLine: 3, endLine: 5 }

  it('finds the list item a phrase sits in, through inline markup', () => {
    expect(narrowLinesToQuote(markdown, list, 'batch writes and syncs')).toEqual({
      startLine: 4,
      endLine: 4
    })
  })

  it('spans the lines a multi-line quote starts and ends on', () => {
    expect(narrowLinesToQuote(markdown, list, 'CacheKey type.\nInvalidate on')).toEqual({
      startLine: 3,
      endLine: 4
    })
  })

  it('keeps the block range when the quote cannot be placed', () => {
    expect(narrowLinesToQuote(markdown, list, 'not in the plan')).toEqual(list)
  })
})
