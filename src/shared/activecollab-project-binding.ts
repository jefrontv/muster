// A Muster project's link to one ActiveCollab project.
//
// The id is the contract; `projectName` is a cache. ActiveCollab lets a project be renamed at any
// time and there is no change feed, so the name persisted here is only what the last successful
// `listProjects` reported. Every surface that shows it must be prepared to see it move, and nothing
// may resolve a binding by name.
//
// Numeric because that is what the ActiveCollab wire types use on both ends of the join
// (`ActiveCollabProject.id` and `ActiveCollabTask.projectId`). Stringifying for
// `ActiveCollabTaskProviderIdentity` is a one-line concern at the cache-scope boundary; a string
// here would push a parse into every comparison instead.

export type ActiveCollabProjectBinding = {
  projectId: number
  /** Last name seen upstream. Refreshed from `listProjects`; never authoritative. */
  projectName: string
  boundAt: number
}

/**
 * Persisted data is untrusted: a hand-edited profile, a downgrade, or a future field rename can all
 * put nonsense here. A partially valid binding is dropped rather than repaired, because a binding
 * with a plausible id and a junk name would silently scope the task list to the wrong project.
 *
 * Also the constructor for new bindings — the picker hands it an id and a name straight off the
 * wire, and those deserve the same rejection as anything read back off disk.
 */
export function normalizeActiveCollabProjectBinding(
  value: unknown
): ActiveCollabProjectBinding | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<ActiveCollabProjectBinding>
  const projectId = raw.projectId
  if (typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId <= 0) {
    return null
  }
  const projectName = typeof raw.projectName === 'string' ? raw.projectName.trim() : ''
  if (!projectName) {
    return null
  }
  const boundAt = typeof raw.boundAt === 'number' && Number.isFinite(raw.boundAt) ? raw.boundAt : 0
  return { projectId, projectName, boundAt }
}
