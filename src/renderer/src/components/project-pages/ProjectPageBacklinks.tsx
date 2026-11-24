// "Linked from": live pages in this space whose body links here.
import { FileText } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { pageTitle } from './project-pages-tree-model'

type Props = {
  scopeKey: string
  pageId: string
  /** Changes whenever any page in the space is saved, so the list refreshes. */
  spaceVersion: string
  onOpenPage: (pageId: string) => void
}

export function ProjectPageBacklinks({
  scopeKey,
  pageId,
  spaceVersion,
  onOpenPage
}: Props): React.JSX.Element | null {
  const [pages, setPages] = useState<ProjectPageMeta[]>([])

  useEffect(() => {
    let stale = false
    void window.api.projectPages.backlinks(scopeKey, pageId).then((result) => {
      if (!stale) {
        setPages(result.ok ? result.value : [])
      }
    })
    return () => {
      stale = true
    }
  }, [scopeKey, pageId, spaceVersion])

  if (pages.length === 0) {
    return null
  }
  return (
    <section className="mx-8 mb-8 mt-4 border-t border-border pt-3">
      <h2 className="mb-1.5 text-xs font-medium text-muted-foreground">
        {translate('auto.components.projectPages.linkedFrom', 'Linked from')}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {pages.map((page) => (
          <li key={page.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-foreground hover:bg-accent"
              onClick={() => onOpenPage(page.id)}
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{pageTitle(page)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
