// Bindings from an ActiveCollab project to a local site.
//
// Keyed by instance as well as project: project ids are only unique within one ActiveCollab
// instance, so a second account would otherwise inherit the first account's bindings and point
// its tasks at the wrong site. The task notification snapshot is keyed the same way.

/** Stand-in for a missing instance URL; keeps every key two non-empty segments. */
export const UNKNOWN_ACTIVECOLLAB_INSTANCE = 'unknown-instance'

export function activeCollabProjectSiteKey(
  instanceUrl: string | null | undefined,
  projectId: number | string
): string {
  // Trailing slashes vary by where the URL came from; normalising here stops one instance
  // producing two keys that never find each other's bindings.
  const instance = (instanceUrl ?? '').trim().replace(/\/+$/, '')
  return `${instance || UNKNOWN_ACTIVECOLLAB_INSTANCE}::${projectId}`
}

/**
 * Settings arrive from disk and can be hand-edited, so a malformed entry must be dropped rather
 * than trusted: a non-string value reaching a Site lookup would fail far from its cause.
 */
export function sanitizeActiveCollabProjectSites(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 0 && typeof value === 'string' && value.length > 0) {
      next[key] = value
    }
  }
  return next
}
