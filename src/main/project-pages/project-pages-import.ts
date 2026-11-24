// Reads a folder of markdown (plain, or a Notion export) into pages. A folder named like a file
// holds that page's subpages; relative links between imported files become page links.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { PROJECT_PAGE_LIMITS, type ProjectPageAuthor } from '../../shared/project-pages-types'
import { rewriteMarkdownLinks, titleFromImportName } from './project-pages-file-names'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'

const MAX_PAGES = 2_000
const MAX_DEPTH = 8

type ImportNode = { title: string; file: string | null; children: ImportNode[] }

function scan(dir: string, depth: number, budget: { left: number }): ImportNode[] {
  if (depth > MAX_DEPTH) {
    return []
  }
  const entries = readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules'
  )
  const folders = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  const nodes: ImportNode[] = []
  for (const entry of entries) {
    if (budget.left <= 0) {
      break
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      budget.left -= 1
      const stem = entry.name.slice(0, -3)
      const childDir = folders.has(stem) ? join(dir, stem) : null
      folders.delete(stem)
      nodes.push({
        title: titleFromImportName(entry.name),
        file: join(dir, entry.name),
        children: childDir ? scan(childDir, depth + 1, budget) : []
      })
    }
  }
  for (const folder of folders) {
    const children = budget.left > 0 ? scan(join(dir, folder), depth + 1, budget) : []
    if (children.length > 0) {
      budget.left -= 1
      nodes.push({ title: titleFromImportName(folder), file: null, children })
    }
  }
  return nodes.sort((a, b) => a.title.localeCompare(b.title))
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

export function importProjectPages({
  store,
  scopeKey,
  sourceDir,
  parentId,
  author
}: {
  store: ProjectPagesStore
  scopeKey: string
  sourceDir: string
  parentId: string | null
  author: ProjectPageAuthor
}): { count: number } {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new ProjectPagesError('invalid', 'Choose a folder to import.')
  }
  const tree = scan(sourceDir, 0, { left: MAX_PAGES })
  if (tree.length === 0) {
    throw new ProjectPagesError('invalid', 'That folder has no markdown files.')
  }
  const total = countNodes(tree)
  if (store.listPages(scopeKey).pages.length + total > PROJECT_PAGE_LIMITS.pagesPerSpace) {
    throw new ProjectPagesError('invalid', 'Importing this folder would pass the page limit.')
  }
  const created: { id: string; file: string; title: string }[] = []
  const ids = new Map<string, string>()
  const create = (nodes: ImportNode[], parent: string | null): void => {
    for (const node of nodes) {
      const page = store.createPage(scopeKey, { parentId: parent, title: node.title }, author)
      if (node.file) {
        ids.set(resolve(node.file), page.meta.id)
        created.push({ id: page.meta.id, file: node.file, title: node.title })
      }
      create(node.children, page.meta.id)
    }
  }
  create(tree, parentId)

  for (const page of created) {
    const text = bodyOf(readFileSync(page.file, 'utf-8'), page.title)
    const markdown = rewriteMarkdownLinks(text, (href) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) {
        return null
      }
      let target: string
      try {
        target = resolve(dirname(page.file), decodeURIComponent(href.split('#')[0]))
      } catch {
        return null
      }
      const id = ids.get(target)
      return id ? pageLinkHref(id) : null
    })
    if (markdown.trim()) {
      store.updatePage(scopeKey, page.id, { baseRevision: 1, markdown }, author)
    }
  }
  return { count: total }
}

function countNodes(nodes: ImportNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
}
