// Resolves a persisted ActiveCollab project binding against what the instance currently reports,
// and scopes the assigned-task rows accordingly. Pure, so every transition is assertable without a
// DOM — same split as deriveActiveCollabTaskListState.
//
// SCOPING IS CLIENT-SIDE. `listAssignedTasks` is account-scoped and ActiveCollab implements no
// server-side task filtering, so a bound project is a filter over rows already fetched. The cost is
// paging: a page of 100 assigned tasks may contain few or no rows for the bound project, so "load
// more" still walks the whole assigned set. It is not scoped into the cache key either — the fetch
// is identical bound or unbound, and keying by project would refetch the same rows into a second
// slot and make clearing a binding cost a network round trip.
import { normalizeActiveCollabProjectBinding } from '../../../shared/activecollab-project-binding'
import type { ActiveCollabProjectBinding } from '../../../shared/activecollab-project-binding'
import type { ActiveCollabProject, ActiveCollabTask } from '../../../shared/activecollab-types'

/**
 * `unverified` is the reason this is a four-state union rather than bound/missing. A failed or
 * still-pending `listProjects` proves nothing about whether the project exists, and collapsing it
 * into `missing` would tell a user their binding is broken every time the network hiccups.
 */
export type ActiveCollabBindingStatus =
  | { kind: 'unbound' }
  | { kind: 'unverified'; binding: ActiveCollabProjectBinding }
  | { kind: 'bound'; binding: ActiveCollabProjectBinding; upstreamName: string }
  | { kind: 'missing'; binding: ActiveCollabProjectBinding }

export type ActiveCollabBindingResolution = {
  /** Null while the projects read has not produced an answer; an empty array is a real answer. */
  projects: readonly ActiveCollabProject[] | null
  binding: unknown
}

export function resolveActiveCollabBindingStatus({
  binding,
  projects
}: ActiveCollabBindingResolution): ActiveCollabBindingStatus {
  // Normalised here rather than trusted from the store: `Project` comes off disk and through a
  // cross-host merge, and a junk binding must read as "not bound" instead of scoping the list to a
  // project id that cannot exist.
  const normalized = normalizeActiveCollabProjectBinding(binding)
  if (!normalized) {
    return { kind: 'unbound' }
  }
  if (!projects) {
    return { kind: 'unverified', binding: normalized }
  }
  const upstream = projects.find((project) => project.id === normalized.projectId)
  return upstream
    ? { kind: 'bound', binding: normalized, upstreamName: upstream.name }
    : { kind: 'missing', binding: normalized }
}

/** The name to show now — upstream when known, the persisted cache otherwise. */
export function activeCollabBindingDisplayName(status: ActiveCollabBindingStatus): string | null {
  switch (status.kind) {
    case 'unbound':
      return null
    case 'bound':
      return status.upstreamName
    case 'unverified':
    case 'missing':
      return status.binding.projectName
  }
}

/**
 * The persisted name to write back after an upstream rename, or null when nothing moved.
 *
 * Only `bound` can produce one: a name is only known to be stale when the current one was read from
 * the same response that confirmed the project still exists.
 */
export function activeCollabBindingNameDrift(
  status: ActiveCollabBindingStatus
): ActiveCollabProjectBinding | null {
  if (status.kind !== 'bound' || status.upstreamName === status.binding.projectName) {
    return null
  }
  return { ...status.binding, projectName: status.upstreamName }
}

/**
 * `missing` still filters, so the list goes empty rather than silently widening back to every
 * assigned task. The empty result is only ever shown next to the banner that explains it.
 */
export function filterActiveCollabTasksForBinding(
  tasks: readonly ActiveCollabTask[],
  status: ActiveCollabBindingStatus
): readonly ActiveCollabTask[] {
  if (status.kind === 'unbound') {
    return tasks
  }
  const { projectId } = status.binding
  return tasks.filter((task) => task.projectId === projectId)
}
