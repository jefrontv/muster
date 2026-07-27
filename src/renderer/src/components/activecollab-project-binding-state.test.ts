import { describe, expect, it } from 'vitest'

import {
  activeCollabBindingDisplayName,
  activeCollabBindingNameDrift,
  filterActiveCollabTasksForBinding,
  resolveActiveCollabBindingStatus
} from './activecollab-project-binding-state'
import type { ActiveCollabProject, ActiveCollabTask } from '../../../shared/activecollab-types'

const BINDING = { projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 }

function acProject(id: number, name: string): ActiveCollabProject {
  return { id, name, isCompleted: false, openTaskCount: null }
}

function task(id: number, projectId: number, projectName: string): ActiveCollabTask {
  return {
    id,
    projectId,
    projectName,
    taskNumber: id,
    name: `Task ${id}`,
    bodyHtml: '',
    isCompleted: false,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: null,
    assigneeName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/projects/${projectId}/tasks/${id}`,
    taskListId: null
  }
}

describe('resolveActiveCollabBindingStatus', () => {
  it('reads a missing or malformed binding as unbound', () => {
    expect(resolveActiveCollabBindingStatus({ binding: undefined, projects: [] })).toEqual({
      kind: 'unbound'
    })
    expect(resolveActiveCollabBindingStatus({ binding: { projectId: 0 }, projects: [] })).toEqual({
      kind: 'unbound'
    })
  })

  // A pending or failed projects read proves nothing about the project's existence. Collapsing it
  // into `missing` would accuse a healthy binding of being broken on every network hiccup.
  it('holds a binding as unverified until the project list arrives', () => {
    expect(resolveActiveCollabBindingStatus({ binding: BINDING, projects: null })).toEqual({
      kind: 'unverified',
      binding: BINDING
    })
  })

  it('binds when the instance still reports the project', () => {
    expect(
      resolveActiveCollabBindingStatus({
        binding: BINDING,
        projects: [acProject(1, 'Other'), acProject(3790, 'Website Rebuild')]
      })
    ).toEqual({ kind: 'bound', binding: BINDING, upstreamName: 'Website Rebuild' })
  })

  it('reports missing only when a successful read omits the project', () => {
    expect(
      resolveActiveCollabBindingStatus({ binding: BINDING, projects: [acProject(1, 'Other')] })
    ).toEqual({ kind: 'missing', binding: BINDING })
  })

  it('matches on id, never on name', () => {
    const status = resolveActiveCollabBindingStatus({
      binding: BINDING,
      projects: [acProject(9999, 'Website Rebuild')]
    })

    expect(status.kind).toBe('missing')
  })
})

describe('activeCollabBindingDisplayName', () => {
  it('prefers the upstream name and falls back to the persisted one', () => {
    expect(
      activeCollabBindingDisplayName({
        kind: 'bound',
        binding: BINDING,
        upstreamName: 'Website Rebuild 2026'
      })
    ).toBe('Website Rebuild 2026')
    expect(activeCollabBindingDisplayName({ kind: 'unverified', binding: BINDING })).toBe(
      'Website Rebuild'
    )
    expect(activeCollabBindingDisplayName({ kind: 'missing', binding: BINDING })).toBe(
      'Website Rebuild'
    )
    expect(activeCollabBindingDisplayName({ kind: 'unbound' })).toBeNull()
  })
})

describe('activeCollabBindingNameDrift', () => {
  it('produces the refreshed binding when the project was renamed upstream', () => {
    expect(
      activeCollabBindingNameDrift({
        kind: 'bound',
        binding: BINDING,
        upstreamName: 'Website Rebuild 2026'
      })
    ).toEqual({ projectId: 3790, projectName: 'Website Rebuild 2026', boundAt: 1700 })
  })

  it('produces nothing when the name is unchanged', () => {
    expect(
      activeCollabBindingNameDrift({
        kind: 'bound',
        binding: BINDING,
        upstreamName: 'Website Rebuild'
      })
    ).toBeNull()
  })

  // An unverified or missing binding has no trustworthy upstream name to write back, so a rename
  // must never be inferred from either.
  it('produces nothing for a binding the instance has not confirmed', () => {
    expect(activeCollabBindingNameDrift({ kind: 'unverified', binding: BINDING })).toBeNull()
    expect(activeCollabBindingNameDrift({ kind: 'missing', binding: BINDING })).toBeNull()
    expect(activeCollabBindingNameDrift({ kind: 'unbound' })).toBeNull()
  })
})

describe('filterActiveCollabTasksForBinding', () => {
  const tasks = [
    task(1, 3790, 'Website Rebuild'),
    task(2, 4100, 'Other'),
    task(3, 3790, 'Website Rebuild')
  ]

  it('returns every task when nothing is bound', () => {
    expect(filterActiveCollabTasksForBinding(tasks, { kind: 'unbound' })).toBe(tasks)
  })

  it('keeps only the bound project rows', () => {
    expect(
      filterActiveCollabTasksForBinding(tasks, {
        kind: 'bound',
        binding: BINDING,
        upstreamName: 'Website Rebuild'
      }).map((entry) => entry.id)
    ).toEqual([1, 3])
  })

  it('scopes an unverified binding too, so rows do not widen while the list is being checked', () => {
    expect(
      filterActiveCollabTasksForBinding(tasks, { kind: 'unverified', binding: BINDING })
    ).toHaveLength(2)
  })

  // A vanished project must not silently widen back to every assigned task; the bar explains the
  // empty result.
  it('scopes a missing binding to nothing rather than widening', () => {
    expect(filterActiveCollabTasksForBinding(tasks, { kind: 'missing', binding: BINDING })).toEqual(
      [tasks[0], tasks[2]]
    )
    expect(
      filterActiveCollabTasksForBinding(tasks, {
        kind: 'missing',
        binding: { ...BINDING, projectId: 9999 }
      })
    ).toEqual([])
  })
})
