import { describe, expect, it } from 'vitest'

import {
  activeCollabCommentBodyHtml,
  sortActiveCollabCommentsOldestFirst
} from './activecollab-task-comment-thread'
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

describe('sortActiveCollabCommentsOldestFirst', () => {
  it('reverses the API order so the newest comment lands nearest the composer', () => {
    // The live instance returns newest first — this is the exact shape observed on task 492982.
    const newestFirst = [comment(3, 3_000), comment(2, 2_000), comment(1, 1_000)]

    expect(sortActiveCollabCommentsOldestFirst(newestFirst).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('sorts undated comments last so a local echo does not jump to the top of the thread', () => {
    const withEcho = [comment(9, null), comment(1, 1_000), comment(2, 2_000)]

    expect(sortActiveCollabCommentsOldestFirst(withEcho).map((c) => c.id)).toEqual([1, 2, 9])
  })

  it('is total, not merely stable: equal timestamps resolve by id in post order', () => {
    // Two comments posted inside the same second must not swap between renders.
    const sameSecond = [comment(7, 5_000), comment(4, 5_000), comment(6, 5_000)]

    expect(sortActiveCollabCommentsOldestFirst(sameSecond).map((c) => c.id)).toEqual([4, 6, 7])
  })

  it('returns one order regardless of input permutation', () => {
    const rows = [comment(1, 1_000), comment(2, 2_000), comment(3, null), comment(4, 2_000)]
    const expected = sortActiveCollabCommentsOldestFirst(rows).map((c) => c.id)

    expect(sortActiveCollabCommentsOldestFirst([...rows].reverse()).map((c) => c.id)).toEqual(
      expected
    )
    expect(
      sortActiveCollabCommentsOldestFirst([rows[2], rows[0], rows[3], rows[1]]).map((c) => c.id)
    ).toEqual(expected)
  })

  it('does not mutate the caller array', () => {
    const rows = [comment(3, 3_000), comment(1, 1_000)]

    sortActiveCollabCommentsOldestFirst(rows)

    expect(rows.map((c) => c.id)).toEqual([3, 1])
  })
})

describe('activeCollabCommentBodyHtml', () => {
  it('escapes typed markup so a literal tag cannot become live HTML on the instance', () => {
    expect(activeCollabCommentBodyHtml('<b>bold</b> & "quoted"')).toBe(
      '<p>&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;</p>'
    )
  })

  it('splits blank-line-separated blocks into paragraphs and keeps single breaks', () => {
    expect(activeCollabCommentBodyHtml('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>')
  })
})
