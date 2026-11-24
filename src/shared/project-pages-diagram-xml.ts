// Plain diagram cells and the draw.io mxGraphModel writer. maxGraph exports its own format, so
// Pages writes draw.io's: style strings, mxGeometry children, and UserObject for extra attributes.

export type DiagramStyleValue = string | number | boolean
export type DiagramStyle = { baseStyleNames?: string[]; ignoreDefaultStyle?: boolean } & Record<
  string,
  DiagramStyleValue | string[] | undefined
>
export type DiagramPoint = { x: number; y: number }
export type DiagramGeometry = {
  x: number
  y: number
  width: number
  height: number
  relative?: boolean
  points?: DiagramPoint[]
  sourcePoint?: DiagramPoint
  targetPoint?: DiagramPoint
  offset?: DiagramPoint
}
export type DiagramCell = {
  id: string
  value?: string
  style?: DiagramStyle
  vertex?: boolean
  edge?: boolean
  parent?: string
  source?: string
  target?: string
  geometry?: DiagramGeometry
  /** Extra draw.io attributes (link, tooltip, placeholders) carried on a UserObject. */
  attrs?: Record<string, string>
  collapsed?: boolean
  visible?: boolean
  connectable?: boolean
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\n': '&#xa;'
}

export function escapeXmlAttr(value: string): string {
  return value.replace(/[&<>"\n]/g, (ch) => ESCAPES[ch])
}

/** CellStyle object to draw.io's "name;key=value;" string; a leading ";" keeps ignoreDefaultStyle. */
export function styleToString(style: DiagramStyle | undefined): string {
  if (!style) {
    return ''
  }
  const parts: string[] = [...(style.baseStyleNames ?? [])]
  for (const [key, value] of Object.entries(style)) {
    if (key === 'baseStyleNames' || key === 'ignoreDefaultStyle' || value === undefined) {
      continue
    }
    const text = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
    parts.push(`${key === 'autoSize' ? 'autosize' : key}=${text.replace(/;/g, ',')}`)
  }
  const body = parts.length ? `${parts.join(';')};` : ''
  return style.ignoreDefaultStyle ? `;${body}` : body
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

function pointXml(point: DiagramPoint, as?: string): string {
  return `<mxPoint x="${num(point.x)}" y="${num(point.y)}"${as ? ` as="${as}"` : ''}/>`
}

function geometryXml(g: DiagramGeometry): string {
  const attrs = [
    g.x ? `x="${num(g.x)}"` : '',
    g.y ? `y="${num(g.y)}"` : '',
    g.width ? `width="${num(g.width)}"` : '',
    g.height ? `height="${num(g.height)}"` : '',
    g.relative ? 'relative="1"' : ''
  ].filter(Boolean)
  const children = [
    g.sourcePoint ? pointXml(g.sourcePoint, 'sourcePoint') : '',
    g.targetPoint ? pointXml(g.targetPoint, 'targetPoint') : '',
    g.points?.length
      ? `<Array as="points">${g.points.map((p) => pointXml(p)).join('')}</Array>`
      : '',
    g.offset ? pointXml(g.offset, 'offset') : ''
  ].join('')
  const open = `<mxGeometry ${[...attrs, 'as="geometry"'].join(' ')}`
  return children ? `${open}>${children}</mxGeometry>` : `${open}/>`
}

function cellXml(cell: DiagramCell): string {
  const wrapped = cell.attrs && Object.keys(cell.attrs).length > 0
  const attrs: string[] = wrapped ? [] : [`id="${escapeXmlAttr(cell.id)}"`]
  if (!wrapped && cell.value) {
    attrs.push(`value="${escapeXmlAttr(cell.value)}"`)
  }
  const style = styleToString(cell.style)
  if (style) {
    attrs.push(`style="${escapeXmlAttr(style)}"`)
  }
  if (cell.vertex) {
    attrs.push('vertex="1"')
  }
  if (cell.edge) {
    attrs.push('edge="1"')
  }
  if (cell.connectable === false) {
    attrs.push('connectable="0"')
  }
  if (cell.collapsed) {
    attrs.push('collapsed="1"')
  }
  if (cell.visible === false) {
    attrs.push('visible="0"')
  }
  for (const key of ['parent', 'source', 'target'] as const) {
    if (cell[key]) {
      attrs.push(`${key}="${escapeXmlAttr(cell[key])}"`)
    }
  }
  const body = cell.geometry ? geometryXml(cell.geometry) : ''
  const xml = body ? `<mxCell ${attrs.join(' ')}>${body}</mxCell>` : `<mxCell ${attrs.join(' ')}/>`
  if (!wrapped) {
    return xml
  }
  const extra = Object.entries(cell.attrs!)
    .filter(([key]) => /^[A-Za-z_][\w.-]*$/.test(key) && key !== 'id' && key !== 'label')
    .map(([key, value]) => ` ${key}="${escapeXmlAttr(value)}"`)
    .join('')
  return `<UserObject label="${escapeXmlAttr(cell.value ?? '')}"${extra} id="${escapeXmlAttr(cell.id)}">${xml}</UserObject>`
}

/** Cells in parent-before-child order to one uncompressed draw.io mxGraphModel. */
export function writeDiagramXml(cells: DiagramCell[]): string {
  return `<mxGraphModel><root>${cells.map(cellXml).join('')}</root></mxGraphModel>`
}
