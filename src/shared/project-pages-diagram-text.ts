// Searchable text in draw.io XML (labels, connector labels, tooltips) without a DOM, so main can grep it.
import { diagramLabel } from './project-pages-diagram-outline'

export type DiagramTextField = 'label' | 'connector' | 'tooltip'
/** shape is the cell id read_diagram and edit_diagram take; a connector label reports its edge. */
export type DiagramTextRow = { shape: string; field: DiagramTextField; text: string }

type Cell = { id: string; value: string; tooltip: string; edge: boolean; parent: string }

const TAG = /<(mxCell|UserObject|object)\b([^>]*)>/g
const ATTR = /([\w:.-]+)="([^"]*)"/g
const NAMED: Record<string, string> = { quot: '"', apos: "'", lt: '<', gt: '>' }

function codePoint(value: number): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : ''
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);|&#(\d+);|&(quot|apos|lt|gt);/gi, (match, hex, dec, name) =>
      hex
        ? codePoint(Number.parseInt(hex, 16))
        : dec
          ? codePoint(Number(dec))
          : (NAMED[name] ?? match)
    )
    .replace(/&amp;/g, '&')
}

function attributes(body: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const [, key, value] of body.matchAll(ATTR)) {
    attrs[key] = decodeXml(value)
  }
  return attrs
}

function cellsOf(xml: string): Cell[] {
  const cells: Cell[] = []
  // A UserObject carries id, label and tooltip; the id-less mxCell inside it says vertex or edge.
  let wrapper: Cell | null = null
  for (const [, tag, body] of xml.matchAll(TAG)) {
    const attrs = attributes(body)
    if (tag !== 'mxCell') {
      wrapper = {
        id: attrs.id ?? '',
        value: attrs.label ?? '',
        tooltip: attrs.tooltip ?? '',
        edge: false,
        parent: ''
      }
      cells.push(wrapper)
      continue
    }
    if (wrapper && !attrs.id) {
      wrapper.edge = attrs.edge === '1'
      wrapper.parent = attrs.parent ?? ''
      wrapper = null
      continue
    }
    wrapper = null
    cells.push({
      id: attrs.id ?? '',
      value: attrs.value ?? '',
      tooltip: attrs.tooltip ?? '',
      edge: attrs.edge === '1',
      parent: attrs.parent ?? ''
    })
  }
  return cells
}

export function scanDiagramText(xml: string): DiagramTextRow[] {
  const cells = cellsOf(xml)
  const edges = new Set(cells.filter((cell) => cell.edge).map((cell) => cell.id))
  const rows: DiagramTextRow[] = []
  for (const cell of cells) {
    const label = diagramLabel(cell)
    if (label) {
      const onEdge = edges.has(cell.parent)
      rows.push({
        shape: onEdge ? cell.parent : cell.id,
        field: cell.edge || onEdge ? 'connector' : 'label',
        text: label
      })
    }
    const tooltip = diagramLabel({ value: cell.tooltip })
    if (tooltip) {
      rows.push({ shape: cell.id, field: 'tooltip', text: tooltip })
    }
  }
  return rows
}
