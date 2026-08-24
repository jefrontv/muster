import { describe, expect, it } from 'vitest'
import { activeCollabUpdateKindLabel } from './activecollab-update-kind-label'

describe('activeCollabUpdateKindLabel', () => {
  it('names a mention without claiming who was mentioned beyond the reader', () => {
    expect(activeCollabUpdateKindLabel('mention', 1)).toBe('mentioned you')
    // The stream reports a count, but "mentioned you twice" is noise: the fact is what matters.
    expect(activeCollabUpdateKindLabel('mention', 3)).toBe('mentioned you')
  })

  it('agrees with its own count on comments', () => {
    expect(activeCollabUpdateKindLabel('comment', 1)).toBe('1 new comment')
    expect(activeCollabUpdateKindLabel('comment', 4)).toBe('4 new comments')
  })

  it('reports a reassignment without inventing a destination', () => {
    // The stream says the assignee moved, never who to, so the phrase must not say "to you".
    expect(activeCollabUpdateKindLabel('reassigned', 1)).toBe('reassigned')
  })

  it('names a newly created task', () => {
    expect(activeCollabUpdateKindLabel('created', 1)).toBe('new task')
  })

  it('says NOTHING for an update key this build does not recognise', () => {
    // `other` is the codec's bucket for an unknown wire key. Inventing a phrase for it would put a
    // description on screen that no part of the system can stand behind.
    expect(activeCollabUpdateKindLabel('other', 2)).toBeNull()
  })
})
