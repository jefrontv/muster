// One-click auto-layouts for the whole diagram or the selected container.
import {
  CircleLayout,
  CompactTreeLayout,
  FastOrganicLayout,
  HierarchicalLayout,
  type Cell,
  type Graph
} from '@maxgraph/core'

export type DiagramLayoutKind = 'down' | 'right' | 'tree' | 'organic' | 'circle'
export type LayoutDirection = 'north' | 'south' | 'east' | 'west'

export const DIAGRAM_LAYOUTS: { id: DiagramLayoutKind; label: string }[] = [
  { id: 'down', label: 'Flow top to bottom' },
  { id: 'right', label: 'Flow left to right' },
  { id: 'tree', label: 'Tree' },
  { id: 'organic', label: 'Organic' },
  { id: 'circle', label: 'Circle' }
]

/** A selected container lays out its own contents; otherwise the whole diagram. */
export function layoutParent(graph: Graph): Cell {
  const cell = graph.getSelectionCell()
  const isContainer = cell?.isVertex() && cell.getChildren().some((child) => child.isVertex())
  return isContainer ? cell : graph.getDefaultParent()
}

function descendantEdges(parent: Cell): Cell[] {
  return parent
    .getChildren()
    .flatMap((child) => (child.isEdge() ? [child] : descendantEdges(child)))
}

const PORTS: Record<LayoutDirection, [number, number, number, number]> = {
  north: [0.5, 1, 0.5, 0],
  south: [0.5, 0, 0.5, 1],
  west: [1, 0.5, 0, 0.5],
  east: [0, 0.5, 1, 0.5]
}

// Edges running back loop round the outside: under a left-to-right flow, beside a top-down one.
const BACK_PORTS: Record<LayoutDirection, [number, number, number, number]> = {
  north: [1, 0.5, 1, 0.5],
  south: [0, 0.5, 0, 0.5],
  west: [0.5, 1, 0.5, 1],
  east: [0.5, 0, 0.5, 0]
}

function absoluteBox(cell: Cell): { x: number; y: number; width: number; height: number } {
  const g = cell.getGeometry()!
  const box = { x: g.x, y: g.y, width: g.width, height: g.height }
  for (let p = cell.getParent(); p; p = p.getParent()) {
    box.x += p.getGeometry()?.x ?? 0
    box.y += p.getGeometry()?.y ?? 0
  }
  return box
}

/** An edge running with the flow leaves the far side and enters the near side, so it passes between
 * ranks instead of through the shapes beside it. */
function pinFlowPorts(graph: Graph, edge: Cell, direction: LayoutDirection): void {
  const source = edge.getTerminal(true)
  const target = edge.getTerminal(false)
  if (!source?.getGeometry() || !target?.getGeometry()) {
    return
  }
  const a = absoluteBox(source)
  const b = absoluteBox(target)
  const forward = {
    north: b.y >= a.y + a.height,
    south: b.y + b.height <= a.y,
    west: b.x >= a.x + a.width,
    east: b.x + b.width <= a.x
  }[direction]
  const values = forward ? PORTS[direction] : BACK_PORTS[direction]
  ;(['exitX', 'exitY', 'entryX', 'entryY'] as const).forEach((key, i) =>
    graph.setCellStyles(key, values[i] as never, [edge])
  )
}

/**
 * Lays out parent's direct children only. An edge into a nested container ranks that container,
 * through a temporary edge, so nested shapes stay where their own container put them.
 */
export function flowLayout(graph: Graph, parent: Cell, direction: LayoutDirection): void {
  const kids = new Set(parent.getChildren().filter((child) => child.isVertex()))
  const topOf = (cell: Cell | null): Cell | null => {
    let current = cell
    while (current && !kids.has(current)) {
      current = current.getParent()
    }
    return current
  }
  graph.batchUpdate(() => {
    const proxies: Cell[] = []
    for (const edge of descendantEdges(parent)) {
      const source = edge.getTerminal(true)
      const target = edge.getTerminal(false)
      const from = topOf(source)
      const to = topOf(target)
      if (from && to && from !== to && (from !== source || to !== target)) {
        proxies.push(graph.insertEdge({ parent, source: from, target: to, value: '' }))
      }
    }
    const layout = new HierarchicalLayout(graph, direction)
    layout.traverseAncestors = false
    // Keep each edge's own style; the default sets noEdgeStyle and leaves diagonal lines.
    layout.disableEdgeStyle = false
    layout.intraCellSpacing = 40
    layout.interRankCellSpacing = 70
    layout.findRoots = (_parent, vertices) => {
      // Sources first, else the earliest shape, so cycles read in the order they were drawn.
      const pending = new Set(Object.values(vertices))
      const ordered = parent.getChildren().filter((child) => pending.has(child))
      const sources = ordered.filter(
        (cell) =>
          !cell.edges.some((edge) => {
            const from = edge.getTerminal(true)
            return edge.getTerminal(false) === cell && from !== cell && pending.has(from!)
          })
      )
      return sources.length ? sources : ordered.slice(0, 1)
    }
    layout.execute(parent)
    graph.removeCells(proxies)
    // The layout's waypoints fight the elbow router; it routes cleanly from the new positions alone.
    for (const edge of descendantEdges(parent)) {
      graph.resetEdge(edge)
      pinFlowPorts(graph, edge, direction)
    }
  })
}

/** Runs inside the caller's batch when there is one, so a Mermaid insert stays one undo step. */
export function runLayout(
  graph: Graph,
  kind: DiagramLayoutKind,
  parent = layoutParent(graph)
): void {
  graph.batchUpdate(() => {
    if (kind === 'down' || kind === 'right') {
      flowLayout(graph, parent, kind === 'down' ? 'north' : 'west')
    } else if (kind === 'tree') {
      const layout = new CompactTreeLayout(graph, false)
      layout.levelDistance = 50
      layout.nodeDistance = 30
      layout.execute(parent)
    } else if (kind === 'organic') {
      const layout = new FastOrganicLayout(graph)
      layout.forceConstant = 120
      layout.disableEdgeStyle = false
      layout.execute(parent)
    } else {
      const layout = new CircleLayout(graph)
      layout.disableEdgeStyle = false
      layout.execute(parent)
    }
    if (parent !== graph.getDefaultParent()) {
      graph.updateGroupBounds([parent], 20, false, 30)
    }
  })
}
