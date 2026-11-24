// Diagram pages on top of the page store. diagrams/<id>.drawio holds the draw.io XML; the page body
// holds a text outline ending in a hash of that XML, so every saved change is a page revision.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROJECT_PAGE_LIMITS,
  type ProjectPageAuthor,
  type ProjectPageMeta
} from '../../shared/project-pages-types'
import type { ProjectPageDiagram } from '../../shared/project-pages-diagram-types'
import { createProjectPagesFiles, isPageId, writeAtomic } from './project-pages-files'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'

export const EMPTY_DIAGRAM =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
const MAX_DIAGRAM_BYTES = 5_000_000

export type ProjectPagesDiagrams = ReturnType<typeof createProjectPagesDiagrams>

/** One draw.io page as an uncompressed mxGraphModel. */
export function checkDiagramXml(raw: unknown): string {
  const xml = typeof raw === 'string' ? raw.trim() : ''
  if (!xml.startsWith('<mxGraphModel') || !xml.endsWith('</mxGraphModel>')) {
    throw new ProjectPagesError('invalid', 'A diagram must be one mxGraphModel element.')
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ProjectPagesError('invalid', 'Diagram XML may not declare a DOCTYPE or entities.')
  }
  if (Buffer.byteLength(xml) > MAX_DIAGRAM_BYTES) {
    throw new ProjectPagesError('invalid', 'This diagram is over the 5 MB limit.')
  }
  return xml
}

export function diagramOutline(outline: string, xml: string): string {
  const hash = createHash('sha1').update(xml).digest('hex').slice(0, 12)
  return `${outline.trim()}\n\n<!-- diagram ${hash} -->\n`
}

export function createProjectPagesDiagrams({
  rootDir,
  store,
  now = Date.now
}: {
  rootDir: string
  store: ProjectPagesStore
  now?: () => number
}) {
  const files = createProjectPagesFiles(rootDir)
  const diagramFile = (dir: string, id: string): string => join(dir, 'diagrams', `${id}.drawio`)
  const historyDir = (dir: string, id: string): string => join(dir, 'diagrams', 'history', id)

  function space(scopeKey: string): { dir: string; pages: ProjectPageMeta[] } {
    const dir = files.spaceDir(scopeKey, false)
    if (!dir) {
      throw new ProjectPagesError('not_found', 'This project has no pages yet.')
    }
    return { dir, pages: files.readTree(dir) }
  }

  function livePage(pages: ProjectPageMeta[], pageId: string): ProjectPageMeta {
    const page = isPageId(pageId) ? pages.find((p) => p.id === pageId) : undefined
    if (!page || page.archivedAt !== null) {
      throw new ProjectPagesError('not_found', 'That page does not exist or is in the trash.')
    }
    return page
  }

  function readXml(dir: string, pageId: string): string {
    try {
      return readFileSync(diagramFile(dir, pageId), 'utf-8')
    } catch {
      return EMPTY_DIAGRAM
    }
  }

  /** Keeps the XML a save replaced, named by the revision it belonged to, pruned to the newest few. */
  function keepHistory(dir: string, pageId: string, revision: number, xml: string): void {
    const folder = historyDir(dir, pageId)
    writeAtomic(join(folder, `${revision}.drawio`), xml)
    const kept = readdirSync(folder)
      .map((name) => Number.parseInt(name, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)
    for (const old of kept.slice(PROJECT_PAGE_LIMITS.historyPerPage)) {
      rmSync(join(folder, `${old}.drawio`), { force: true })
    }
  }

  function readDiagram(scopeKey: string, pageId: string): ProjectPageDiagram {
    const { dir, pages } = space(scopeKey)
    const page = livePage(pages, pageId)
    if (!page.diagram) {
      throw new ProjectPagesError('invalid', `"${page.title || 'Untitled'}" is not a diagram.`)
    }
    return { page, xml: readXml(dir, page.id) }
  }

  /** Turns a page into a diagram; an existing body is kept until the first save replaces it. */
  function enableDiagram(
    scopeKey: string,
    pageId: string,
    author: ProjectPageAuthor
  ): ProjectPageDiagram {
    const { dir, pages } = space(scopeKey)
    const page = livePage(pages, pageId)
    if (page.database) {
      throw new ProjectPagesError('invalid', 'A database page cannot also be a diagram.')
    }
    if (!page.diagram) {
      writeAtomic(diagramFile(dir, page.id), readXml(dir, page.id))
      files.writeTree(
        dir,
        pages.map((p) => (p.id === page.id ? { ...p, diagram: true, updatedAt: now() } : p))
      )
      store.notify({ scopeKey, pageId: null, revision: null, author })
    }
    return readDiagram(scopeKey, pageId)
  }

  /** Saves XML and its outline as one page revision; refused when baseRevision is stale. */
  function saveDiagram(
    scopeKey: string,
    pageId: string,
    input: { baseRevision: number; xml: unknown; outline: string },
    author: ProjectPageAuthor
  ): ProjectPageDiagram {
    const { dir } = space(scopeKey)
    const { page, xml: before } = readDiagram(scopeKey, pageId)
    const xml = checkDiagramXml(input.xml)
    if (input.baseRevision !== page.revision) {
      throw new ProjectPagesError(
        'conflict',
        `The diagram changed since revision ${input.baseRevision}; it is now at ${page.revision}.`,
        page.revision
      )
    }
    if (xml === before) {
      return { page, xml }
    }
    const markdown = diagramOutline(input.outline, xml)
    const doc = store.updatePage(
      scopeKey,
      page.id,
      { baseRevision: page.revision, markdown },
      author
    )
    keepHistory(dir, page.id, page.revision, before)
    writeAtomic(diagramFile(dir, page.id), xml)
    return { page: doc.meta, xml }
  }

  return { readDiagram, enableDiagram, saveDiagram }
}
