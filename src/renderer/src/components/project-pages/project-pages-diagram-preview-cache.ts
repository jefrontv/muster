// Rendered diagram previews for page embeds, by page id. A newer saved revision (agent edit,
// another tab, restore) re-renders the cached preview so embeds stay current without a reload.
import type { ProjectPagesChange } from '../../../../shared/project-pages-types'

export type ReadyDiagramPreview = {
  svg: string
  empty: boolean
  title: string
  revision: number
}

export type DiagramPreview =
  | { state: 'loading'; revision: number | null }
  | { state: 'none' }
  | ({ state: 'ready' } & ReadyDiagramPreview)

/** Resolves null when the page is missing or not a diagram. */
export type DiagramPreviewSource = (
  scopeKey: string,
  pageId: string
) => Promise<ReadyDiagramPreview | null>

export function createDiagramPreviewCache(source: DiagramPreviewSource) {
  const previews = new Map<string, DiagramPreview>()
  // The newest load per page; an older load that finishes later is dropped.
  const tokens = new Map<string, number>()
  const listeners = new Set<() => void>()
  let nextToken = 0

  function load(scopeKey: string, pageId: string, revision: number | null = null): void {
    const token = ++nextToken
    tokens.set(pageId, token)
    previews.set(pageId, { state: 'loading', revision })
    void source(scopeKey, pageId)
      .then(
        (ready): DiagramPreview => (ready ? { state: 'ready', ...ready } : { state: 'none' }),
        (): DiagramPreview => ({ state: 'none' })
      )
      .then((preview) => {
        if (tokens.get(pageId) !== token) {
          return
        }
        previews.set(pageId, preview)
        listeners.forEach((listener) => listener())
      })
  }

  return {
    get: (pageId: string): DiagramPreview | undefined => previews.get(pageId),
    load,
    clear(): void {
      previews.clear()
      tokens.clear()
    },
    /** Reloads a preview this cache holds once its page saves a newer revision. */
    changed(change: ProjectPagesChange): void {
      if (!change.pageId || change.revision === null) {
        return
      }
      const preview = previews.get(change.pageId)
      if (!preview) {
        return
      }
      const known = preview.state === 'none' ? null : preview.revision
      if (known !== null && known >= change.revision) {
        return
      }
      load(change.scopeKey, change.pageId, change.revision)
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
