// Obsidian .canvas (JSON Canvas 1.0) to a diagram: cards become shapes, groups become frames
// drawn behind them, edges become connectors with the same sides, ends, colours and labels.
import type { DiagramCell, DiagramStyle } from '../../shared/project-pages-diagram-xml'
import { writeDiagramXml } from '../../shared/project-pages-diagram-xml'

type CanvasNode = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
}
type CanvasEdge = {
  id: string
  fromNode: string
  toNode: string
  fromSide?: string
  toSide?: string
  fromEnd?: string
  toEnd?: string
  color?: string
  label?: string
}
export type CanvasDocument = { nodes: CanvasNode[]; edges: CanvasEdge[] }

// JSON Canvas presets 1-6: red, orange, yellow, green, cyan, purple; as draw.io fill/stroke pairs.
const PRESETS: Record<string, [string, string]> = {
  '1': ['#f8cecc', '#b85450'],
  '2': ['#ffe6cc', '#d79b00'],
  '3': ['#fff2cc', '#d6b656'],
  '4': ['#d5e8d4', '#82b366'],
  '5': ['#b1ddf0', '#10739e'],
  '6': ['#e1d5e7', '#9673a6']
}
const SIDES: Record<string, [number, number]> = {
  top: [0.5, 0],
  bottom: [0.5, 1],
  left: [0, 0.5],
  right: [1, 0.5]
}
const MARGIN = 40

const finite = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback

/** The parsed canvas, or null when the JSON is not a canvas. */
export function readCanvas(text: string): CanvasDocument | null {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
  const doc = data as Partial<CanvasDocument> | null
  if (!doc || !Array.isArray(doc.nodes)) {
    return null
  }
  const nodes = doc.nodes.filter(
    (n): n is CanvasNode => !!n && typeof n.id === 'string' && typeof n.type === 'string'
  )
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (Array.isArray(doc.edges) ? doc.edges : []).filter(
    (e): e is CanvasEdge => !!e && ids.has(e.fromNode) && ids.has(e.toNode)
  )
  return { nodes, edges }
}

function colorStyle(color: string | undefined, fill: boolean): DiagramStyle {
  if (!color) {
    return {}
  }
  const pair = PRESETS[color] ?? (/^#[0-9a-f]{3,8}$/i.test(color) ? [color, color] : null)
  if (!pair) {
    return {}
  }
  return fill
    ? { fillColor: pair[0], strokeColor: pair[1], fontColor: '#1f1f1f' }
    : { strokeColor: pair[1] }
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
  )
}

/** Card markdown as a label: heading marks and emphasis dropped, lines kept. */
function cardLabel(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) =>
      escapeHtml(
        line
          .replace(/^#{1,6}\s+/, '')
          .replace(/(\*\*|__)(.+?)\1/g, '$2')
          .replace(
            /\[\[([^\]|]+)\|?([^\]]*)\]\]/g,
            (_m, target: string, alias: string) => alias || target
          )
      )
    )
    .join('<br>')
}

const baseName = (path: string): string =>
  (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '') || path

function nodeCell(
  node: CanvasNode,
  dx: number,
  dy: number,
  linkFor: (file: string) => string | null
): DiagramCell {
  const geometry = {
    x: finite(node.x, 0) + dx,
    y: finite(node.y, 0) + dy,
    width: Math.max(20, finite(node.width, 200)),
    height: Math.max(20, finite(node.height, 60))
  }
  const style: DiagramStyle = {
    html: 1,
    whiteSpace: 'wrap',
    rounded: 1,
    absoluteArcSize: 1,
    arcSize: 16,
    ...colorStyle(node.color, true)
  }
  if (node.type === 'group') {
    // A light tint, like Obsidian's; the label keeps the theme's text colour.
    const { fontColor: _font, ...frame } = style
    return {
      id: node.id,
      value: escapeHtml(node.label ?? ''),
      vertex: true,
      parent: '1',
      geometry,
      style: {
        ...frame,
        dashed: 1,
        verticalAlign: 'top',
        align: 'left',
        fontStyle: 1,
        fillColor: style.fillColor ?? 'none',
        fillOpacity: 25
      }
    }
  }
  let value = ''
  let link: string | null = null
  if (node.type === 'text') {
    value = cardLabel(node.text ?? '')
    if (value.includes('<br>')) {
      Object.assign(style, { align: 'left', verticalAlign: 'top', spacing: 8 })
    }
  } else if (node.type === 'file' && node.file) {
    value = escapeHtml(baseName(node.file))
    link = linkFor(node.file)
  } else if (node.type === 'link' && node.url) {
    value = escapeHtml(node.url)
    link = /^https?:\/\//i.test(node.url) ? node.url : null
  }
  return {
    id: node.id,
    value,
    vertex: true,
    parent: '1',
    geometry,
    style,
    attrs: link ? { link } : undefined
  }
}

function edgeCell(edge: CanvasEdge): DiagramCell {
  const style: DiagramStyle = {
    edgeStyle: 'orthogonalEdgeStyle',
    rounded: 1,
    html: 1,
    endArrow: edge.toEnd === 'none' ? 'none' : 'classic',
    startArrow: edge.fromEnd === 'arrow' ? 'classic' : 'none',
    ...colorStyle(edge.color, false)
  }
  const exit = edge.fromSide ? SIDES[edge.fromSide] : undefined
  const entry = edge.toSide ? SIDES[edge.toSide] : undefined
  if (exit) {
    Object.assign(style, { exitX: exit[0], exitY: exit[1] })
  }
  if (entry) {
    Object.assign(style, { entryX: entry[0], entryY: entry[1] })
  }
  return {
    id: edge.id,
    value: edge.label ? escapeHtml(edge.label) : undefined,
    edge: true,
    parent: '1',
    source: edge.fromNode,
    target: edge.toNode,
    geometry: { x: 0, y: 0, width: 0, height: 0, relative: true },
    style
  }
}

/** The canvas as one mxGraphModel, moved so its top-left card sits near the origin. */
export function canvasToDiagramXml(
  canvas: CanvasDocument,
  linkFor: (file: string) => string | null
): string {
  const reserved = new Set(['0', '1'])
  const rename = new Map<string, string>()
  const idOf = (id: string): string => {
    if (!rename.has(id)) {
      rename.set(id, reserved.has(id) ? `canvas-${id}` : id)
    }
    return rename.get(id)!
  }
  const least = (key: 'x' | 'y'): number =>
    canvas.nodes.reduce((min, n) => Math.min(min, finite(n[key], 0)), Infinity)
  const dx = canvas.nodes.length ? MARGIN - least('x') : 0
  const dy = canvas.nodes.length ? MARGIN - least('y') : 0
  // Groups first, largest first, so they draw behind the cards inside them.
  const ordered = [...canvas.nodes].sort((a, b) => {
    const ga = a.type === 'group' ? 1 : 0
    const gb = b.type === 'group' ? 1 : 0
    return gb - ga || (ga ? b.width * b.height - a.width * a.height : 0)
  })
  const cells: DiagramCell[] = [{ id: '0' }, { id: '1', parent: '0' }]
  for (const node of ordered) {
    cells.push({ ...nodeCell(node, dx, dy, linkFor), id: idOf(node.id) })
  }
  for (const edge of canvas.edges) {
    const cell = edgeCell(edge)
    cells.push({
      ...cell,
      id: idOf(edge.id),
      source: idOf(edge.fromNode),
      target: idOf(edge.toNode)
    })
  }
  return writeDiagramXml(cells)
}
