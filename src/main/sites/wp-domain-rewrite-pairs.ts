// The needles an import must rewrite, in the order they have to run.
//
// Both search-replace back ends do a literal substring replace, so a single `live -> local` pass
// turns `www.graypuksand.com.au` into `www.graypuksand.local` — a host nothing serves, and the
// reason every `www.` URL in an imported database 404ed (jefrontv/muster#29). Intake is no help:
// site-bind-url strips `www.`, the ocsites import and the settings form keep it, so either host may
// arrive with or without the prefix.

export type DomainRewritePair = { from: string; to: string }

/**
 * `www.live -> local` first, then `live -> local`. The order is the whole point: run the bare pair
 * first and it eats the `www.` rows before the prefixed pair ever sees them.
 *
 * Empty when either host is blank or both name the same site, which callers skip with a log line.
 */
export function buildDomainRewritePairs(
  liveDomain: string,
  localDomain: string
): DomainRewritePair[] {
  const live = bareHost(liveDomain)
  const local = bareHost(localDomain)
  if (live.length === 0 || local.length === 0 || live === local) {
    return []
  }
  return [
    { from: `www.${live}`, to: local },
    { from: live, to: local }
  ]
}

/** One leading `www.`, not every label: `www.www.example.com` is a real (if odd) host. */
function bareHost(domain: string): string {
  const host = domain.trim().toLowerCase()
  return host.startsWith('www.') ? host.slice('www.'.length) : host
}
