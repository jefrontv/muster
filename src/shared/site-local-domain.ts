// Proposes a local domain from a name. Shared because the setup review needs the same answer
// BEFORE a checkout exists (from the repo slug) that the planner gives afterwards (from the
// folder name); the two must not drift.

/**
 * ocsites' `default_local_domain` (deploy/utils.py:72): only the first label survives, so a
 * domain-shaped name such as `acme.com.au` yields `acme.local` rather than `acme.com.au.local`.
 */
export function defaultLocalDomain(name: string): string {
  let base = name.trim().toLowerCase()
  if (base.endsWith('.local')) {
    base = base.slice(0, -'.local'.length)
  }
  const [first] = base.split('.')
  return `${first || 'site'}.local`
}

/** Last path segment of `workspace/slug`, minus any `.git` suffix. */
export function repoSlug(fullName: string): string {
  const last =
    fullName
      .trim()
      .split('/')
      .findLast((part) => part.length > 0) ?? ''
  return last.toLowerCase().replace(/\.git$/, '')
}
