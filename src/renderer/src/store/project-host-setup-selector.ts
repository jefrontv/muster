import type { Project, ProjectHostSetup } from '../../../shared/types'
import {
  projectHostSetupProjectionFromRepos,
  type ProjectHostSetupProjection
} from '../../../shared/project-host-setup-projection'
import type { AppState } from './types'
import { normalizeHydratedProjectHostSetupProjection } from './project-host-setup-selector-normalization'

const projectHostSetupProjectionCache = new WeakMap<AppState['repos'], ProjectHostSetupProjection>()
const providedProjectHostSetupProjectionCache = new WeakMap<
  Project[],
  WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>
>()
const mergedProjectHostSetupProjectionCache = new WeakMap<
  AppState['repos'],
  WeakMap<Project[], WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>>
>()
const normalizedProjectHostSetupProjectionCache = new WeakMap<
  AppState['repos'],
  WeakMap<Project[], WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>>
>()
// Why: the selector runs on every store write; hit this before the O(repos) normalization.
const stateProjectionCache = new WeakMap<
  AppState['repos'],
  WeakMap<Project[], WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>>
>()

function getCachedProjectHostSetupProjection(repos: AppState['repos']): ProjectHostSetupProjection {
  const cachedProjection = projectHostSetupProjectionCache.get(repos)
  if (cachedProjection) {
    return cachedProjection
  }

  const projection = projectHostSetupProjectionFromRepos(repos)
  projectHostSetupProjectionCache.set(repos, projection)
  return projection
}

function getCachedProvidedProjectHostSetupProjection(
  projects: Project[],
  setups: ProjectHostSetup[]
): ProjectHostSetupProjection {
  const cachedBySetups = providedProjectHostSetupProjectionCache.get(projects)
  const cachedProjection = cachedBySetups?.get(setups)
  if (cachedProjection) {
    return cachedProjection
  }

  const projection = { projects, setups }
  const nextCachedBySetups =
    cachedBySetups ?? new WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>()
  nextCachedBySetups.set(setups, projection)
  if (!cachedBySetups) {
    providedProjectHostSetupProjectionCache.set(projects, nextCachedBySetups)
  }
  return projection
}

function mergeById<T extends { id: string }>(base: readonly T[], overlay: readonly T[]): T[] {
  const merged = [...base]
  const indexById = new Map(merged.map((entry, index) => [entry.id, index]))
  for (const entry of overlay) {
    const index = indexById.get(entry.id)
    if (index === undefined) {
      indexById.set(entry.id, merged.length)
      merged.push(entry)
    } else {
      merged[index] = entry
    }
  }
  return merged
}

function mergeProjectHostSetupProjection(
  repos: AppState['repos'],
  projects: Project[],
  setups: ProjectHostSetup[]
): ProjectHostSetupProjection {
  const cachedByProjects = mergedProjectHostSetupProjectionCache.get(repos)
  const cachedBySetups = cachedByProjects?.get(projects)
  const cachedProjection = cachedBySetups?.get(setups)
  if (cachedProjection) {
    return cachedProjection
  }
  const derived = getCachedProjectHostSetupProjection(repos)
  const normalized = normalizeHydratedProjectHostSetupProjection(repos, projects, setups, derived)
  // Why: older runtimes/profiles may hydrate empty or partial project/setup arrays
  // beside legacy repos. Keep repo-backed compatibility rows visible in that case.
  const projection = {
    projects: mergeById(derived.projects, normalized.projects),
    setups: mergeById(derived.setups, normalized.setups)
  }
  const nextCachedByProjects =
    cachedByProjects ??
    new WeakMap<Project[], WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>>()
  const nextCachedBySetups =
    cachedBySetups ?? new WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>()
  nextCachedBySetups.set(setups, projection)
  if (!cachedBySetups) {
    nextCachedByProjects.set(projects, nextCachedBySetups)
  }
  if (!cachedByProjects) {
    mergedProjectHostSetupProjectionCache.set(repos, nextCachedByProjects)
  }
  return projection
}

function getCachedNormalizedProjectHostSetupProjection(
  repos: AppState['repos'],
  projects: Project[],
  setups: ProjectHostSetup[],
  derived: ProjectHostSetupProjection,
  normalized: ProjectHostSetupProjection
): ProjectHostSetupProjection {
  const cachedByProjects = normalizedProjectHostSetupProjectionCache.get(repos)
  const cachedBySetups = cachedByProjects?.get(projects)
  const cachedProjection = cachedBySetups?.get(setups)
  if (cachedProjection) {
    return cachedProjection
  }
  const projection = {
    projects: mergeById(derived.projects, normalized.projects),
    setups: mergeById(derived.setups, normalized.setups)
  }
  const nextCachedByProjects =
    cachedByProjects ??
    new WeakMap<Project[], WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>>()
  const nextCachedBySetups =
    cachedBySetups ?? new WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>()
  nextCachedBySetups.set(setups, projection)
  if (!cachedBySetups) {
    nextCachedByProjects.set(projects, nextCachedBySetups)
  }
  if (!cachedByProjects) {
    normalizedProjectHostSetupProjectionCache.set(repos, nextCachedByProjects)
  }
  return projection
}

export function getProjectHostSetupProjectionFromState(
  state: Pick<AppState, 'repos'> & Partial<Pick<AppState, 'projects' | 'projectHostSetups'>>
): ProjectHostSetupProjection {
  if (state.projects && state.projectHostSetups) {
    const projects = state.projects as Project[]
    const setups = state.projectHostSetups as ProjectHostSetup[]
    const cachedByProjects = stateProjectionCache.get(state.repos)
    const cachedBySetups = cachedByProjects?.get(projects)
    const cachedProjection = cachedBySetups?.get(setups)
    if (cachedProjection) {
      return cachedProjection
    }
    const projection = computeProjectHostSetupProjection(state.repos, projects, setups)
    const nextCachedByProjects =
      cachedByProjects ??
      new WeakMap<Project[], WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>>()
    const nextCachedBySetups =
      cachedBySetups ?? new WeakMap<ProjectHostSetup[], ProjectHostSetupProjection>()
    nextCachedBySetups.set(setups, projection)
    if (!cachedBySetups) {
      nextCachedByProjects.set(projects, nextCachedBySetups)
    }
    if (!cachedByProjects) {
      stateProjectionCache.set(state.repos, nextCachedByProjects)
    }
    return projection
  }
  return getCachedProjectHostSetupProjection(state.repos)
}

function computeProjectHostSetupProjection(
  repos: AppState['repos'],
  projects: Project[],
  setups: ProjectHostSetup[]
): ProjectHostSetupProjection {
  const repoIds = new Set(repos.map((repo) => repo.id))
  const coveredRepoIds = new Set<string>()
  for (const setup of setups) {
    const repoId = typeof setup.repoId === 'string' ? setup.repoId : ''
    if (repoIds.has(repoId)) {
      coveredRepoIds.add(repoId)
    }
    if (repoIds.has(setup.id)) {
      coveredRepoIds.add(setup.id)
    }
  }
  if (repos.length > 0 && coveredRepoIds.size < repoIds.size) {
    return mergeProjectHostSetupProjection(repos, projects, setups)
  }
  const derived = getCachedProjectHostSetupProjection(repos)
  const normalized = normalizeHydratedProjectHostSetupProjection(repos, projects, setups, derived)
  if (normalized.changed) {
    // Why: this is a zustand selector compared with Object.is, so the merged
    // result must be reference-stable per (repos, projects, setups) input or
    // every render returns a fresh object and triggers a re-render storm.
    return getCachedNormalizedProjectHostSetupProjection(
      repos,
      projects,
      setups,
      derived,
      normalized
    )
  }
  return getCachedProvidedProjectHostSetupProjection(projects, setups)
}
