// Every site in the list usually lives directly under the same folder, so printing the absolute
// path on each row repeats one prefix hundreds of times and then truncates away the only part that
// differs. The row ends up spending a whole line to say nothing.
//
// So a row shows the path only when it adds information:
//   <root>/acme            -> ''            the name already says it
//   <root>/clients/acme    -> 'clients/'    the part that distinguishes it
//   /somewhere/else/acme   -> '/somewhere/else'   outside every known root: show it in full

const SEPARATOR = /[/\\]/

function segments(value: string): string[] {
  return value.split(SEPARATOR).filter((segment) => segment.length > 0)
}

function isUnder(pathSegments: string[], rootSegments: string[]): boolean {
  return (
    rootSegments.length > 0 &&
    pathSegments.length > rootSegments.length &&
    rootSegments.every((segment, index) => segment === pathSegments[index])
  )
}

/**
 * The path text a row should display, given the roots the app already watches.
 *
 * Returns '' when the path is exactly `<root>/<name>` — the overwhelmingly common case — so the
 * caller can drop the line entirely rather than render an empty one.
 */
export function formatSitePathForRow(sitePath: string, roots: readonly string[]): string {
  const pathSegments = segments(sitePath)
  if (pathSegments.length === 0) {
    return ''
  }
  // Why the runtime check on a typed parameter: this only shortens a label, so a caller that has
  // not loaded its roots yet (or a hot-reloaded module pairing an old parent with a new child)
  // must degrade to the full path. Taking down the whole Sites page over a cosmetic string is a
  // far worse failure than showing a long one.
  if (!Array.isArray(roots)) {
    return sitePath
  }

  // Longest match first: with both `<Sites>` and `<Sites>/mpac` watched, a site inside the latter
  // should be described relative to the closest root, not the outermost one.
  const best = roots
    .map((root) => segments(root))
    .filter((rootSegments) => isUnder(pathSegments, rootSegments))
    .sort((left, right) => right.length - left.length)[0]

  if (!best) {
    return sitePath
  }

  const remainder = pathSegments.slice(best.length, -1)
  return remainder.length === 0 ? '' : `${remainder.join('/')}/`
}
