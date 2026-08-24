import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCollabTask } from '../../shared/activecollab-types'

const { userDataPathMock, getCredentialMock } = vi.hoisted(() => ({
  userDataPathMock: vi.fn(() => ''),
  getCredentialMock: vi.fn()
}))

vi.mock('../persistence', () => ({ getCanonicalUserDataPath: userDataPathMock }))
vi.mock('./credential-store', () => ({ getActiveCollabCredential: getCredentialMock }))

import { acDiffTaskSnapshot, type AcTaskSnapshot } from './task-change-detector'
import {
  acClearTaskSnapshot,
  acCurrentTaskSnapshotKey,
  acFoldLocalTaskWrite,
  acLoadTaskSnapshot,
  acSaveTaskSnapshot
} from './task-snapshot-store'

const NOW = new Date(2026, 6, 28, 12, 0, 0).getTime()
const EARLIER = new Date(2026, 6, 28, 9, 0, 0).getTime()

const JAKE = { instanceUrl: 'https://projects.efront.com.au', userId: 407, token: 'tok' }
const OTHER = { instanceUrl: 'https://projects.efront.com.au', userId: 902, token: 'tok' }

const JAKE_KEY = 'https://projects.efront.com.au#407'

let userDataDir = ''

function snapshotFile(): string {
  return join(userDataDir, 'activecollab-task-snapshot.json')
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
    isHiddenFromClients: false,
    isImportant: false,
    estimate: null,
    jobTypeId: null,
    openSubtaskCount: null,
    totalSubtaskCount: null,
    ...overrides
  }
}

/** Seeds the file the way a first poll would, then answers what a later poll would report. */
function seed(tasks: ActiveCollabTask[]): void {
  acSaveTaskSnapshot(JAKE_KEY, acDiffTaskSnapshot({ previous: null, tasks, now: NOW }).snapshot)
}

function changesOnNextPoll(tasks: ActiveCollabTask[]): unknown[] {
  return acDiffTaskSnapshot({ previous: acLoadTaskSnapshot(JAKE_KEY), tasks, now: NOW }).changes
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'ac-snapshot-'))
  userDataPathMock.mockReset()
  userDataPathMock.mockImplementation(() => userDataDir)
  getCredentialMock.mockReset()
  getCredentialMock.mockReturnValue(JAKE)
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

describe('acCurrentTaskSnapshotKey', () => {
  it('keys on the instance and the user, and never on the token', () => {
    expect(acCurrentTaskSnapshotKey()).toBe(JAKE_KEY)
    expect(acCurrentTaskSnapshotKey()).not.toContain('tok')
  })

  it('is null while nothing is connected, and when the keychain refuses', () => {
    getCredentialMock.mockReturnValue(null)
    expect(acCurrentTaskSnapshotKey()).toBeNull()

    getCredentialMock.mockImplementation(() => {
      throw new Error('keychain refused')
    })
    expect(acCurrentTaskSnapshotKey()).toBeNull()
  })
})

describe('persistence', () => {
  it('reads back what it wrote', () => {
    const snapshot: AcTaskSnapshot = {
      '1': { commentCount: 3, notifiedDueBucket: 'overdue', updatedOn: EARLIER }
    }

    acSaveTaskSnapshot(JAKE_KEY, snapshot)

    expect(acLoadTaskSnapshot(JAKE_KEY)).toEqual(snapshot)
  })

  it('answers null for an absent file, which is what makes a first run silent', () => {
    expect(acLoadTaskSnapshot(JAKE_KEY)).toBeNull()
  })

  it('survives a restart without re-announcing the workload it already knew', () => {
    const tasks = [
      acTask({ id: 1, commentCount: 4, updatedOn: EARLIER }),
      acTask({ id: 2, dueOn: new Date(2026, 6, 1).getTime() })
    ]
    seed(tasks)

    // A restart is exactly this: no memory, only the file.
    expect(changesOnNextPoll(tasks)).toEqual([])
  })

  it('never shares a snapshot between credentials', () => {
    seed([acTask({ id: 1, commentCount: 4 }), acTask({ id: 2 })])

    // Reconnected as somebody else: the previous account's tasks are not this account's news.
    expect(acLoadTaskSnapshot('https://projects.efront.com.au#902')).toBeNull()
    getCredentialMock.mockReturnValue(OTHER)
    const otherKey = acCurrentTaskSnapshotKey() ?? ''
    expect(otherKey).not.toBe(JAKE_KEY)
    const { changes } = acDiffTaskSnapshot({
      previous: acLoadTaskSnapshot(otherKey),
      tasks: [acTask({ id: 3 })],
      now: NOW
    })
    expect(changes).toEqual([])
  })

  it('treats an unreadable or foreign file as no snapshot at all', () => {
    writeFileSync(snapshotFile(), '{ this is not json', 'utf8')
    expect(acLoadTaskSnapshot(JAKE_KEY)).toBeNull()

    writeFileSync(snapshotFile(), JSON.stringify({ tasks: {} }), 'utf8')
    expect(acLoadTaskSnapshot(JAKE_KEY)).toBeNull()
  })

  it('drops entries a hand-edited file got wrong, keeping the ones it did not', () => {
    writeFileSync(
      snapshotFile(),
      JSON.stringify({
        key: JAKE_KEY,
        tasks: {
          '1': { commentCount: 2, notifiedDueBucket: 'dueYesterday', updatedOn: 1 },
          '2': { commentCount: 'two', notifiedDueBucket: 'today', updatedOn: 1 },
          '3': { commentCount: 5, notifiedDueBucket: 'today', updatedOn: 'never' }
        }
      }),
      'utf8'
    )

    expect(acLoadTaskSnapshot(JAKE_KEY)).toEqual({
      '3': { commentCount: 5, notifiedDueBucket: 'today', updatedOn: null }
    })
  })

  it('clears the file on disconnect', () => {
    seed([acTask({ id: 1 })])
    expect(existsSync(snapshotFile())).toBe(true)

    acClearTaskSnapshot()

    expect(existsSync(snapshotFile())).toBe(false)
    acClearTaskSnapshot()
  })
})

describe('self-echo suppression', () => {
  it('says nothing after the actor completes a task', () => {
    const task = acTask({ id: 1, commentCount: 2, updatedOn: EARLIER })
    seed([task, acTask({ id: 2 })])

    acFoldLocalTaskWrite({
      taskId: 1,
      task: { ...task, isCompleted: true, updatedOn: NOW },
      now: NOW
    })

    // Two ways a completion comes back: gone from the assigned list, which is never an event —
    expect(changesOnNextPoll([acTask({ id: 2 })])).toEqual([])
    // — or still listed with a bumped updated_on, because this instance's `is_completed` and
    // `completed_on` disagree on some rows (see tasks.ts). The fold is what covers the second.
    expect(
      changesOnNextPoll([acTask({ id: 1, commentCount: 2, updatedOn: NOW }), acTask({ id: 2 })])
    ).toEqual([])
  })

  it('says nothing after the actor posts a comment, including the edit the comment implies', () => {
    seed([acTask({ id: 1, commentCount: 2, updatedOn: EARLIER })])

    acFoldLocalTaskWrite({ taskId: 1, postedComments: 1, now: NOW })

    // The server counts the new comment AND moves updated_on; neither is news to whoever typed it.
    expect(changesOnNextPoll([acTask({ id: 1, commentCount: 3, updatedOn: NOW })])).toEqual([])
  })

  it('still reports a colleague commenting on top of the actor', () => {
    seed([acTask({ id: 1, commentCount: 2, updatedOn: EARLIER })])
    acFoldLocalTaskWrite({ taskId: 1, postedComments: 1, now: NOW })

    const changes = changesOnNextPoll([acTask({ id: 1, commentCount: 4, updatedOn: NOW })])

    expect(changes).toEqual([
      {
        kind: 'comments',
        task: acTask({ id: 1, commentCount: 4, updatedOn: NOW }),
        newComments: 1
      }
    ])
  })

  it('says nothing after the actor assigns a task to themselves', () => {
    seed([acTask({ id: 1 })])
    const mine = acTask({ id: 2, name: 'Ship the notifier', assigneeId: 407, updatedOn: NOW })

    acFoldLocalTaskWrite({ taskId: 2, task: mine, now: NOW })

    expect(changesOnNextPoll([acTask({ id: 1 }), mine])).toEqual([])
  })

  it('says nothing after the actor sets a due date on their own task', () => {
    seed([acTask({ id: 1 })])
    const dated = acTask({ id: 1, dueOn: new Date(2026, 6, 28).getTime(), updatedOn: NOW })

    acFoldLocalTaskWrite({ taskId: 1, task: dated, now: NOW })

    expect(changesOnNextPoll([dated])).toEqual([])
  })

  it('does not create a snapshot out of a write, so the first poll stays a first run', () => {
    acFoldLocalTaskWrite({ taskId: 1, task: acTask({ id: 1 }), now: NOW })

    expect(existsSync(snapshotFile())).toBe(false)
    // Which is the whole point: the poll that follows announces nothing at all.
    expect(changesOnNextPoll([acTask({ id: 1 }), acTask({ id: 2 })])).toEqual([])
  })

  it('does nothing while disconnected', () => {
    seed([acTask({ id: 1, commentCount: 2 })])
    const before = readFileSync(snapshotFile(), 'utf8')
    getCredentialMock.mockReturnValue(null)

    acFoldLocalTaskWrite({ taskId: 1, postedComments: 1, now: NOW })

    expect(readFileSync(snapshotFile(), 'utf8')).toBe(before)
  })
})
