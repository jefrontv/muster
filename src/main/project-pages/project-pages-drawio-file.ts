// draw.io files in and out of Pages: .drawio/.xml (plain or compressed pages) and SVGs that carry
// an editable copy, read without a DOM; plus the cell reader the text outline needs.
import { inflateRawSync } from 'node:zlib'
import type { DiagramCell, DiagramStyle } from '../../shared/project-pages-diagram-xml'
import { escapeXmlAttr } from '../../shared/project-pages-diagram-xml'

export type DrawioPage = { name: string | null; xml: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, code: string) => {
    if (code[0] !== '#') {
      return ENTITIES[code.toLowerCase()] ?? whole
    }
    const n =
      code[1] === 'x' || code[1] === 'X'
        ? Number.parseInt(code.slice(2), 16)
        : Number(code.slice(1))
    return Number.isFinite(n) ? String.fromCodePoint(n) : whole
  })
}

export function readAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of tag.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[m[1]] = unescapeXml(m[2])
  }
  return attrs
}

/** draw.io's compressed page: base64 of raw deflate of the URI-encoded XML. */
function inflatePage(data: string): string {
  const raw = inflateRawSync(Buffer.from(data.trim(), 'base64')).toString('utf-8')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function graphModel(xml: string): string | null {
  const m = xml.match(/<mxGraphModel\b[\s\S]*<\/mxGraphModel>/)
  return m ? m[0] : null
}

/** Every page of a draw.io document, or [] when the text holds none. */
export function readDrawioPages(text: string): DrawioPage[] {
  let doc = text.replace(/^\uFEFF/, '')
  if (/^\s*(<\?xml[^>]*>\s*)?<svg\b/i.test(doc)) {
    const svg = doc.match(/<svg\b[^>]*>/i)
    const content = svg ? readAttrs(svg[0]).content : undefined
    if (!content) {
      return []
    }
    doc = content.trim().startsWith('<') ? content : inflatePage(content)
  }
  if (!/<mxfile\b/.test(doc)) {
    const model = graphModel(doc)
    return model ? [{ name: null, xml: model }] : []
  }
  const pages: DrawioPage[] = []
  for (const m of doc.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)) {
    const body = m[2].trim()
    const model = body.startsWith('<') ? graphModel(body) : graphModel(inflatePage(body))
    if (model) {
      pages.push({ name: readAttrs(m[1]).name?.trim() || null, xml: model })
    }
  }
  return pages
}

/** One uncompressed .drawio document, which draw.io desktop, VS Code and Obsidian plugins open. */
export function writeDrawioFile(pages: { name: string; xml: string }[]): string {
  const diagrams = pages
    .map(
      (page, i) =>
        `  <diagram id="page-${i + 1}" name="${escapeXmlAttr(page.name)}">${page.xml}</diagram>`
    )
    .join('\n')
  return `<mxfile host="Muster">\n${diagrams}\n</mxfile>\n`
}

/** Rewrites each shape link (UserObject/object link attribute); return null to keep one. */
export function rewriteDiagramLinks(xml: string, rewrite: (href: string) => string | null): string {
  return xml.replace(
    /(<(?:UserObject|object)\b[^>]*?\slink=")([^"]*)(")/g,
    (whole, open: string, href: string, close: string) => {
      const next = rewrite(unescapeXml(href))
      return next === null ? whole : `${open}${escapeXmlAttr(next)}${close}`
    }
  )
}

function parseStyle(text: string | undefined): DiagramStyle | undefined {
  if (!text) {
    return undefined
  }
  const style: DiagramStyle = {}
  for (const part of text.split(';').filter(Boolean)) {
    const eq = part.indexOf('=')
    if (eq < 0) {
      style.baseStyleNames = [...(style.baseStyleNames ?? []), part]
    } else {
      style[part.slice(0, eq)] = part.slice(eq + 1)
    }
  }
  if (style.rounded === '0') {
    delete style.rounded
  }
  return style
}

/** The cells an outline needs (ids, labels, links, structure), read straight from the XML. */
export function readDiagramCells(xml: string): DiagramCell[] {
  const cells: DiagramCell[] = []
  const pattern = /<(UserObject|object)\b([^>]*)>\s*<mxCell\b([^>]*?)\/?>|<mxCell\b([^>]*?)\/?>/g
  for (const m of xml.matchAll(pattern)) {
    const wrapper = m[2] ? readAttrs(m[2]) : null
    const cell = readAttrs(m[3] ?? m[4] ?? '')
    const id = wrapper?.id ?? cell.id
    if (!id) {
      continue
    }
    const attrs = wrapper?.link ? { link: wrapper.link } : undefined
    cells.push({
      id,
      value: wrapper ? (wrapper.label ?? '') : cell.value,
      style: parseStyle(cell.style),
      vertex: cell.vertex === '1',
      edge: cell.edge === '1',
      parent: cell.parent,
      source: cell.source,
      target: cell.target,
      attrs
    })
  }
  return cells
}
