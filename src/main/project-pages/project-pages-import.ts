// Reads a folder of markdown (plain, Notion or Obsidian export) into pages. A folder named like a
// file holds that page's subpages; relative links between imported files become page links.
// draw.io and .canvas files become diagram pages; one beside a same-named .md replaces its body.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { PROJECT_PAGE_LIMITS, type ProjectPageAuthor } from '../../shared/project-pages-types'
import type { ProjectPagesDiagrams } from './project-pages-diagram-store'
import { rewriteMarkdownLinks, titleFromImportName } from './project-pages-file-names'
import {
  diagramStem,
  isDiagramFileName,
  readDiagramSource,
  saveImportedDiagram,
  type DiagramSource
} from './project-pages-import-diagrams'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'

const MAX_PAGES = 2_000
const MAX_DEPTH = 8

type ImportNode = {
  title: string
  file: string | null
  diagram: DiagramSource | null
  children: ImportNode[]
}
type Scan = { left: number; skipped: string[] }

function readDiagram(file: string, scan: Scan): DiagramSource | null {
  const source = readDiagramSource(file)
  if (typeof source === 'string') {
    scan.skipped.push(source)
    return null
  }
  return source
}

function scanDir(dir: string, depth: number, scan: Scan): ImportNode[] {
  if (depth > MAX_DEPTH) {
    return []
  }
  const entries = readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules'
  )
  const folders = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  const nodes: ImportNode[] = []
  const byStem = new Map<string, ImportNode>()
  for (const entry of entries) {
    if (scan.left <= 0) {
      break
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      scan.left -= 1
      const stem = entry.name.slice(0, -3)
      const childDir = folders.has(stem) ? join(dir, stem) : null
      folders.delete(stem)
      const node: ImportNode = {
        title: titleFromImportName(entry.name),
        file: join(dir, entry.name),
        diagram: null,
        children: childDir ? scanDir(childDir, depth + 1, scan) : []
      }
      byStem.set(stem.toLowerCase(), node)
      nodes.push(node)
    }
  }
  for (const entry of entries) {
    if (scan.left <= 0 || !entry.isFile() || !isDiagramFileName(entry.name)) {
      continue
    }
    const diagram = readDiagram(join(dir, entry.name), scan)
    if (!diagram) {
      continue
    }
    const stem = diagramStem(entry.name)
    const twin = byStem.get(stem.toLowerCase())
    if (twin && !twin.diagram) {
      twin.diagram = diagram
      continue
    }
    scan.left -= 1
    nodes.push({ title: titleFromImportName(stem), file: null, diagram, children: [] })
  }
  for (const folder of folders) {
    const children = scan.left > 0 ? scanDir(join(dir, folder), depth + 1, scan) : []
    if (children.length > 0) {
      scan.left -= 1
      nodes.push({ title: titleFromImportName(folder), file: null, diagram: null, children })
    }
  }
  return nodes.sort((a, b) => a.title.localeCompare(b.title))
}

function filesAsNodes(files: string[], scan: Scan): ImportNode[] {
  const nodes: ImportNode[] = []
  for (const file of files.slice(0, MAX_PAGES)) {
    const name = basename(file)
    if (extname(name).toLowerCase() === '.md') {
      nodes.push({ title: titleFromImportName(name), file, diagram: null, children: [] })
      continue
    }
    const diagram = isDiagramFileName(name) ? readDiagram(file, scan) : null
    if (diagram) {
      nodes.push({
        title: titleFromImportName(diagramStem(name)),
        file: null,
        diagram,
        children: []
      })
    } else if (!isDiagramFileName(name)) {
      scan.skipped.push(`${name}: not a markdown or diagram file`)
    }
  }
  return nodes
}

/** Drops front matter and a first heading that only repeats the title. */
function bodyOf(text: string, title: string): string {
  let body = text.replace(/^\uFEFF/, '').replace(/^---\n[\s\S]*?\n---\n+/, '')
  const heading = body.match(/^#\s+(.+)\n+/)
  if (heading && titleFromImportName(heading[1].trim()) === title) {
    body = body.slice(heading[0].length)
  }
  return body.slice(0, PROJECT_PAGE_LIMITS.markdown)
}

type ImportTarget = {
  store: ProjectPagesStore
  diagrams: ProjectPagesDiagrams
  scopeKey: string
  parentId: string | null
  author: ProjectPageAuthor
}
export type ProjectPagesImport = { count: number; skipped: string[] }

function createTree(
  target: ImportTarget,
  tree: ImportNode[],
  scan: Scan,
  root: string
): ProjectPagesImport {
  const { store, scopeKey, author } = target
  if (tree.length === 0) {
    throw new ProjectPagesError('invalid', 'Nothing to import: no markdown or diagram files found.')
  }
  let total = countNodes(tree)
  if (store.listPages(scopeKey).pages.length + total > PROJECT_PAGE_LIMITS.pagesPerSpace) {
    throw new ProjectPagesError('invalid', 'Importing this would pass the page limit.')
  }
  const created: { id: string; node: ImportNode }[] = []
  const ids = new Map<string, string>()
  const create = (nodes: ImportNode[], parent: string | null): void => {
    for (const node of nodes) {
      const page = store.createPage(scopeKey, { parentId: parent, title: node.title }, author)
      for (const file of [node.file, node.diagram?.file]) {
        if (file) {
          ids.set(resolve(file), page.meta.id)
        }
      }
      created.push({ id: page.meta.id, node })
      create(node.children, page.meta.id)
    }
  }
  create(tree, target.parentId)

  const linkFrom =
    (file: string) =>
    (href: string): string | null => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) {
        return null
      }
      let path: string
      try {
        path = decodeURIComponent(href.split('#')[0])
      } catch {
        return null
      }
      const id =
        ids.get(resolve(dirname(file), path)) ??
        ids.get(resolve(root, path)) ??
        // Obsidian canvases name files from the vault root, which may sit above the imported folder.
        [...ids].find(([key]) => key.endsWith(sep + path.split('/').join(sep)))?.[1]
      return id ? pageLinkHref(id) : null
    }
  for (const { id, node } of created) {
    if (node.diagram) {
      try {
        total += saveImportedDiagram({
          ...target,
          pageId: id,
          source: node.diagram,
          linkFor: linkFrom(node.diagram.file)
        })
      } catch (error) {
        scan.skipped.push(
          `${basename(node.diagram.file)}: ${error instanceof Error ? error.message : 'could not be saved'}`
        )
      }
      continue
    }
    if (!node.file) {
      continue
    }
    const markdown = rewriteMarkdownLinks(
      bodyOf(readFileSync(node.file, 'utf-8'), node.title),
      linkFrom(node.file)
    )
    if (markdown.trim()) {
      store.updatePage(scopeKey, id, { baseRevision: 1, markdown }, author)
    }
  }
  return { count: total, skipped: scan.skipped }
}

export function importProjectPages(
  target: ImportTarget & { sourceDir: string }
): ProjectPagesImport {
  const { sourceDir } = target
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new ProjectPagesError('invalid', 'Choose a folder to import.')
  }
  const scan: Scan = { left: MAX_PAGES, skipped: [] }
  return createTree(target, scanDir(sourceDir, 0, scan), scan, sourceDir)
}

/** Imports picked files as top-level pages; links resolve against the first file's folder. */
export function importProjectPageFiles(
  target: ImportTarget & { files: string[] }
): ProjectPagesImport {
  const scan: Scan = { left: MAX_PAGES, skipped: [] }
  const root = target.files[0] ? dirname(target.files[0]) : sep
  return createTree(target, filesAsNodes(target.files, scan), scan, root)
}

function countNodes(nodes: ImportNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
}
