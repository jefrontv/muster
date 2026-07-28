import { describe, expect, it } from 'vitest'

import { sortActiveCollabCommentsNewestFirst } from './activecollab-task-comment-thread'
import type { ActiveCollabComment } from '../../../shared/activecollab-types'

function comment(id: number, createdOn: number | null): ActiveCollabComment {
  return {
    id,
    bodyHtml: `<p>${id}</p>`,
    bodyPlainText: String(id),
    createdOn,
    createdById: null,
    createdByName: null,
    attachments: []
  }
}

describe('sortActiveCollabCommentsNewestFirst', () => {
  it('puts the newest comment first, next to the composer above it', () => {
    const shuffled = [comment(2, 2_000), comment(1, 1_000), comment(3, 3_000)]

    expect(sortActiveCollabCommentsNewestFirst(shuffled).map((c) => c.id)).toEqual([3, 2, 1])
  })

  it('sorts an undated comment first, because it is the local echo of a just-posted reply', () => {
    const withEcho = [comment(1, 1_000), comment(9, null), comment(2, 2_000)]

    expect(sortActiveCollabCommentsNewestFirst(withEcho).map((c) => c.id)).toEqual([9, 2, 1])
  })

  it('is total, not merely stable: equal timestamps resolve by id, newest post first', () => {
    // Two comments posted inside the same second must not swap between renders.
    const sameSecond = [comment(4, 5_000), comment(7, 5_000), comment(6, 5_000)]

    expect(sortActiveCollabCommentsNewestFirst(sameSecond).map((c) => c.id)).toEqual([7, 6, 4])
  })

  it('returns one order regardless of input permutation', () => {
    const rows = [comment(1, 1_000), comment(2, 2_000), comment(3, null), comment(4, 2_000)]
    const expected = sortActiveCollabCommentsNewestFirst(rows).map((c) => c.id)

    expect(sortActiveCollabCommentsNewestFirst(rows.toReversed()).map((c) => c.id)).toEqual(
      expected
    )
    expect(
      sortActiveCollabCommentsNewestFirst([rows[2], rows[0], rows[3], rows[1]]).map((c) => c.id)
    ).toEqual(expected)
  })

  it('does not mutate the caller array', () => {
    const rows = [comment(1, 1_000), comment(3, 3_000)]

    sortActiveCollabCommentsNewestFirst(rows)

    expect(rows.map((c) => c.id)).toEqual([1, 3])
  })
})
