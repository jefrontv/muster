// In-memory search over one space's pages: titles, headings and plain text, plus who links to
// whom. Entries are refreshed lazily by revision, so writes never wait on indexing.
import {
  extractHeadings,
  extractPageLinks,
  markdownToPlainText
} from '../../shared/project-pages-plain-text'
import {
  activeCollabTaskLinks,
  type ActiveCollabTaskLink
} from '../../shared/project-pages-activecollab-links'
import { scanDiagramText, type DiagramTextRow } from '../../shared/project-pages-diagram-text'
import { extractTags, type PageTag } from '../../shared/project-pages-tags'
import { extractWikiLinkRefs, findWikiLinkPage } from '../../shared/project-pages-wiki-link-target'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { bodyLines, matchSnippet } from './project-pages-markdown-ops'
import type { ProjectPagesStore } from './project-pages-store'

export type ProjectPageIndexEntry = {
  revision: number
  headings: string[]
  text: string
  /** Raw body lines, numbered like read_page; grep_pages matches these. */
  lines: string[]
  /** Diagram pages: label and tooltip text by cell id. */
  shapes?: DiagramTextRow[]
  /** Pages this one links to now: its page links plus the [[links]] that resolve. */
  links: string[]
  /** muster-page:// targets, cached with the revision. */
  pageLinks?: string[]
  /** [[link]] targets; they resolve against the current pages on every refresh. */
  wikiRefs?: string[]
  tags: PageTag[]
  /** ActiveCollab task links, for related pages and the map. */
  tasks?: ActiveCollabTaskLink[]
}
type Entry = ProjectPageIndexEntry

export type ProjectPagesSnapshot = { pages: ProjectPageMeta[]; entries: Map<string, Entry> }

export type ProjectPageSearchHit = { page: ProjectPageMeta; snippet: string; score: number }

export function createProjectPagesSearchIndex(
  store: ProjectPagesStore,
  options: { diagramXml?: (scopeKey: string, pageId: string) => string } = {}
) {
  const spaces = new Map<string, Map<string, Entry>>()
  const resolvedFor = new Map<string, string>()

  function refresh(scopeKey: string): ProjectPagesSnapshot {
    const pages = store.listPages(scopeKey).pages.filter((page) => page.archivedAt === null)
    const entries = spaces.get(scopeKey) ?? new Map<string, Entry>()
    spaces.set(scopeKey, entries)
    const live = new Set(pages.map((page) => page.id))
    for (const id of entries.keys()) {
      if (!live.has(id)) {
        entries.delete(id)
      }
    }
    let changed = false
    for (const page of pages) {
      if (entries.get(page.id)?.revision !== page.revision) {
        changed = true
        const markdown = store.readPage(scopeKey, page.id).markdown
        const pageLinks = extractPageLinks(markdown)
        entries.set(page.id, {
          revision: page.revision,
          headings: extractHeadings(markdown),
          text: markdownToPlainText(markdown),
          lines: bodyLines(markdown),
          shapes: page.diagram ? diagramShapes(scopeKey, page.id) : undefined,
          links: pageLinks,
          pageLinks,
          wikiRefs: extractWikiLinkRefs(markdown),
          tags: extractTags(markdown),
          tasks: activeCollabTaskLinks(markdown)
        })
      }
    }
    // A create, rename, move, restore or archive changes what a [[link]] names.
    const names = pages.map((page) => `${page.id}:${page.parentId}:${page.title}`).join('\n')
    if (changed || resolvedFor.get(scopeKey) !== names) {
      resolvedFor.set(scopeKey, names)
      for (const entry of entries.values()) {
        entry.links = resolvedLinks(entry, pages)
      }
    }
    return { pages, entries }
  }

  function diagramShapes(scopeKey: string, pageId: string): DiagramTextRow[] {
    try {
      return options.diagramXml ? scanDiagramText(options.diagramXml(scopeKey, pageId)) : []
    } catch {
      return []
    }
  }

  function search(scopeKey: string, query: string, limit = 20): ProjectPageSearchHit[] {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return []
    }
    const { pages, entries } = refresh(scopeKey)
    const hits: ProjectPageSearchHit[] = []
    for (const page of pages) {
      const entry = entries.get(page.id)
      const title = page.title.toLowerCase()
      const heading = entry?.headings.find((h) => h.toLowerCase().includes(needle))
      const body = entry ? matchSnippet(entry.text, query) : null
      // Ranking: title, then heading, then body; an exact or prefix title match goes first.
      const score =
        (title === needle ? 8 : title.startsWith(needle) ? 6 : title.includes(needle) ? 4 : 0) +
        (heading ? 2 : 0) +
        (body ? 1 : 0)
      if (score > 0) {
        hits.push({ page, score, snippet: body ?? heading ?? '' })
      }
    }
    return hits
      .sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt)
      .slice(0, limit)
  }

  function backlinks(scopeKey: string, pageId: string): ProjectPageMeta[] {
    const { pages, entries } = refresh(scopeKey)
    return pages.filter(
      (page) => page.id !== pageId && entries.get(page.id)?.links.includes(pageId)
    )
  }

  return { search, backlinks, snapshot: refresh }
}

function resolvedLinks(entry: Entry, pages: readonly ProjectPageMeta[]): string[] {
  const ids = new Set(entry.pageLinks ?? [])
  for (const ref of entry.wikiRefs ?? []) {
    const page = findWikiLinkPage(pages, ref)
    if (page) {
      ids.add(page.id)
    }
  }
  return [...ids]
}

export type ProjectPagesSearchIndex = ReturnType<typeof createProjectPagesSearchIndex>
