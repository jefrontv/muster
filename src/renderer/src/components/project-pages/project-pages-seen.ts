// The last revision of each page the user has looked at, so agent edits since then can be flagged.
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'

const STORAGE_KEY = 'muster.projectPages.seenRevisions.v1'
type SeenByScope = Record<string, Record<string, number>>

let cache: SeenByScope | null = null
const listeners = new Set<() => void>()

function readAll(): SeenByScope {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as SeenByScope
    } catch {
      cache = {}
    }
  }
  return cache
}

function writeScope(scopeKey: string, seen: Record<string, number>): void {
  cache = { ...readAll(), [scopeKey]: seen }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota or private mode: the dots still work for this session.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another Muster window opened a page.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) {
      cache = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

type SeenPage = Pick<ProjectPageMeta, 'id' | 'revision'>

/** Records these revisions as seen; a project seen for the first time starts with everything seen. */
export function markPagesSeen(scopeKey: string, pages: SeenPage[]): void {
  const current = readAll()[scopeKey] ?? {}
  if (pages.every((page) => (current[page.id] ?? 0) >= page.revision)) {
    return
  }
  const next = { ...current }
  for (const page of pages) {
    next[page.id] = Math.max(next[page.id] ?? 0, page.revision)
  }
  writeScope(scopeKey, next)
}

/** True when an agent made the latest edit and the user hasn't looked since. */
export function isChangedByAgent(
  seen: Record<string, number> | undefined,
  page: Pick<ProjectPageMeta, 'id' | 'revision' | 'editedBy' | 'archivedAt'>
): boolean {
  return (
    seen !== undefined &&
    page.archivedAt === null &&
    page.editedBy.kind === 'agent' &&
    page.revision > (seen[page.id] ?? 0)
  )
}

/** Ids of the project's pages an agent changed since the user last looked; `openPage` counts as looked at. */
export function useAgentChangedPages(
  scopeKey: string | null,
  pages: ProjectPageMeta[],
  loaded: boolean,
  openPage?: SeenPage
): ReadonlySet<string> {
  const snapshot = (): Record<string, number> | undefined =>
    scopeKey ? readAll()[scopeKey] : undefined
  const seen = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    if (scopeKey && loaded && seen === undefined) {
      markPagesSeen(scopeKey, pages)
    }
  }, [scopeKey, loaded, seen, pages])
  // After the baseline, or a first look at one page would stop the rest being baselined.
  useMarkPageSeen(scopeKey, openPage)
  return useMemo(
    () => new Set(pages.filter((page) => isChangedByAgent(seen, page)).map((page) => page.id)),
    [pages, seen]
  )
}

/** Keeps the open page marked as seen, including edits that land while it is open. */
export function useMarkPageSeen(scopeKey: string | null, page: SeenPage | undefined): void {
  const id = page?.id
  const revision = page?.revision
  useEffect(() => {
    if (scopeKey && id && revision !== undefined) {
      markPagesSeen(scopeKey, [{ id, revision }])
    }
  }, [scopeKey, id, revision])
}

export function resetSeenPagesForTests(): void {
  cache = null
}
