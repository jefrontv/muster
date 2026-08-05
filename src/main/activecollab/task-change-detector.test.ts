import { describe, expect, it } from 'vitest'
import type { ActiveCollabTask } from '../../shared/activecollab-types'
import {
  acDiffTaskSnapshot,
  acFoldLocalWrite,
  acTaskSnapshotEntry,
  type AcTaskChange,
  type AcTaskSnapshot
} from './task-change-detector'

const NOW = new Date(2026, 6, 28, 12, 0, 0).getTime()
const EARLIER = new Date(2026, 6, 28, 9, 0, 0).getTime()

/** Local midnight, the anchoring `acEpochToLocalDay` has already applied by the time we see it. */
function localDay(year: number, monthIndex: number, day: number): number {
  return new Date(year, monthIndex, day).getTime()
}

function acTask(overrides: Partial<ActiveCollabTask> & { id: number }): ActiveCollabTask {
  return {
    projectId: 3790,
    projectName: 'Muster',
    taskNumber: 12,
    name: 'Fix the header',
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 407,
    assigneeName: 'Jake Varrese',
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/projects/3790/tasks/${overrides.id}`,
    taskListId: null,
    ...overrides
  }
}

/** The snapshot a previous poll would have written for these tasks. */
function snapshotOf(tasks: ActiveCollabTask[], now = NOW): AcTaskSnapshot {
  return acDiffTaskSnapshot({ previous: null, tasks, now }).snapshot
}

function kinds(changes: AcTaskChange[]): string[] {
  return changes.map((change) => change.kind)
}

describe('first run', () => {
  it('emits nothing and seeds every task, however loud those tasks are', () => {
    const tasks = [
      acTask({ id: 1, commentCount: 9, updatedOn: EARLIER }),
      acTask({ id: 2, dueOn: localDay(2026, 6, 20) })
    ]

    const { changes, snapshot } = acDiffTaskSnapshot({ previous: null, tasks, now: NOW })

    expect(changes).toEqual([])
    expect(snapshot).toEqual({
      '1': { commentCount: 9, notifiedDueBucket: 'none', updatedOn: EARLIER },
      '2': { commentCount: 0, notifiedDueBucket: 'overdue', updatedOn: null }
    })
  })

  it('is distinguished from a snapshot that is merely empty', () => {
    const arrived = acTask({ id: 7 })

    expect(acDiffTaskSnapshot({ previous: {}, tasks: [arrived], now: NOW }).changes).toEqual([
      { kind: 'assigned', task: arrived }
    ])
  })
})

describe('new assignments', () => {
  it('reports a task absent from the snapshot exactly once', () => {
    const known = acTask({ id: 1 })
    const arrived = acTask({ id: 2, name: 'Ship the notifier' })
    const previous = snapshotOf([known])

    const first = acDiffTaskSnapshot({ previous, tasks: [known, arrived], now: NOW })
    expect(first.changes).toEqual([{ kind: 'assigned', task: arrived }])

    const second = acDiffTaskSnapshot({
      previous: first.snapshot,
      tasks: [known, arrived],
      now: NOW
    })
    expect(second.changes).toEqual([])
  })

  it('fires once for a task that arrives already overdue, not twice', () => {
    const arrived = acTask({ id: 5, dueOn: localDay(2026, 6, 1) })

    const { changes, snapshot } = acDiffTaskSnapshot({
      previous: snapshotOf([acTask({ id: 1 })]),
      tasks: [acTask({ id: 1 }), arrived],
      now: NOW
    })

    expect(changes).toEqual([{ kind: 'assigned', task: arrived }])
    // Recording the bucket it arrived in is what keeps the second event from ever existing: the
    // assignment already said "overdue", so the poll after it has nothing left to add.
    expect(snapshot['5']?.notifiedDueBucket).toBe('overdue')
    expect(
      acDiffTaskSnapshot({ previous: snapshot, tasks: [acTask({ id: 1 }), arrived], now: NOW })
        .changes
    ).toEqual([])
  })
})

describe('comments', () => {
  it('reports the delta, not the total', () => {
    const previous = snapshotOf([acTask({ id: 1, commentCount: 2 })])
    const task = acTask({ id: 1, commentCount: 5 })

    expect(acDiffTaskSnapshot({ previous, tasks: [task], now: NOW }).changes).toEqual([
      { kind: 'comments', task, newComments: 3 }
    ])
  })

  it('says nothing when the count is unchanged or has gone backwards', () => {
    const previous = snapshotOf([acTask({ id: 1, commentCount: 4 })])

    expect(
      acDiffTaskSnapshot({ previous, tasks: [acTask({ id: 1, commentCount: 4 })], now: NOW })
        .changes
    ).toEqual([])
    // A deleted comment is not an event, and must not underflow into one either.
    expect(
      acDiffTaskSnapshot({ previous, tasks: [acTask({ id: 1, commentCount: 3 })], now: NOW })
        .changes
    ).toEqual([])
  })
})

describe('edits', () => {
  it('suppresses the generic edit when a comment already explains the bump', () => {
    const previous = snapshotOf([acTask({ id: 1, commentCount: 1, updatedOn: EARLIER })])

    const { changes } = acDiffTaskSnapshot({
      previous,
      tasks: [acTask({ id: 1, commentCount: 2, updatedOn: NOW })],
      now: NOW
    })

    expect(kinds(changes)).toEqual(['comments'])
  })

  it('reports the edit when updatedOn moves with no comment behind it', () => {
    const previous = snapshotOf([acTask({ id: 1, commentCount: 1, updatedOn: EARLIER })])
    const task = acTask({ id: 1, commentCount: 1, updatedOn: NOW })

    expect(acDiffTaskSnapshot({ previous, tasks: [task], now: NOW }).changes).toEqual([
      { kind: 'updated', task }
    ])
  })

  it('stays quiet while updatedOn is unknown, then re-arms on the value it learns', () => {
    // null is what a local write leaves behind: the server moved updated_on somewhere we cannot see.
    const previous: AcTaskSnapshot = {
      '1': { commentCount: 1, notifiedDueBucket: 'none', updatedOn: null }
    }

    const first = acDiffTaskSnapshot({
      previous,
      tasks: [acTask({ id: 1, commentCount: 1, updatedOn: EARLIER })],
      now: NOW
    })
    expect(first.changes).toEqual([])
    expect(first.snapshot['1']?.updatedOn).toBe(EARLIER)

    const second = acDiffTaskSnapshot({
      previous: first.snapshot,
      tasks: [acTask({ id: 1, commentCount: 1, updatedOn: NOW })],
      now: NOW
    })
    expect(kinds(second.changes)).toEqual(['updated'])
  })

  it('keeps the known timestamp when a row arrives without one', () => {
    const previous = snapshotOf([acTask({ id: 1, updatedOn: EARLIER })])

    const { snapshot } = acDiffTaskSnapshot({
      previous,
      tasks: [acTask({ id: 1, updatedOn: null })],
      now: NOW
    })

    expect(snapshot['1']?.updatedOn).toBe(EARLIER)
  })
})

describe('due state', () => {
  it('escalates once per bucket', () => {
    const previous = snapshotOf([acTask({ id: 1, dueOn: localDay(2026, 7, 20) })])
    const tomorrow = acTask({ id: 1, dueOn: localDay(2026, 6, 29) })

    const first = acDiffTaskSnapshot({ previous, tasks: [tomorrow], now: NOW })
    expect(first.changes).toEqual([{ kind: 'due', task: tomorrow, bucket: 'tomorrow' }])

    // Same date, next poll: the bucket has not moved, so neither has the news.
    expect(
      acDiffTaskSnapshot({ previous: first.snapshot, tasks: [tomorrow], now: NOW }).changes
    ).toEqual([])

    // A day later the very same date is today, which is a new bucket and a new event.
    const nextDay = new Date(2026, 6, 29, 12).getTime()
    expect(
      kinds(
        acDiffTaskSnapshot({ previous: first.snapshot, tasks: [tomorrow], now: nextDay }).changes
      )
    ).toEqual(['due'])
  })

  it('says nothing for a date that is real but distant, and records nothing as announced', () => {
    const previous = snapshotOf([acTask({ id: 1 })])
    const distant = acTask({ id: 1, dueOn: localDay(2026, 7, 3) })

    const { changes, snapshot } = acDiffTaskSnapshot({ previous, tasks: [distant], now: NOW })

    expect(changes).toEqual([])
    // A bucket below the floor was never announced, so it is not recorded as announced — which is
    // what leaves the escalation to `tomorrow` still to come.
    expect(snapshot['1']?.notifiedDueBucket).toBe('none')
    expect(
      kinds(
        acDiffTaskSnapshot({
          previous: snapshot,
          tasks: [acTask({ id: 1, dueOn: localDay(2026, 6, 29) })],
          now: NOW
        }).changes
      )
    ).toEqual(['due'])
  })

  it('re-arms when the date is pushed out, so a later re-approach fires again', () => {
    const previous = snapshotOf([acTask({ id: 1, dueOn: localDay(2026, 6, 28) })])
    expect(previous['1']?.notifiedDueBucket).toBe('today')

    const pushedOut = acDiffTaskSnapshot({
      previous,
      tasks: [acTask({ id: 1, dueOn: localDay(2026, 7, 6) })],
      now: NOW
    })
    expect(pushedOut.changes).toEqual([])
    expect(pushedOut.snapshot['1']?.notifiedDueBucket).toBe('later')

    const pulledBack = acDiffTaskSnapshot({
      previous: pushedOut.snapshot,
      tasks: [acTask({ id: 1, dueOn: localDay(2026, 6, 29) })],
      now: NOW
    })
    expect(kinds(pulledBack.changes)).toEqual(['due'])
  })

  it('re-arms when the date is cleared entirely', () => {
    const previous = snapshotOf([acTask({ id: 1, dueOn: localDay(2026, 6, 28) })])

    const { changes, snapshot } = acDiffTaskSnapshot({
      previous,
      tasks: [acTask({ id: 1, dueOn: null })],
      now: NOW
    })

    expect(changes).toEqual([])
    expect(snapshot['1']?.notifiedDueBucket).toBe('none')
  })
})

describe('tasks that leave the list', () => {
  it('drops them from the snapshot and reports nothing', () => {
    const staying = acTask({ id: 1 })
    const previous = snapshotOf([staying, acTask({ id: 2, commentCount: 3 })])

    const { changes, snapshot } = acDiffTaskSnapshot({ previous, tasks: [staying], now: NOW })

    expect(changes).toEqual([])
    expect(Object.keys(snapshot)).toEqual(['1'])
  })
})

describe('acFoldLocalWrite', () => {
  it('takes the echoed row as the exact state the next poll will see', () => {
    const snapshot = snapshotOf([acTask({ id: 1, commentCount: 1, updatedOn: EARLIER })])
    const echo = acTask({ id: 1, commentCount: 1, updatedOn: NOW, dueOn: localDay(2026, 6, 29) })

    const folded = acFoldLocalWrite({ snapshot, taskId: 1, task: echo, now: NOW })

    expect(folded['1']).toEqual(acTaskSnapshotEntry(echo, NOW))
    expect(acDiffTaskSnapshot({ previous: folded, tasks: [echo], now: NOW }).changes).toEqual([])
  })

  it('records a task the snapshot has never seen, so self-assignment is not an assignment', () => {
    const echo = acTask({ id: 9 })

    const folded = acFoldLocalWrite({ snapshot: {}, taskId: 9, task: echo, now: NOW })

    expect(acDiffTaskSnapshot({ previous: folded, tasks: [echo], now: NOW }).changes).toEqual([])
  })

  it('counts a posted comment and forgets the timestamp it cannot know', () => {
    const snapshot = snapshotOf([acTask({ id: 1, commentCount: 4, updatedOn: EARLIER })])

    const folded = acFoldLocalWrite({ snapshot, taskId: 1, postedComments: 1, now: NOW })

    expect(folded['1']).toEqual({ commentCount: 5, notifiedDueBucket: 'none', updatedOn: null })
  })

  it('re-buckets from the date this app wrote when the server echoed nothing usable', () => {
    const snapshot = snapshotOf([acTask({ id: 1, dueOn: localDay(2026, 7, 20) })])

    const folded = acFoldLocalWrite({
      snapshot,
      taskId: 1,
      task: null,
      dueOn: localDay(2026, 6, 28),
      now: NOW
    })

    expect(folded['1']?.notifiedDueBucket).toBe('today')
    expect(
      acDiffTaskSnapshot({
        previous: folded,
        tasks: [acTask({ id: 1, dueOn: localDay(2026, 6, 28) })],
        now: NOW
      }).changes
    ).toEqual([])
  })

  it('leaves an unknown task alone rather than inventing an entry from a bare id', () => {
    const snapshot = snapshotOf([acTask({ id: 1 })])

    expect(acFoldLocalWrite({ snapshot, taskId: 404, postedComments: 1, now: NOW })).toBe(snapshot)
  })
})
