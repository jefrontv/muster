// Turns [[Title]] links in agent-written markdown into page links, so agents link pages by name.
// Links to pages that don't exist yet stay as [[Title]] and resolve once the page appears.
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import {
  findWikiLinkPage,
  WIKI_LINK,
  wikiLinkLines
} from '../../shared/project-pages-wiki-link-target'

export function resolveWikiLinks(
  markdown: string,
  pages: readonly ProjectPageMeta[]
): { markdown: string; unresolved: string[] } {
  const unresolved = new Set<string>()
  const lines = [...wikiLinkLines(markdown)].map(({ line, linkable }) =>
    linkable
      ? line.replace(WIKI_LINK, (whole, ref: string, alias: string | undefined) => {
          const page = findWikiLinkPage(pages, ref)
          if (!page) {
            unresolved.add(ref.trim())
            return whole
          }
          const label = (alias ?? page.title).trim() || 'Untitled'
          return `[${label.replace(/[[\]]/g, '')}](${pageLinkHref(page.id)})`
        })
      : line
  )
  return { markdown: lines.join('\n'), unresolved: [...unresolved] }
}
