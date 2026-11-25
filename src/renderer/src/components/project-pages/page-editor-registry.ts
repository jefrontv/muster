// The page editors on screen, so a plan review can read and save a page's live text.
type LivePageEditor = {
  /** Null once the editor is gone. */
  markdown: () => string | null
  flush: () => Promise<void>
}

const editors = new Map<string, LivePageEditor>()

function key(scopeKey: string, pageId: string): string {
  return `${scopeKey}\u0000${pageId}`
}

export function registerPageEditor(
  scopeKey: string,
  pageId: string,
  editor: LivePageEditor
): () => void {
  const at = key(scopeKey, pageId)
  editors.set(at, editor)
  return () => {
    if (editors.get(at) === editor) {
      editors.delete(at)
    }
  }
}

export function livePageEditor(scopeKey: string, pageId: string): LivePageEditor | undefined {
  return editors.get(key(scopeKey, pageId))
}
