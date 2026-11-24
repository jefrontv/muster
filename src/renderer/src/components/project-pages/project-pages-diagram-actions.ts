// Editing actions shared by the palette, toolbar, format panel, and quick-connect arrows.
import type { Cell, CellStateStyle, CellStyle, Graph } from '@maxgraph/core'
import type { DiagramShape } from './project-pages-diagram-styles'

export type QuickConnectSide = 'up' | 'right' | 'down' | 'left'

/** The middle of the visible canvas, in model coordinates. */
export function viewCenter(graph: Graph): { x: number; y: number } {
  const view = graph.getView()
  const rect = graph.container.getBoundingClientRect()
  return {
    x: rect.width / 2 / view.scale - view.translate.x,
    y: rect.height / 2 / view.scale - view.translate.y
  }
}

/** Adds a shape centred on (x, y), or on the view, selects it, and returns it. */
export function insertShape(graph: Graph, shape: DiagramShape, x?: number, y?: number): Cell {
  const at = x === undefined || y === undefined ? viewCenter(graph) : { x, y }
  let cell: Cell | null = null
  graph.batchUpdate(() => {
    cell = graph.insertVertex({
      parent: graph.getDefaultParent(),
      value: shape.id === 'text' ? 'Text' : '',
      position: [graph.snap(at.x - shape.width / 2), graph.snap(at.y - shape.height / 2)],
      size: [shape.width, shape.height],
      style: { ...shape.style, html: 1, whiteSpace: 'wrap' } as CellStyle
    })
  })
  graph.setSelectionCell(cell!)
  return cell!
}

const OFFSETS: Record<QuickConnectSide, (w: number, h: number) => [number, number]> = {
  up: (_w, h) => [0, -(h + 60)],
  right: (w) => [w + 60, 0],
  down: (_w, h) => [0, h + 60],
  left: (w) => [-(w + 60), 0]
}

/** draw.io's blue arrows: copies the shape to one side, joins them, selects the copy. */
export function quickConnect(graph: Graph, source: Cell, side: QuickConnectSide): void {
  const geo = source.getGeometry()
  const parent = source.getParent()
  if (!geo || !parent) {
    return
  }
  const [dx, dy] = OFFSETS[side](geo.width, geo.height)
  let copy: Cell | null = null
  graph.batchUpdate(() => {
    copy = graph.cloneCell(source)
    copy.setValue('')
    copy.getGeometry()?.translate(dx, dy)
    graph.addCell(copy, parent)
    graph.insertEdge({ parent, source, target: copy })
  })
  graph.setSelectionCell(copy!)
}

export function setSelectionStyle(graph: Graph, key: keyof CellStateStyle, value: unknown): void {
  graph.setCellStyles(key, value as never, graph.getSelectionCells())
}

/** Sets several style keys in one undo step; undefined removes a key so the theme default applies. */
export function patchSelectionStyle(
  graph: Graph,
  patch: Partial<Record<keyof CellStateStyle, unknown>>
): void {
  graph.batchUpdate(() => {
    for (const [key, value] of Object.entries(patch)) {
      setSelectionStyle(graph, key as keyof CellStateStyle, value)
    }
  })
}

/** The first selected cell's resolved style, for showing current values in the format panel. */
export function selectionStyle(graph: Graph): CellStyle {
  const cell = graph.getSelectionCell()
  return (cell && graph.getView().getState(cell)?.style) || {}
}
