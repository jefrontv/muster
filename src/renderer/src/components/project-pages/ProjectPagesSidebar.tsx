// Left column of the Pages view: search, the page tree and the trash.
import { Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { buildPageTree, pageTitle, trashedPages } from './project-pages-tree-model'
import { ProjectPagesTreeRow } from './ProjectPagesTreeRow'

type Props = {
  pages: ProjectPageMeta[]
  loaded: boolean
  selectedId: string | null
  onSelect: (pageId: string) => void
  onCreate: (parentId: string | null) => void
  onTrash: (pageId: string) => void
  onRestore: (pageId: string) => void
  /** Replaces the default column width and border, e.g. inside the right sidebar. */
  className?: string
}

export function ProjectPagesSidebar({
  pages,
  loaded,
  selectedId,
  onSelect,
  onCreate,
  onTrash,
  onRestore,
  className = 'w-[clamp(14rem,26%,18rem)] shrink-0 border-r border-border'
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showTrash, setShowTrash] = useState(false)
  const tree = useMemo(() => buildPageTree(pages, query), [pages, query])
  const trash = useMemo(() => trashedPages(pages), [pages])

  const toggle = (pageId: string): void =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(pageId)) {
        next.add(pageId)
      }
      return next
    })
  const addChild = (pageId: string): void => {
    setExpanded((current) => new Set(current).add(pageId))
    onCreate(pageId)
  }

  return (
    <aside className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex shrink-0 items-center gap-1.5 p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            className="h-8 pl-7"
            placeholder={translate('auto.components.projectPages.search', 'Search pages')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={translate('auto.components.projectPages.newPage', 'New page')}
          onClick={() => onCreate(null)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-2 pb-3">
        {loaded && tree.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {query
              ? translate('auto.components.projectPages.noMatch', 'No pages match.')
              : translate('auto.components.projectPages.empty', 'No pages yet. Add one with +.')}
          </p>
        ) : null}
        {tree.map((node) => (
          <ProjectPagesTreeRow
            key={node.page.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            expanded={expanded}
            forceExpanded={query.trim().length > 0}
            onToggle={toggle}
            onSelect={onSelect}
            onAddChild={addChild}
            onTrash={onTrash}
          />
        ))}
      </nav>
      {trash.length > 0 ? (
        <div className="shrink-0 border-t border-border p-2">
          <button
            type="button"
            aria-expanded={showTrash}
            className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/60"
            onClick={() => setShowTrash((open) => !open)}
          >
            <Trash2 className="size-3.5" />
            <span className="flex-1 text-left">
              {translate('auto.components.projectPages.trash', 'Trash')}
            </span>
            <span className="tabular-nums">{trash.length}</span>
          </button>
          {showTrash ? (
            <ul className="mt-1 max-h-48 overflow-y-auto scrollbar-sleek">
              {trash.map((page) => (
                <li
                  key={page.id}
                  className="flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-xs text-muted-foreground hover:bg-accent/60"
                >
                  <span className="min-w-0 flex-1 truncate">{pageTitle(page)}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.projectPages.restore',
                      'Restore {{value0}}',
                      { value0: pageTitle(page) }
                    )}
                    onClick={() => onRestore(page.id)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
