// Diagram files met during an import: .drawio/.xml/.svg from draw.io and Obsidian .canvas. Each
// becomes a diagram page; extra draw.io pages become its subpages.
import { readFileSync, statSync } from 'node:fs'
import { diagramOutlineText } from '../../shared/project-pages-diagram-outline'
import type { ProjectPageAuthor } from '../../shared/project-pages-types'
import { canvasToDiagramXml, readCanvas, type CanvasDocument } from './project-pages-canvas-import'
import type { ProjectPagesDiagrams } from './project-pages-diagram-store'
import {
  readDiagramCells,
  readDrawioPages,
  rewriteDiagramLinks,
  type DrawioPage
} from './project-pages-drawio-file'
import type { ProjectPagesStore } from './project-pages-store'

const MAX_FILE_BYTES = 10_000_000
const DIAGRAM_FILE = /(\.drawio)?\.(drawio|xml|svg|canvas)$/i
// Extensions that only ever hold diagrams; a failure to read one is worth reporting.
const ALWAYS_DIAGRAM = /\.(drawio|canvas|drawio\.(svg|xml))$/i

export type DiagramSource =
  | { kind: 'drawio'; file: string; pages: DrawioPage[] }
  | { kind: 'canvas'; file: string; canvas: CanvasDocument }

export const isDiagramFileName = (name: string): boolean => DIAGRAM_FILE.test(name)
export const diagramStem = (name: string): string => name.replace(DIAGRAM_FILE, '')

/** The diagram in a file, null when it holds none, or an error string worth reporting. */
export function readDiagramSource(file: string): DiagramSource | null | string {
  const name = file.split(/[\\/]/).pop() ?? file
  const report = (why: string): string | null =>
    ALWAYS_DIAGRAM.test(name) ? `${name}: ${why}` : null
  try {
    if (statSync(file).size > MAX_FILE_BYTES) {
      return report('over the 10 MB limit')
    }
    const text = readFileSync(file, 'utf-8')
    if (/\.canvas$/i.test(name)) {
      const canvas = readCanvas(text)
      return canvas ? { kind: 'canvas', file, canvas } : report('not a JSON Canvas file')
    }
    const pages = readDrawioPages(text)
    return pages.length ? { kind: 'drawio', file, pages } : report('no draw.io diagram inside')
  } catch {
    return report('could not be read')
  }
}

/** Saves the source onto a page (and subpages for extra draw.io pages); links resolve through linkFor. */
export function saveImportedDiagram({
  store,
  diagrams,
  scopeKey,
  pageId,
  source,
  author,
  linkFor
}: {
  store: ProjectPagesStore
  diagrams: ProjectPagesDiagrams
  scopeKey: string
  pageId: string
  source: DiagramSource
  author: ProjectPageAuthor
  linkFor: (href: string) => string | null
}): number {
  const pages =
    source.kind === 'canvas'
      ? [{ name: null, xml: canvasToDiagramXml(source.canvas, linkFor) }]
      : source.pages.map((page) => ({ ...page, xml: rewriteDiagramLinks(page.xml, linkFor) }))
  const save = (id: string, xml: string): void => {
    const { page } = diagrams.enableDiagram(scopeKey, id, author)
    const outline = diagramOutlineText(readDiagramCells(xml))
    diagrams.saveDiagram(scopeKey, id, { baseRevision: page.revision, xml, outline }, author)
  }
  save(pageId, pages[0].xml)
  pages.slice(1).forEach((page, i) => {
    const title = page.name ?? `Page ${i + 2}`
    save(store.createPage(scopeKey, { parentId: pageId, title }, author).meta.id, page.xml)
  })
  return pages.length - 1
}
