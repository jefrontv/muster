import { describe, expect, it } from 'vitest'

import {
  selectActiveCollabBindingProject,
  selectProjectForRepoId
} from './activecollab-binding-target-project'
import type { Project } from '../../../shared/types'

function project(id: string, sourceRepoIds: string[]): Project {
  return {
    id,
    displayName: id,
    badgeColor: '#737373',
    sourceRepoIds,
    createdAt: 1,
    updatedAt: 1
  }
}

const PROJECTS = [project('github:acme/site', ['repo-site']), project('repo:r2', ['r2'])]

describe('selectActiveCollabBindingProject', () => {
  it('prefers the active workspace project id', () => {
    expect(
      selectActiveCollabBindingProject({
        projects: PROJECTS,
        activeWorktree: { projectId: 'repo:r2', repoId: 'repo-site' },
        activeRepoId: 'repo-site'
      })?.id
    ).toBe('repo:r2')
  })

  // Workspaces created before project ids existed carry only a repo id.
  it('falls back to the workspace repo when the workspace has no project id', () => {
    expect(
      selectActiveCollabBindingProject({
        projects: PROJECTS,
        activeWorktree: { repoId: 'repo-site' },
        activeRepoId: null
      })?.id
    ).toBe('github:acme/site')
  })

  it('falls back to the workspace repo when the project id no longer resolves', () => {
    expect(
      selectActiveCollabBindingProject({
        projects: PROJECTS,
        activeWorktree: { projectId: 'repo:deleted', repoId: 'r2' },
        activeRepoId: null
      })?.id
    ).toBe('repo:r2')
  })

  it('falls back to the focused repo when no workspace is active', () => {
    expect(
      selectActiveCollabBindingProject({
        projects: PROJECTS,
        activeWorktree: null,
        activeRepoId: 'r2'
      })?.id
    ).toBe('repo:r2')
  })

  // A folder workspace synthesises `folder-workspace:<groupId>`, which matches no project. It must
  // fall through rather than bind whichever project happens to sort first.
  it('resolves nothing for a folder workspace with no focused repo', () => {
    expect(
      selectActiveCollabBindingProject({
        projects: PROJECTS,
        activeWorktree: { repoId: 'folder-workspace:group-1' },
        activeRepoId: null
      })
    ).toBeNull()
  })

  it('resolves nothing when neither a workspace nor a repo is active', () => {
    expect(
      selectActiveCollabBindingProject({
        projects: PROJECTS,
        activeWorktree: null,
        activeRepoId: null
      })
    ).toBeNull()
  })
})

describe('selectProjectForRepoId', () => {
  it('finds the project that owns a sidebar repo row', () => {
    expect(selectProjectForRepoId(PROJECTS, 'repo-site')?.id).toBe('github:acme/site')
  })

  it('resolves nothing for a repo no project claims', () => {
    expect(selectProjectForRepoId(PROJECTS, 'repo-unknown')).toBeNull()
  })

  it('resolves nothing without a repo id', () => {
    expect(selectProjectForRepoId(PROJECTS, null)).toBeNull()
  })
})
