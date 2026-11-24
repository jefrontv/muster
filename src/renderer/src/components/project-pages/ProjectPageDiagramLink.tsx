// Format panel section: link the selected shape to a page or an ActiveCollab task.
import type { Cell, Graph } from '@maxgraph/core'
import { ExternalLink, Unlink } from 'lucide-react'
import { useEffect, useReducer, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { onActiveCollabPageData, pageTask } from './project-pages-activecollab-data'
import {
  cellLink,
  linkStatus,
  pageHref,
  readLink,
  setCellLink,
  type DiagramLink
} from './project-pages-diagram-links'
import { pageTitle } from './project-pages-tree-model'

const t = (key: string, fallback: string): string =>
  translate(`auto.components.projectPages.diagram.${key}`, fallback)

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  done: 'Done',
  late: 'Overdue',
  missing: 'Closed or not visible',
  loading: 'Loading…'
}

function linkLabel(link: DiagramLink, pages: ProjectPageMeta[]): string {
  if (link.kind === 'page') {
    const page = pages.find((p) => p.id === link.pageId)
    return page ? pageTitle(page) : t('missingPage', 'Missing page')
  }
  if (link.kind === 'activecollab' && link.ref.kind === 'task') {
    return pageTask(link.ref)?.name ?? t('task', 'ActiveCollab task')
  }
  return link.href
}

export function ProjectPageDiagramLink(props: {
  graph: Graph
  cell: Cell
  pages: ProjectPageMeta[]
  onOpen: (link: DiagramLink) => void
}) {
  const { graph, cell, pages, onOpen } = props
  const [query, setQuery] = useState('')
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => onActiveCollabPageData(redraw), [])
  const href = cellLink(cell)
  const link = href ? readLink(href) : null
  const words = query.trim().toLowerCase()
  const isUrl = /^https?:\/\//i.test(words)
  const matches =
    words && !isUrl
      ? pages
          .filter((p) => p.archivedAt === null && pageTitle(p).toLowerCase().includes(words))
          .slice(0, 6)
      : []
  const pick = (target: string): void => {
    setCellLink(graph, cell, target)
    setQuery('')
  }

  return (
    <section className="space-y-2 border-b border-border px-3 py-3">
      <h3 className="text-xs font-medium text-muted-foreground">{t('link', 'Link')}</h3>
      {link ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left hover:underline"
            title={link.href}
            onClick={() => onOpen(link)}
          >
            {linkLabel(link, pages)}
          </button>
          {link.kind === 'activecollab' ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {STATUS_LABELS[linkStatus(link)] ?? ''}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('openLink', 'Open link')}
            onClick={() => onOpen(link)}
          >
            <ExternalLink className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('removeLink', 'Remove link')}
            onClick={() => setCellLink(graph, cell, null)}
          >
            <Unlink className="size-4" />
          </Button>
        </div>
      ) : (
        <>
          <Input
            value={query}
            className="h-8"
            placeholder={t('linkPlaceholder', 'Find a page or paste a task URL')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (isUrl || matches[0])) {
                pick(isUrl ? query.trim() : pageHref(matches[0].id))
              }
            }}
          />
          {matches.map((page) => (
            <button
              key={page.id}
              type="button"
              className="block w-full truncate rounded-md px-2 py-1 text-left hover:bg-accent"
              onClick={() => pick(pageHref(page.id))}
            >
              {pageTitle(page)}
            </button>
          ))}
        </>
      )}
    </section>
  )
}
