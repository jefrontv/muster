// Shape palette: search, click to add in the middle of the view, or drag onto the canvas.
import { gestureUtils, type Graph } from '@maxgraph/core'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { insertShape } from './project-pages-diagram-actions'
import { DIAGRAM_SHAPES, type DiagramShape } from './project-pages-diagram-styles'
import { diagramShapeLabel } from './project-pages-diagram-shape-labels'

const ICONS: Record<string, React.ReactNode> = {
  rect: <rect x="3" y="6" width="18" height="12" />,
  rounded: <rect x="3" y="6" width="18" height="12" rx="3" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="6" />,
  circle: <circle cx="12" cy="12" r="7" />,
  rhombus: <path d="M12 4 21 12 12 20 3 12Z" />,
  triangle: <path d="M12 4 20 19H4Z" />,
  hexagon: <path d="M7 6h10l4 6-4 6H7l-4-6Z" />,
  cylinder: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
    </>
  ),
  cloud: <path d="M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 8.5Z" />,
  actor: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M12 9v6m-5-4h10m-8 9 3-5 3 5" />
    </>
  ),
  note: <path d="M4 5h16v10l-5 5H4Zm11 15v-5h5" />,
  text: <path d="M6 7V5h12v2M12 5v14m-3 0h6" />,
  container: <path d="M3 5h18v15H3Zm0 4h18" />,
  start: <circle cx="12" cy="12" r="5" fill="currentColor" />,
  end: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </>
  )
}

function PaletteTile(props: { graph: Graph | null; shape: DiagramShape; compact: boolean }) {
  const { graph, shape } = props
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!graph || !ref.current) {
      return
    }
    const source = gestureUtils.makeDraggable(ref.current, graph, (target, _event, _cell, x, y) =>
      insertShape(target as Graph, shape, (x ?? 0) + shape.width / 2, (y ?? 0) + shape.height / 2)
    )
    return () => {
      source.setEnabled(false)
      source.reset()
    }
  }, [graph, shape])

  return (
    <button
      ref={ref}
      type="button"
      title={diagramShapeLabel(shape)}
      className="flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={() => graph && insertShape(graph, shape)}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        aria-hidden
      >
        {ICONS[shape.id]}
      </svg>
      <span className={props.compact ? 'sr-only' : 'w-full truncate text-center'}>
        {diagramShapeLabel(shape)}
      </span>
    </button>
  )
}

/** compact is a one-column icon rail: shapes still click or drag in, without search or labels. */
export function ProjectPageDiagramPalette(props: { graph: Graph | null; compact: boolean }) {
  const { graph, compact } = props
  const [query, setQuery] = useState('')
  const shapes = useMemo(() => {
    const words = compact ? [] : query.toLowerCase().split(/\s+/).filter(Boolean)
    return DIAGRAM_SHAPES.filter((shape) => {
      const haystack = `${diagramShapeLabel(shape)} ${shape.label} ${shape.keywords}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }, [query, compact])

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-r border-border transition-[width] duration-200 ease-out motion-reduce:transition-none ${compact ? 'w-12' : 'w-48'}`}
    >
      <div className={compact ? 'hidden' : 'relative p-2'}>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          className="h-8 pl-7"
          placeholder={translate(
            'auto.components.projectPages.diagram.searchShapes',
            'Search shapes'
          )}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div
        className={`grid content-start gap-0.5 overflow-y-auto scrollbar-sleek pb-2 ${compact ? 'grid-cols-1 px-1 pt-2' : 'grid-cols-3 px-2'}`}
      >
        {shapes.map((shape) => (
          <PaletteTile key={shape.id} graph={graph} shape={shape} compact={compact} />
        ))}
        {shapes.length === 0 ? (
          <p className="col-span-3 px-1 py-2 text-xs text-muted-foreground">
            {translate('auto.components.projectPages.diagram.noShapes', 'No matching shapes')}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
