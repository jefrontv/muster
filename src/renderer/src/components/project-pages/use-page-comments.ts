// Loads a page's comment threads and keeps them current as people and agents reply.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  PageCommentAnchor,
  PageCommentStatus,
  PageCommentThread
} from '../../../../shared/project-pages-comment-types'
import type { ProjectPagesResult } from '../../../../shared/project-pages-types'

const pageCommentRequests = new EventTarget()

/** Asks the open editor of this page to start a whole-page comment. */
export function requestWholePageComment(pageId: string): void {
  pageCommentRequests.dispatchEvent(new CustomEvent('whole-page', { detail: pageId }))
}

export function useWholePageCommentRequests(pageId: string, onRequest: () => void): void {
  useEffect(() => {
    const listener = (event: Event): void => {
      if ((event as CustomEvent<string>).detail === pageId) {
        onRequest()
      }
    }
    pageCommentRequests.addEventListener('whole-page', listener)
    return () => pageCommentRequests.removeEventListener('whole-page', listener)
  }, [pageId, onRequest])
}

/** False while a hot-reloaded renderer runs against an older preload. */
function commentsAvailable(): boolean {
  return typeof window.api.projectPages.onCommentsChanged === 'function'
}

export async function loadPageComments(
  scopeKey: string,
  pageId: string
): Promise<PageCommentThread[]> {
  if (!commentsAvailable()) {
    return []
  }
  const result = await window.api.projectPages.comments(scopeKey, pageId)
  return result.ok ? result.value : []
}

export type PageCommentActions = {
  add: (anchor: PageCommentAnchor | null, body: string) => Promise<boolean>
  reply: (threadId: string, body: string) => Promise<boolean>
  setStatus: (threadId: string, status: PageCommentStatus) => Promise<boolean>
  remove: (threadId: string) => Promise<boolean>
}

export function usePageComments(
  scopeKey: string,
  pageId: string
): { threads: PageCommentThread[]; actions: PageCommentActions } {
  const [threads, setThreads] = useState<PageCommentThread[]>([])
  const refresh = useCallback(() => {
    let stale = false
    void loadPageComments(scopeKey, pageId).then((next) => {
      if (!stale) {
        setThreads(next)
      }
    })
    return () => {
      stale = true
    }
  }, [scopeKey, pageId])

  useEffect(() => refresh(), [refresh])
  useEffect(
    () =>
      commentsAvailable()
        ? window.api.projectPages.onCommentsChanged((change) => {
            if (change.scopeKey === scopeKey && change.pageId === pageId) {
              refresh()
            }
          })
        : undefined,
    [scopeKey, pageId, refresh]
  )

  const run = useCallback(
    async (call: Promise<ProjectPagesResult<unknown>>): Promise<boolean> => {
      const result = await call
      if (!result.ok) {
        toast.error(result.message)
        return false
      }
      refresh()
      return true
    },
    [refresh]
  )
  const api = window.api.projectPages
  const actions: PageCommentActions = {
    add: (anchor, body) => run(api.addComment(scopeKey, pageId, { anchor, body })),
    reply: (threadId, body) => run(api.replyComment(scopeKey, pageId, threadId, { body })),
    setStatus: (threadId, status) => run(api.setCommentStatus(scopeKey, pageId, threadId, status)),
    remove: (threadId) => run(api.deleteComment(scopeKey, pageId, threadId))
  }
  return { threads, actions }
}
