import { describe, expect, it } from 'vitest'
import type { SiteImportLargeEntry } from '../../../../shared/site-import-file-rules'
import {
  enclosingEntry,
  skippedBytes,
  skipPaths,
  splitEntryPath
} from './site-import-large-selection'

const GB = 1024 ** 3
const ENTRIES: SiteImportLargeEntry[] = [
  { path: 'wp-content/ai1wm-backups', kind: 'folder', bytes: 4 * GB },
  { path: 'wp-content/ai1wm-backups/site.wpress', kind: 'file', bytes: 3 * GB },
  { path: 'error_log', kind: 'file', bytes: GB / 2 }
]

describe('large-file selection', () => {
  it('finds the listed folder a file sits in', () => {
    expect(enclosingEntry(ENTRIES[1], ENTRIES)?.path).toBe('wp-content/ai1wm-backups')
    expect(enclosingEntry(ENTRIES[2], ENTRIES)).toBeUndefined()
  })

  it('sends a ticked folder once, not again for the files inside it', () => {
    const selected = new Set(ENTRIES.map((entry) => entry.path))
    expect(skipPaths(ENTRIES, selected)).toEqual(['wp-content/ai1wm-backups', 'error_log'])
    expect(skippedBytes(ENTRIES, selected)).toBe(4.5 * GB)
  })

  it('can skip one file and still copy the rest of its folder', () => {
    const selected = new Set(['wp-content/ai1wm-backups/site.wpress'])
    expect(skipPaths(ENTRIES, selected)).toEqual(['wp-content/ai1wm-backups/site.wpress'])
    expect(skippedBytes(ENTRIES, selected)).toBe(3 * GB)
  })

  it('splits a path into what to show large and what to show small', () => {
    expect(splitEntryPath('wp-content/ai1wm-backups')).toEqual({
      name: 'ai1wm-backups',
      parent: 'wp-content'
    })
    expect(splitEntryPath('error_log')).toEqual({ name: 'error_log', parent: '' })
  })
})
