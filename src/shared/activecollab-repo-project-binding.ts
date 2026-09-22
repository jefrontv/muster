// Which ActiveCollab project a Muster project's tasks come from.
//
// Keyed by repo id, not by workspace: every worktree under a project shares one binding. That is
// what makes the binding survive worktree churn — a worktree created tomorrow already knows which
// ActiveCollab project it belongs to, and deleting one does not lose the answer.
//
// The reverse mapping already exists as `activeCollabProjectSites` (ActiveCollab project → site).
// This is deliberately a separate record rather than an inversion of it: a site is a deployment
// target and a repo is a checkout, and one project can have both without them meaning the same.

import type { GlobalSettings } from './types'

type SettingsSlice = Pick<GlobalSettings, 'activeCollabRepoProjects'> | null | undefined

export function readActiveCollabRepoProject(
  settings: SettingsSlice,
  repoId: string | null
): number | null {
  if (!repoId) {
    return null
  }
  const bound = settings?.activeCollabRepoProjects?.[repoId]
  // Why the type guard: settings are persisted JSON that older builds wrote, so a string or a null
  // getting this far is a real possibility and would otherwise reach an API call as a project id.
  return typeof bound === 'number' && Number.isInteger(bound) && bound > 0 ? bound : null
}

/** Passing null as the project clears the binding rather than storing an empty one. */
export function setActiveCollabRepoProject(
  existing: GlobalSettings['activeCollabRepoProjects'],
  repoId: string,
  projectId: number | null
): NonNullable<GlobalSettings['activeCollabRepoProjects']> {
  const next = { ...existing }
  if (projectId === null) {
    delete next[repoId]
    return next
  }
  next[repoId] = projectId
  return next
}

/** The ids still bound to something, for a settings pane that wants to list them. */
export function boundActiveCollabRepoIds(settings: SettingsSlice): string[] {
  return Object.entries(settings?.activeCollabRepoProjects ?? {})
    .filter(([, projectId]) => typeof projectId === 'number')
    .map(([repoId]) => repoId)
}
