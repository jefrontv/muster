import { describe, expect, it, vi } from 'vitest'
import type { ActiveCollabComment, ActiveCollabTask } from '../../shared/activecollab-types'
import {
  AC_SELF_COMMENT_CHECK_CAP,
  acDropSelfAuthoredComments,
  type AcTaskCommentsFetch
} from './self-comment-filter'
import type { AcTaskChange } from './task-change-detector'

const ME = 7
const SOMEBODY_ELSE = 9

function task(id: number): ActiveCollabTask {
  return {
    id,
    projectId: 1,
    projectName: 'Project',
    taskNumber: id,
    name: `Task ${id}`,
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: ME,
    assigneeName: null,
    createdById: ME,
    createdByName: null
  } as ActiveCollabTask
}

function comment(createdById: number | null, createdOn: number): ActiveCollabComment {
  return {
    id: createdOn,
    bodyHtml: '',
    bodyPlainText: '',
    createdOn,
    createdById,
    createdByName: null,
    attachments: []
  }
}

const commentChange = (id: number, newComments: number): AcTaskChange => ({
  kind: 'comments',
  task: task(id),
  newComments
})

const fetchOf =
  (comments: ActiveCollabComment[]): AcTaskCommentsFetch =>
  () =>
    Promise.resolve({ ok: true, value: comments })

describe('acDropSelfAuthoredComments', () => {
  it('drops a delta made entirely of the user own comments', async () => {
    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 2)],
      selfUserId: ME,
      fetchTaskComments: fetchOf([comment(ME, 300), comment(ME, 200), comment(SOMEBODY_ELSE, 100)])
    })

    expect(kept).toEqual([])
  })

  it('reduces a mixed delta to the comments somebody else wrote', async () => {
    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 3)],
      selfUserId: ME,
      fetchTaskComments: fetchOf([
        comment(ME, 300),
        comment(SOMEBODY_ELSE, 200),
        comment(SOMEBODY_ELSE, 100)
      ])
    })

    expect(kept).toEqual([{ kind: 'comments', task: task(1), newComments: 2 }])
  })

  it('treats an unattributed comment as somebody else', async () => {
    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 1)],
      selfUserId: ME,
      fetchTaskComments: fetchOf([comment(null, 300)])
    })

    expect(kept).toEqual([commentChange(1, 1)])
  })

  it('notifies as before when the comment read fails', async () => {
    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 1)],
      selfUserId: ME,
      fetchTaskComments: () => Promise.resolve({ ok: false, kind: 'network', message: 'offline' })
    })

    expect(kept).toEqual([commentChange(1, 1)])
  })

  it('notifies as before when the read rejects outright', async () => {
    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 1)],
      selfUserId: ME,
      fetchTaskComments: () => Promise.reject(new Error('boom'))
    })

    expect(kept).toEqual([commentChange(1, 1)])
  })

  it('notifies as before when the thread is shorter than the delta', async () => {
    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 3)],
      selfUserId: ME,
      fetchTaskComments: fetchOf([comment(ME, 300)])
    })

    expect(kept).toEqual([commentChange(1, 3)])
  })

  it('leaves every other kind untouched and in order', async () => {
    const assigned: AcTaskChange = { kind: 'assigned', task: task(2) }
    const updated: AcTaskChange = { kind: 'updated', task: task(3) }
    const fetchTaskComments = vi.fn(fetchOf([comment(ME, 300)]))

    const kept = await acDropSelfAuthoredComments({
      changes: [assigned, commentChange(1, 1), updated],
      selfUserId: ME,
      fetchTaskComments
    })

    expect(kept).toEqual([assigned, updated])
    expect(fetchTaskComments).toHaveBeenCalledTimes(1)
  })

  it('checks nothing when the connected identity is unknown', async () => {
    const fetchTaskComments = vi.fn(fetchOf([comment(ME, 300)]))

    const kept = await acDropSelfAuthoredComments({
      changes: [commentChange(1, 1)],
      selfUserId: null,
      fetchTaskComments
    })

    expect(kept).toEqual([commentChange(1, 1)])
    expect(fetchTaskComments).not.toHaveBeenCalled()
  })

  it('skips the check entirely above the cap, rather than firing a request per task', async () => {
    const changes = Array.from({ length: AC_SELF_COMMENT_CHECK_CAP + 1 }, (_unused, index) =>
      commentChange(index + 1, 1)
    )
    const fetchTaskComments = vi.fn(fetchOf([comment(ME, 300)]))

    const kept = await acDropSelfAuthoredComments({
      changes,
      selfUserId: ME,
      fetchTaskComments
    })

    expect(kept).toEqual(changes)
    expect(fetchTaskComments).not.toHaveBeenCalled()
  })
})
