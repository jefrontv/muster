// The page map: pages and #tags as a force-directed graph, Obsidian style. Click a page to open
// it, a tag to centre the map on it; drag to move, scroll to zoom.
import { Maximize, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { parseActiveCollabUrl } from '../../../../shared/project-pages-activecollab-links'
import type { PagesGraph, PagesGraphNode } from '../../../../shared/project-pages-graph-types'
import { activeCollabInstance, openActiveCollabRef } from './project-pages-activecollab-data'
import { visibleGraph, type MapFilters } from './project-pages-map-model'
import { useProjectPagesMapCanvas } from './use-project-pages-map-canvas'

type Props = {
  scopeKey: string
  /** Changes whenever a page does, so the map refreshes. */
  version: string
  currentPageId: string | null
  focus: string | null
  onFocusChange: (focus: string | null) => void
  onOpenPage: (pageId: string) => void
  onClose: () => void
}

type Toggle = 'tags' | 'tasks' | 'subpages' | 'orphans'
const mapToggles = createLocalizedCatalog((): { key: Toggle; label: string }[] => [
  { key: 'tags', label: translate('auto.components.projectPages.map.tags', 'Tags') },
  { key: 'tasks', label: translate('auto.components.projectPages.map.tasks', 'Tasks') },
  { key: 'subpages', label: translate('auto.components.projectPages.map.subpages', 'Subpages') },
  { key: 'orphans', label: translate('auto.components.projectPages.map.unlinked', 'Unlinked') }
])
const EMPTY: PagesGraph = { nodes: [], edges: [] }

export function ProjectPagesMap(props: Props): React.JSX.Element {
  const { scopeKey, version, currentPageId, focus, onFocusChange, onOpenPage, onClose } = props
  const [graph, setGraph] = useState<PagesGraph>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Omit<MapFilters, 'focus'>>({
    tags: true,
    tasks: false,
    subpages: false,
    orphans: true,
    depth: 1
  })

  useEffect(() => {
    let stale = false
    void window.api.projectPages.graph(scopeKey).then((result) => {
      if (!stale && result.ok) {
        setGraph(result.value)
        setLoaded(true)
      }
    })
    return () => {
      stale = true
    }
  }, [scopeKey, version])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        if (focus) {
          onFocusChange(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, onFocusChange, onClose])

  const visible = useMemo(() => visibleGraph(graph, { ...filters, focus }), [graph, filters, focus])
  const match = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? new Set(
          visible.nodes.filter((n) => n.label.toLowerCase().includes(needle)).map((n) => n.id)
        )
      : null
  }, [visible, query])
  const pick = (node: PagesGraphNode): void => {
    if (node.kind === 'page') {
      onOpenPage(node.id)
    } else if (node.kind === 'task') {
      const instance = activeCollabInstance()
      const ref = instance ? parseActiveCollabUrl(node.href, instance) : null
      if (ref) {
        openActiveCollabRef(ref)
      } else {
        void window.api.shell.openUrl(node.href)
      }
    } else {
      onFocusChange(node.id)
    }
  }
  const map = useProjectPagesMapCanvas({
    graph: visible,
    current: currentPageId,
    match,
    onPick: pick
  })
  const focusNode = graph.nodes.find((node) => node.id === focus)
  const pageCount = visible.nodes.filter((node) => node.kind === 'page').length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
          placeholder={translate('auto.components.projectPages.map.filter', 'Filter…')}
          aria-label={translate('auto.components.projectPages.map.filter', 'Filter…')}
          className="h-7 w-44 text-xs"
        />
        {mapToggles().map((toggle) => (
          <Button
            key={toggle.key}
            size="xs"
            variant={filters[toggle.key] ? 'secondary' : 'ghost'}
            aria-pressed={filters[toggle.key]}
            disabled={toggle.key === 'orphans' && Boolean(focus)}
            onClick={() => setFilters((f) => ({ ...f, [toggle.key]: !f[toggle.key] }))}
          >
            {toggle.label}
          </Button>
        ))}
        {focusNode ? (
          <span className="flex items-center gap-1 rounded-md bg-accent py-0.5 pr-1 pl-2 text-xs">
            {focusNode.kind === 'tag' ? `#${focusNode.label}` : focusNode.label}
            <Button
              size="xs"
              variant="ghost"
              className="h-5 px-1.5"
              onClick={() => setFilters((f) => ({ ...f, depth: f.depth === 1 ? 2 : 1 }))}
              title={translate('auto.components.projectPages.map.depth', 'Links away')}
            >
              {filters.depth === 1
                ? translate('auto.components.projectPages.map.oneHop', '1 hop')
                : translate('auto.components.projectPages.map.twoHops', '2 hops')}
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={translate('auto.components.projectPages.map.showAll', 'Show all')}
              onClick={() => onFocusChange(null)}
            >
              <X className="size-3" />
            </Button>
          </span>
        ) : currentPageId ? (
          <Button size="xs" variant="ghost" onClick={() => onFocusChange(currentPageId)}>
            {translate('auto.components.projectPages.map.aroundPage', 'Around this page')}
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {pageCount === 1
            ? translate('auto.components.projectPages.map.onePage', '1 page')
            : translate('auto.components.projectPages.map.pages', '{{value0}} pages', {
                value0: pageCount
              })}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={translate('auto.components.projectPages.map.fit', 'Fit to view')}
          title={translate('auto.components.projectPages.map.fit', 'Fit to view')}
          onClick={map.fit}
        >
          <Maximize className="size-4" />
        </Button>
      </div>
      <div ref={map.wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={map.canvasRef}
          className="absolute inset-0 size-full touch-none"
          aria-label={translate('auto.components.projectPages.map.label', 'Page map')}
          {...map.handlers}
        />
        {loaded && visible.nodes.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            {graph.nodes.length === 0
              ? translate('auto.components.projectPages.map.empty', 'No pages yet.')
              : translate(
                  'auto.components.projectPages.map.filtered',
                  'Nothing matches these filters.'
                )}
          </p>
        ) : null}
      </div>
    </div>
  )
}
