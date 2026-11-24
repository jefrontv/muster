// Applies an agent's diagram edit to the model in one batch: remove, add, connect, update, move,
// Mermaid, placement, then layout. Any bad row throws, and nothing is saved.
import { EventObject, type Cell, type CellStyle, type Graph } from '@maxgraph/core'
import type {
  DiagramAgentConnect,
  DiagramAgentEdit,
  DiagramAgentLayout,
  DiagramAgentShape,
  DiagramEditResult
} from '../../../../shared/project-pages-diagram-agent'
import { parseMermaidFlowchart } from '../../../../shared/project-pages-diagram-mermaid'
import { diagramOutlineText } from '../../../../shared/project-pages-diagram-outline'
import { writeDiagramXml } from '../../../../shared/project-pages-diagram-xml'
import { overlappingShapes, placeNewShapes } from './project-pages-diagram-agent-place'
import { agentColor, agentShape, cellRefs, labelOf } from './project-pages-diagram-agent-refs'
import { flowLayout, runLayout } from './project-pages-diagram-layout'
import { commonParent, insertMermaid } from './project-pages-diagram-mermaid-insert'
import { snapshotDiagram, type PagesCell } from './project-pages-diagram-model'

const AGENT_ID = /^[A-Za-z0-9_-]{1,40}$/
const LABEL_BELOW = ['start', 'end', 'actor']
const SHAPE_KEYS = ['shape', 'baseStyleNames', 'rounded', 'arcSize', 'aspect', 'perimeter']

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

function newId(graph: Graph, id: unknown): string | undefined {
  if (id === undefined) {
    return undefined
  }
  if (typeof id !== 'string' || !AGENT_ID.test(id)) {
    throw new Error(`id "${String(id)}" must be letters, digits, - or _ (up to 40).`)
  }
  if (graph.getDataModel().getCell(id)) {
    throw new Error(`id "${id}" is already used.`)
  }
  return id
}

function setLink(cell: Cell, link: unknown): void {
  const pages = cell as PagesCell
  const { link: _old, ...rest } = pages.pagesAttrs ?? {}
  pages.pagesAttrs = typeof link === 'string' && link ? { ...rest, link } : rest
}

function lineStyle(row: Pick<DiagramAgentConnect, 'dashed' | 'arrow'>): Record<string, unknown> {
  const style: Record<string, unknown> = {}
  if (row.dashed !== undefined) {
    style.dashed = row.dashed ? 1 : 0
  }
  if (row.arrow) {
    style.endArrow = row.arrow === 'none' ? 'none' : 'classic'
    style.startArrow = row.arrow === 'both' ? 'classic' : 'none'
  }
  return style
}

/** New shapes get room for their label: wider first, then taller. */
function fitLabel(graph: Graph, cell: Cell, row: DiagramAgentShape, shapeId: string): void {
  const text = labelOf(cell)
  if (!text || row.width || row.height || ['circle', 'start', 'end', 'actor'].includes(shapeId)) {
    return
  }
  const geometry = cell.getGeometry()!.clone()
  const roomy = shapeId === 'rhombus' || shapeId === 'hexagon' ? 1.4 : 1
  geometry.width = Math.max(geometry.width, Math.min(240, text.length * 7 + 32) * roomy)
  const preferred = graph.getPreferredSizeForCell(cell, geometry.width / roomy)
  if (preferred) {
    geometry.height = Math.max(geometry.height, Math.ceil((preferred.height * roomy) / 10) * 10)
  }
  graph.getDataModel().setGeometry(cell, geometry)
}

export function applyAgentEdit(graph: Graph, edit: DiagramAgentEdit): DiagramEditResult {
  const model = graph.getDataModel()
  const named = new Map<string, Cell>()
  const ref = cellRefs(graph, named)
  const created: Record<string, string> = {}
  const fresh: Cell[] = []
  const container = (value: string): Cell =>
    value === 'root' ? graph.getDefaultParent() : ref(value)

  graph.batchUpdate(() => {
    // Removals go first, so one call can replace a shape and reuse its id.
    if (edit.remove?.length) {
      graph.removeCells(
        edit.remove.map((target) => ref(target)),
        true
      )
    }
    for (const row of edit.add ?? []) {
      const shape = agentShape(row.shape)
      const id = newId(graph, row.id)
      const cell = graph.insertVertex({
        parent: row.in ? container(row.in) : graph.getDefaultParent(),
        id,
        value: row.label ? escapeHtml(row.label) : '',
        position: [row.x ?? 0, row.y ?? 0],
        size: [row.width ?? shape.width, row.height ?? shape.height],
        style: {
          ...shape.style,
          html: 1,
          whiteSpace: 'wrap',
          ...(LABEL_BELOW.includes(shape.id)
            ? { verticalLabelPosition: 'bottom', verticalAlign: 'top' }
            : {}),
          ...agentColor(row.color)
        } as CellStyle
      })
      setLink(cell, row.link)
      fitLabel(graph, cell, row, shape.id)
      if (typeof row.x !== 'number' || typeof row.y !== 'number') {
        fresh.push(cell)
      }
      const key = row.id ?? row.label ?? cell.getId()!
      named.set(key, cell)
      created[key] = cell.getId()!
    }
    for (const row of edit.connect ?? []) {
      const source = ref(row.from)
      const target = ref(row.to)
      const edge = graph.insertEdge({
        parent: commonParent(source, target),
        id: newId(graph, row.id),
        value: row.label ? escapeHtml(row.label) : '',
        source,
        target,
        style: lineStyle({ arrow: 'end', ...row }) as CellStyle
      })
      if (row.id) {
        named.set(row.id, edge)
        created[row.id] = edge.getId()!
      }
    }
    for (const row of edit.update ?? []) {
      const cell = ref(row.target)
      if (row.label !== undefined) {
        graph.labelChanged(cell, escapeHtml(row.label), new EventObject())
      }
      if (row.shape !== undefined) {
        const style = Object.fromEntries(
          Object.entries(cell.getStyle()).filter(([key]) => !SHAPE_KEYS.includes(key))
        )
        model.setStyle(cell, { ...style, ...agentShape(row.shape).style } as CellStyle)
      }
      for (const [key, value] of Object.entries({ ...agentColor(row.color), ...lineStyle(row) })) {
        graph.setCellStyles(key as never, value as never, [cell])
      }
      if (row.link !== undefined) {
        setLink(cell, row.link)
      }
    }
    for (const row of edit.move ?? []) {
      const cell = ref(row.target)
      if (row.in) {
        model.add(container(row.in), cell)
      }
      const geometry = cell.getGeometry()?.clone()
      if (!geometry) {
        continue
      }
      geometry.x = (row.x ?? geometry.x) + (row.dx ?? 0)
      geometry.y = (row.y ?? geometry.y) + (row.dy ?? 0)
      geometry.width = row.width ?? geometry.width
      geometry.height = row.height ?? geometry.height
      model.setGeometry(cell, geometry)
      if (row.in && row.x === undefined && row.y === undefined) {
        fresh.push(cell)
      }
    }
    if (edit.mermaid) {
      addMermaid(graph, edit.mermaid)
    }
    placeNewShapes(graph, fresh)
    if (edit.layout) {
      const layout = typeof edit.layout === 'string' ? { kind: edit.layout } : edit.layout
      layoutDeep(
        graph,
        layout.kind,
        layout.container ? ref(layout.container) : graph.getDefaultParent()
      )
    }
  })

  const cells = snapshotDiagram(graph)
  const name = (cell: Cell): string => labelOf(cell) || cell.getId()!
  return {
    xml: writeDiagramXml(cells),
    outline: diagramOutlineText(cells),
    created,
    shapes: cells.filter((c) => c.vertex && !cells.find((p) => p.id === c.parent)?.edge).length,
    connections: cells.filter((c) => c.edge).length,
    overlaps: overlappingShapes(graph).map((pair) => pair.map(name))
  }
}

/** Flow layouts run inside containers first, innermost out, so every level reads the same way. */
function layoutDeep(graph: Graph, kind: DiagramAgentLayout, parent: Cell): void {
  if (kind === 'down' || kind === 'right') {
    const containers: Cell[] = []
    const walk = (cell: Cell): void => {
      for (const child of cell.getChildren().filter((c) => c.isVertex())) {
        walk(child)
        if (child.getChildren().some((c) => c.isVertex())) {
          containers.push(child)
        }
      }
    }
    walk(parent)
    for (const container of containers) {
      flowLayout(graph, container, kind === 'down' ? 'north' : 'west')
      graph.updateGroupBounds([container], 20, false, 30)
    }
  }
  runLayout(graph, kind, parent)
}

/** Mermaid lands to the right of what is already there instead of on top of it. */
function addMermaid(graph: Graph, source: string): void {
  const before = graph
    .getDefaultParent()
    .getChildren()
    .filter((c) => c.isVertex())
  const added = insertMermaid(graph, parseMermaidFlowchart(source)).filter((c) => c.isVertex())
  if (!before.length || !added.length) {
    return
  }
  const old = graph.getBoundingBoxFromGeometry(before)!
  const now = graph.getBoundingBoxFromGeometry(added)!
  graph.moveCells(added, old.x + old.width + 80 - now.x, old.y - now.y)
}
