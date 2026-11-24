// How agents name things in a diagram: shapes by catalogue name, colours by preset, and cells by
// id or exact label.
import type { Cell, CellStyle, Graph } from '@maxgraph/core'
import { diagramLabel } from '../../../../shared/project-pages-diagram-outline'
import type { DiagramStyle } from '../../../../shared/project-pages-diagram-xml'
import {
  DIAGRAM_COLOR_PRESETS,
  DIAGRAM_SHAPES,
  type DiagramShape
} from './project-pages-diagram-styles'

const SHAPE_ALIASES: Record<string, string> = {
  rectangle: 'rect',
  box: 'rect',
  process: 'rect',
  diamond: 'rhombus',
  decision: 'rhombus',
  database: 'cylinder',
  db: 'cylinder',
  person: 'actor',
  user: 'actor',
  oval: 'ellipse',
  group: 'container',
  swimlane: 'container',
  lane: 'container',
  label: 'text'
}

/** Rounded boxes are the default, as in the palette's most used shape. */
export function agentShape(name: unknown): DiagramShape {
  const key = typeof name === 'string' ? name.trim().toLowerCase() : 'rounded'
  const id = SHAPE_ALIASES[key] ?? key
  const shape = DIAGRAM_SHAPES.find((s) => s.id === id || s.label.toLowerCase() === key)
  if (!shape) {
    throw new Error(`Unknown shape "${String(name)}". diagram_shapes lists them.`)
  }
  return shape
}

/** A preset name sets fill, line and text together; a #hex sets the fill only. */
export function agentColor(name: unknown): Record<string, string> {
  if (name === undefined || name === null || name === '') {
    return {}
  }
  const preset = DIAGRAM_COLOR_PRESETS.find((p) => p.id === String(name).toLowerCase())
  if (preset) {
    const { id: _id, ...colors } = preset
    return colors
  }
  if (typeof name === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(name)) {
    return { fillColor: name }
  }
  throw new Error(
    `Unknown colour "${String(name)}": use ${DIAGRAM_COLOR_PRESETS.map((p) => p.id).join(', ')} or #hex.`
  )
}

// draw.io writes flags as 1/0 where the palette says true/false.
const flag = (value: unknown): string =>
  String(value === true ? 1 : value === false ? 0 : [value].flat()[0])
const same = (a: unknown, b: unknown): boolean => flag(a) === flag(b)

/** The catalogue name a style matches best, else its own shape name. */
export function shapeNameOf(style: DiagramStyle | CellStyle | undefined): string {
  const own = (style ?? {}) as Record<string, unknown>
  let best = 'rect'
  let score = 0
  for (const shape of DIAGRAM_SHAPES) {
    const keys = Object.entries(shape.style as Record<string, unknown>)
    if (keys.length > score && keys.every(([key, value]) => same(own[key], value))) {
      best = shape.id
      score = keys.length
    }
  }
  const raw = own.shape ?? (own.baseStyleNames as string[] | undefined)?.[0]
  return score === 0 && typeof raw === 'string' ? raw : best
}

export const labelOf = (cell: Cell): string => {
  const value = cell.getValue()
  return diagramLabel({ value: value == null ? undefined : String(value) })
}

const norm = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase()

/** Finds a cell by an id given earlier in the call, a model id, or an exact (case-blind) label. */
export function cellRefs(graph: Graph, named: Map<string, Cell>): (ref: unknown) => Cell {
  const model = graph.getDataModel()
  return (ref) => {
    if (typeof ref !== 'string' || !ref.trim()) {
      throw new Error('A row is missing the shape it refers to (an id or label).')
    }
    const byName = named.get(ref)
    const byId = model.getCell(ref)
    if (byName) {
      return byName
    }
    if (byId && (byId.isVertex() || byId.isEdge())) {
      return byId
    }
    const want = norm(ref)
    const hits = (Object.values(model.cells ?? {}) as Cell[]).filter(
      (cell) => (cell.isVertex() || cell.isEdge()) && norm(labelOf(cell)) === want
    )
    if (hits.length > 1) {
      throw new Error(
        `"${ref}" matches ${hits.length} shapes (${hits.map((c) => c.getId()).join(', ')}); use an id.`
      )
    }
    if (!hits[0]) {
      throw new Error(
        `Nothing in the diagram is called "${ref}". read_diagram lists ids and labels.`
      )
    }
    return hits[0]
  }
}
