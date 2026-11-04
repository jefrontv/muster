// Which large items the import dialog leaves out. A file listed under a listed folder goes with
// its folder, so a ticked folder makes its files' own choice moot.

import {
  importPathCovers,
  type SiteImportLargeEntry
} from '../../../../shared/site-import-file-rules'

/** The listed folder that holds `entry`, if any. */
export function enclosingEntry(
  entry: SiteImportLargeEntry,
  entries: readonly SiteImportLargeEntry[]
): SiteImportLargeEntry | undefined {
  return entries.find(
    (other) =>
      other !== entry && other.kind === 'folder' && importPathCovers(other.path, entry.path)
  )
}

/** Everything ticked that is not already inside another ticked item. */
export function skipPaths(
  entries: readonly SiteImportLargeEntry[],
  selected: ReadonlySet<string>
): string[] {
  return entries
    .filter((entry) => selected.has(entry.path))
    .filter(
      (entry) =>
        !entries.some(
          (other) =>
            other !== entry && selected.has(other.path) && importPathCovers(other.path, entry.path)
        )
    )
    .map((entry) => entry.path)
}

export function skippedBytes(
  entries: readonly SiteImportLargeEntry[],
  selected: ReadonlySet<string>
): number {
  const paths = new Set(skipPaths(entries, selected))
  return entries.reduce((sum, entry) => sum + (paths.has(entry.path) ? entry.bytes : 0), 0)
}

/** `wp-content/ai1wm-backups` → name `ai1wm-backups`, parent `wp-content`. */
export function splitEntryPath(path: string): { name: string; parent: string } {
  const slash = path.lastIndexOf('/')
  return slash < 0
    ? { name: path, parent: '' }
    : { name: path.slice(slash + 1), parent: path.slice(0, slash) }
}
