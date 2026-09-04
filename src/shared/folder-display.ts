// How a folder path is shown when the folder, not the path, is the point: the name first, the
// parent abbreviated. Pure so the renderer can use it without knowing the home directory.

/** Docroot names that say nothing on their own; the site folder above them is the real name. */
const GENERIC_LEAVES = new Set(['app', 'public', 'public_html', 'www', 'htdocs', 'web'])

const HOME_PREFIX = /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:[\\/]Users[\\/][^\\/]+)(?=[\\/]|$)/

/** `/Users/jake/Documents/Sites` → `~/Documents/Sites`. Untouched when not under a home directory. */
export function abbreviateHome(path: string): string {
  return path.replace(HOME_PREFIX, '~')
}

export type FolderDisplay = {
  /** `flex`, or `117pacific/app` when the leaf alone would be meaningless. */
  name: string
  /** The rest, home-abbreviated, without a trailing separator; '' at a root. */
  parent: string
}

export function describeFolder(path: string): FolderDisplay {
  const trimmed = path.replace(/[\\/]+$/, '')
  const segments = trimmed.split(/[\\/]/).filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return { name: trimmed, parent: '' }
  }
  const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/'
  const leaf = segments.at(-1) ?? ''
  const nameDepth = GENERIC_LEAVES.has(leaf.toLowerCase()) && segments.length > 1 ? 2 : 1
  const name = segments.slice(-nameDepth).join(separator)
  const parentSegments = segments.slice(0, -nameDepth)
  const parent =
    parentSegments.length === 0
      ? ''
      : abbreviateHome((trimmed.startsWith('/') ? '/' : '') + parentSegments.join(separator))
  return { name, parent }
}
