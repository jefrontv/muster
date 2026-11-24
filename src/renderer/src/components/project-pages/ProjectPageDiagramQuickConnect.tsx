// Arrows around a lone selected shape: click one to add a connected copy on that side, or drag
// one onto another shape to connect them.
import type { Cell, Graph } from '@maxgraph/core'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { quickConnect, type QuickConnectSide } from './project-pages-diagram-actions'
import { startConnector } from './project-pages-diagram-graph'
import type { DiagramBox } from './use-project-page-diagram-selection'

const SIZE = 20
const GAP = 10

function place(side: QuickConnectSide, box: DiagramBox): { left: number; top: number } {
  const midX = box.x + box.width / 2 - SIZE / 2
  const midY = box.y + box.height / 2 - SIZE / 2
  switch (side) {
    case 'up':
      return { left: midX, top: box.y - SIZE - GAP }
    case 'right':
      return { left: box.x + box.width + GAP, top: midY }
    case 'down':
      return { left: midX, top: box.y + box.height + GAP }
    case 'left':
      return { left: box.x - SIZE - GAP, top: midY }
  }
}

const SIDES = [
  ['up', ArrowUp],
  ['right', ArrowRight],
  ['down', ArrowDown],
  ['left', ArrowLeft]
] as const

export function ProjectPageDiagramQuickConnect({
  graph,
  cell,
  box
}: {
  graph: Graph
  cell: Cell
  box: DiagramBox
}) {
  return (
    <>
      {SIDES.map(([side, Icon]) => (
        <button
          key={side}
          type="button"
          aria-label={translate(
            'auto.components.projectPages.diagram.addConnected',
            'Add a connected shape'
          )}
          className="absolute grid place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground"
          style={{ ...place(side, box), width: SIZE, height: SIZE }}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            if (event.button === 0) {
              startConnector(graph, cell, event.clientX, event.clientY)
            }
          }}
          onClick={() => quickConnect(graph, cell, side)}
        >
          <Icon className="size-3" />
        </button>
      ))}
    </>
  )
}
