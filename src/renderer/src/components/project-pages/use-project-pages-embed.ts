import { useEffect } from 'react'

/** Set when Pages runs inside a project tab: one fixed project, no picker, no back button. */
export type ProjectPagesEmbed = {
  scopeKey: string
  pageId: string | null
  request: number
  onShowPage: (pageId: string | null, title: string | null) => void
}

/** Follows the tab's open requests and reports the page shown back to it. */
export function useProjectPagesEmbed(
  embedded: ProjectPagesEmbed | undefined,
  pageId: string | null,
  title: string | null,
  select: (pageId: string) => void
): void {
  const askedPageId = embedded?.pageId
  const askedRequest = embedded?.request
  useEffect(() => {
    if (askedPageId) {
      select(askedPageId)
    }
    // Only a new request re-selects; the page the tab already shows is not a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedRequest])

  const onShowPage = embedded?.onShowPage
  useEffect(() => {
    onShowPage?.(pageId, title)
  }, [onShowPage, pageId, title])
}
