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
import { extractTags, type PageTag } from '../../shared/project-pages-tags'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { matchSnippet } from './project-pages-markdown-ops'
import type { ProjectPagesStore } from './project-pages-store'

export type ProjectPageIndexEntry = {
  revision: number
  headings: string[]
  text: string
  links: string[]
  tags: PageTag[]
  /** ActiveCollab task links, for related pages and the map. */
  tasks?: ActiveCollabTaskLink[]
}
type Entry = ProjectPageIndexEntry

export type ProjectPagesSnapshot = { pages: ProjectPageMeta[]; entries: Map<string, Entry> }

export type ProjectPageSearchHit = { page: ProjectPageMeta; snippet: string; score: number }

export function createProjectPagesSearchIndex(store: ProjectPagesStore) {
  const spaces = new Map<string, Map<string, Entry>>()

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
    for (const page of pages) {
      if (entries.get(page.id)?.revision !== page.revision) {
        const markdown = store.readPage(scopeKey, page.id).markdown
        entries.set(page.id, {
          revision: page.revision,
          headings: extractHeadings(markdown),
          text: markdownToPlainText(markdown),
          links: extractPageLinks(markdown),
          tags: extractTags(markdown),
          tasks: activeCollabTaskLinks(markdown)
        })
      }
    }
    return { pages, entries }
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

export type ProjectPagesSearchIndex = ReturnType<typeof createProjectPagesSearchIndex>
