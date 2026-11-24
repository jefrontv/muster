// Moves diagrams between draw.io XML and a maxGraph model, smoothing over the format differences.
import { ModelXmlSerializer, type AbstractGraph, type Cell, type CellStyle } from '@maxgraph/core'
import type {
  DiagramCell,
  DiagramGeometry,
  DiagramStyle
} from '../../../../shared/project-pages-diagram-xml'

/** Extra draw.io attributes (link, tooltip) ride on the cell; Cell.clone copies them. */
export type PagesCell = Cell & { pagesAttrs?: Record<string, string> }

/** draw.io style string to CellStyle; keeps "=" inside values, which maxGraph's parser cuts. */
export function parseDiagramStyle(input: string): CellStyle {
  const style: DiagramStyle = {}
  if (input.startsWith(';')) {
    style.ignoreDefaultStyle = true
  }
  for (const part of input.split(';')) {
    if (!part) {
      continue
    }
    const at = part.indexOf('=')
    if (at < 0) {
      ;(style.baseStyleNames ??= []).push(part)
      continue
    }
    const key = part.slice(0, at)
    const raw = part.slice(at + 1)
    style[key === 'autosize' ? 'autoSize' : key] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
  }
  return style as CellStyle
}

type Prepared = {
  model: Element
  attrs: Map<string, Record<string, string>>
  styles: Map<string, string>
}

/** Unwraps UserObject and object wrappers so the codec reads plain mxCells. */
function prepare(xml: string): Prepared {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const model = doc.documentElement
  if (doc.querySelector('parsererror') || model.nodeName !== 'mxGraphModel') {
    throw new Error('This diagram file could not be read.')
  }
  const attrs = new Map<string, Record<string, string>>()
  for (const wrapper of Array.from(model.querySelectorAll('UserObject, object'))) {
    const inner = Array.from(wrapper.children).find((c) => c.nodeName === 'mxCell')
    const id = wrapper.getAttribute('id')
    if (!inner || !id) {
      wrapper.remove()
      continue
    }
    const extra: Record<string, string> = {}
    for (const attr of Array.from(wrapper.attributes)) {
      if (attr.name !== 'id' && attr.name !== 'label') {
        extra[attr.name] = attr.value
      }
    }
    inner.setAttribute('id', id)
    inner.setAttribute('value', wrapper.getAttribute('label') ?? '')
    attrs.set(id, extra)
    wrapper.replaceWith(inner)
  }
  const styles = new Map<string, string>()
  for (const cell of Array.from(model.querySelectorAll('mxCell[style]'))) {
    styles.set(cell.getAttribute('id') ?? '', cell.getAttribute('style') ?? '')
  }
  return { model, attrs, styles }
}

export function loadDiagramXml(graph: AbstractGraph, xml: string): void {
  const { model, attrs, styles } = prepare(xml)
  const data = graph.getDataModel()
  data.clear()
  new ModelXmlSerializer(data).import(model)
  for (const cell of Object.values(data.cells ?? {}) as PagesCell[]) {
    const id = cell.getId() ?? ''
    const raw = styles.get(id)
    if (raw !== undefined) {
      cell.style = parseDiagramStyle(raw)
    }
    const extra = attrs.get(id)
    if (extra) {
      cell.pagesAttrs = extra
    }
  }
  graph.refresh()
}

function plainStyle(style: CellStyle | undefined): DiagramStyle | undefined {
  if (!style) {
    return undefined
  }
  const out: DiagramStyle = {}
  for (const [key, value] of Object.entries(style)) {
    if (key === 'baseStyleNames' && Array.isArray(value)) {
      out.baseStyleNames = value.map(String)
    } else if (['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = value as string | number | boolean
    }
  }
  return Object.keys(out).length ? out : undefined
}

const point = (p: { x: number; y: number } | null | undefined) =>
  p ? { x: p.x, y: p.y } : undefined

function plainGeometry(cell: Cell): DiagramGeometry | undefined {
  const g = cell.getGeometry()
  if (!g) {
    return undefined
  }
  return {
    x: g.x,
    y: g.y,
    width: g.width,
    height: g.height,
    relative: g.relative || undefined,
    points: g.points?.length ? g.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
    sourcePoint: point(g.sourcePoint),
    targetPoint: point(g.targetPoint),
    offset: g.offset && (g.offset.x || g.offset.y) ? point(g.offset) : undefined
  }
}

/** The model as plain cells, parents before children, for the writer and the outline. */
export function snapshotDiagram(graph: AbstractGraph): DiagramCell[] {
  const out: DiagramCell[] = []
  const walk = (cell: PagesCell): void => {
    const value = cell.getValue()
    out.push({
      id: cell.getId() ?? '',
      value: value == null || value === '' ? undefined : String(value),
      style: plainStyle(cell.getStyle()),
      vertex: cell.isVertex() || undefined,
      edge: cell.isEdge() || undefined,
      parent: cell.getParent()?.getId() ?? undefined,
      source: cell.getTerminal(true)?.getId() ?? undefined,
      target: cell.getTerminal(false)?.getId() ?? undefined,
      geometry: plainGeometry(cell),
      attrs: cell.pagesAttrs,
      collapsed: cell.isCollapsed() || undefined,
      visible: cell.isVisible() ? undefined : false,
      connectable: cell.isVertex() && !cell.isConnectable() ? false : undefined
    })
    for (const child of cell.getChildren()) {
      walk(child)
    }
  }
  const root = graph.getDataModel().getRoot()
  if (root) {
    walk(root)
  }
  return out
}
