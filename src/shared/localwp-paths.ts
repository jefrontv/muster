// Where LocalWP puts things inside a site folder. Pure path arithmetic, kept out of localwp-host so
// that reading the layout does not drag in the child-process and socket machinery beside it —
// mirrors shared/wsl-paths.ts, which wsl.ts re-exports for the same reason.

import path from 'node:path'

/** LocalWP nests the WordPress root two levels under the site folder it manages. */
export function localWpWordPressRoot(sitePath: string): string {
  return path.join(sitePath, 'app', 'public')
}
