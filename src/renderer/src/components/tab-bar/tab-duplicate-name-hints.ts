import { useMemo } from 'react'
import type { OpenFile } from '@/store/slices/editor'
import { getTabStripEditorLabel, hasFilePathLabel } from './tab-strip-labels'

export type DuplicateNameEntry = {
  id: string
  label: string
  /** Relative or absolute path; null when the tab has no file path. */
  path: string | null
}

export function toDuplicateNameEntry(
  id: string,
  file: Parameters<typeof getTabStripEditorLabel>[0] & Pick<OpenFile, 'diffSource'>
): DuplicateNameEntry {
  return {
    id,
    label: getTabStripEditorLabel(file),
    path: hasFilePathLabel(file) ? file.relativePath : null
  }
}

function parentSegments(path: string): string[] {
  const segments = path.split(/[\\/]+/).filter(Boolean)
  return segments.slice(0, -1)
}

function suffix(segments: string[], count: number): string {
  return segments.slice(-count).join('\u0000')
}

/** Shortest trailing parent folders that tell same-named tabs apart, keyed by entry id. */
export function computeDuplicateNameHints(
  entries: readonly DuplicateNameEntry[]
): Map<string, string> {
  const byLabel = new Map<string, { id: string; path: string; segments: string[] }[]>()
  for (const entry of entries) {
    if (entry.path === null) {
      continue
    }
    const group = byLabel.get(entry.label) ?? []
    group.push({ id: entry.id, path: entry.path, segments: parentSegments(entry.path) })
    byLabel.set(entry.label, group)
  }
  const hints = new Map<string, string>()
  for (const group of byLabel.values()) {
    if (group.length < 2) {
      continue
    }
    for (const item of group) {
      if (item.segments.length === 0) {
        continue
      }
      let count = 1
      while (
        count < item.segments.length &&
        group.some(
          (other) =>
            other !== item &&
            other.segments.length > 0 &&
            suffix(other.segments, count) === suffix(item.segments, count)
        )
      ) {
        count++
      }
      const separator = item.path.includes('/') ? '/' : '\\'
      hints.set(item.id, item.segments.slice(-count).join(separator))
    }
  }
  return hints
}

const FIELD = '\u0001'
const ENTRY = '\u0002'

/** Recomputes only when a tab's id, label or path changes, so activation and dirty state skip it. */
export function useDuplicateNameHints(entries: readonly DuplicateNameEntry[]): Map<string, string> {
  const key = entries.map((e) => [e.id, e.label, e.path ?? ''].join(FIELD)).join(ENTRY)
  return useMemo(() => {
    const decoded = key
      ? key.split(ENTRY).map((raw) => {
          const [id, label, path] = raw.split(FIELD)
          return { id, label, path: path || null }
        })
      : []
    return computeDuplicateNameHints(decoded)
  }, [key])
}
