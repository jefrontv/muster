import type { Project } from './types'

/**
 * Projects are a PROJECTION of repos: every load rebuilds them from the repo list, so any field the
 * projection cannot derive is destroyed unless it is explicitly carried across. A few fields are
 * owned by the user rather than by the repo — the Windows runtime override and the ActiveCollab
 * project binding — and both would silently reset on the next app start without this.
 *
 * It is shared rather than inlined at each site because there are two independent rebuilds (the
 * persistence store's compatibility merge and the profile-transfer rebuild) that MUST agree. A
 * field added to one and not the other survives on this machine and vanishes on profile import,
 * which is the worst possible failure shape: it looks like it works.
 *
 * Returns `projected` unchanged when nothing is carried, so a rebuild that changes nothing keeps
 * its object identities.
 */
export function carryProjectUserOwnedFields(
  projected: Project,
  existing: Project | undefined
): Project {
  if (!existing) {
    return projected
  }
  const carried: Project = { ...projected }
  let carriedAny = false
  if (existing.localWindowsRuntimePreference !== undefined) {
    carried.localWindowsRuntimePreference = existing.localWindowsRuntimePreference
    carriedAny = true
  }
  if (existing.activeCollabBinding !== undefined) {
    carried.activeCollabBinding = existing.activeCollabBinding
    carriedAny = true
  }
  if (!carriedAny) {
    return projected
  }
  carried.updatedAt = Math.max(projected.updatedAt, existing.updatedAt)
  return carried
}
