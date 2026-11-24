// Turns a parsed Mermaid flowchart into editable shapes and connectors, laid out in its direction.
import type { Cell, CellStyle, Graph } from '@maxgraph/core'
import type {
  MermaidDirection,
  MermaidEdge,
  MermaidFlowchart,
  MermaidShape
} from '../../../../shared/project-pages-diagram-mermaid'
import { viewCenter } from './project-pages-diagram-actions'
import { flowLayout, type LayoutDirection } from './project-pages-diagram-layout'

// draw.io names (process, parallelogram, trapezoid) open correctly there even where maxGraph draws a box.
const SHAPE_STYLES: Record<MermaidShape, Record<string, unknown>> = {
  rect: {},
  rounded: { rounded: 1 },
  stadium: { rounded: 1, arcSize: 50 },
  subroutine: { shape: 'process' },
  cylinder: { shape: 'cylinder' },
  circle: { baseStyleNames: ['ellipse'], aspect: 'fixed' },
  flag: { shape: 'step', perimeter: 'stepPerimeter' },
  rhombus: { baseStyleNames: ['rhombus'] },
  hexagon: { shape: 'hexagon', perimeter: 'hexagonPerimeter2' },
  parallelogram: { shape: 'parallelogram', perimeter: 'parallelogramPerimeter' },
  trapezoid: { shape: 'trapezoid', perimeter: 'trapezoidPerimeter' }
}

const DIRECTIONS: Record<MermaidDirection, LayoutDirection> = {
  TB: 'north',
  BT: 'south',
  LR: 'west',
  RL: 'east'
}

function size(label: string, shape: MermaidShape): [number, number] {
  const longest = Math.max(...label.split('\n').map((line) => line.length), 1)
  const width = Math.min(220, Math.max(90, longest * 7.5 + 40))
  if (shape === 'circle') {
    const d = Math.max(70, longest * 7 + 24)
    return [d, d]
  }
  return shape === 'rhombus' ? [width + 40, 80] : [width, 50]
}

function edgeStyle(edge: MermaidEdge): CellStyle {
  const marker = { arrow: 'classic', circle: 'oval', cross: 'cross', none: 'none' }[edge.end]
  return {
    endArrow: marker,
    ...(edge.start ? { startArrow: 'classic' } : {}),
    ...(edge.dashed ? { dashed: true } : {}),
    ...(edge.thick ? { strokeWidth: 2 } : {})
  } as CellStyle
}

function commonParent(a: Cell, b: Cell): Cell {
  const above = new Set<Cell>()
  for (let cell = a.getParent(); cell; cell = cell.getParent()) {
    above.add(cell)
  }
  let cell = b.getParent()
  while (cell && !above.has(cell)) {
    cell = cell.getParent()
  }
  return cell ?? a.getParent()!
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

/** Inserts the chart centred in the view as one undo step and selects it. */
export function insertMermaid(graph: Graph, chart: MermaidFlowchart): Cell[] {
  const root = graph.getDefaultParent()
  const direction = DIRECTIONS[chart.direction]
  const centre = viewCenter(graph)
  let created: Cell[] = []
  graph.batchUpdate(() => {
    // A temporary frame keeps the layout away from shapes already on the canvas.
    const frame = graph.insertVertex({
      parent: root,
      value: '',
      position: [0, 0],
      size: [10, 10],
      style: { baseStyleNames: ['group'] }
    })
    const groups = new Map<string, Cell>()
    for (const group of chart.groups) {
      const parent = (group.parent && groups.get(group.parent)) || frame
      groups.set(
        group.id,
        graph.insertVertex({
          parent,
          value: escapeHtml(group.label),
          position: [0, 0],
          size: [200, 140],
          style: { baseStyleNames: ['swimlane'], html: 1, whiteSpace: 'wrap' } as CellStyle
        })
      )
    }
    const nodes = new Map<string, Cell>()
    for (const node of chart.nodes) {
      const [width, height] = size(node.label, node.shape)
      nodes.set(
        node.id,
        graph.insertVertex({
          parent: (node.group && groups.get(node.group)) || frame,
          value: escapeHtml(node.label),
          position: [0, 0],
          size: [width, height],
          style: { ...SHAPE_STYLES[node.shape], html: 1, whiteSpace: 'wrap' } as CellStyle
        })
      )
    }
    for (const edge of chart.edges) {
      const source = nodes.get(edge.from)!
      const target = nodes.get(edge.to)!
      graph.insertEdge({
        parent: commonParent(source, target),
        value: edge.label ? escapeHtml(edge.label) : '',
        source,
        target,
        style: edgeStyle(edge)
      })
    }
    // Innermost subgraphs first, so each container is sized before its parent lays it out.
    for (const group of [...groups.values()].toReversed()) {
      flowLayout(graph, group, direction)
      graph.updateGroupBounds([group], 20, false, 30)
    }
    flowLayout(graph, frame, direction)
    graph.updateGroupBounds([frame], 0, true)
    const box = frame.getGeometry()!
    graph.moveCells([frame], centre.x - box.width / 2 - box.x, centre.y - box.height / 2 - box.y)
    created = graph.ungroupCells([frame])
  })
  graph.setSelectionCells(created)
  return created
}
