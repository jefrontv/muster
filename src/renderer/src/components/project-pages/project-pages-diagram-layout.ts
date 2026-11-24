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
      layout.execute(parent)
    } else {
      new CircleLayout(graph).execute(parent)
    }
    if (parent !== graph.getDefaultParent()) {
      graph.updateGroupBounds([parent], 20, false, 30)
    }
  })
}
