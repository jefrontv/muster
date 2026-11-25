// Turns [[Title]] links in agent-written markdown into page links, so agents link pages by name.
// Links to pages that don't exist yet stay as [[Title]] and resolve once the page appears.
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { findWikiLinkPage, wikiLinkMatches } from '../../shared/project-pages-wiki-link-target'

export function resolveWikiLinks(
  markdown: string,
  pages: readonly ProjectPageMeta[]
): { markdown: string; unresolved: string[] } {
  const unresolved = new Set<string>()
  let out = ''
  let last = 0
  // Matches come from the code-masked text, so their spans copy straight from the original.
  for (const match of wikiLinkMatches(markdown)) {
    const [whole, ref, alias] = match
    const page = findWikiLinkPage(pages, ref)
    if (!page) {
      unresolved.add(ref.trim())
      continue
    }
    const label = (alias ?? page.title).trim() || 'Untitled'
    const link = `[${label.replace(/[[\]]/g, '')}](${pageLinkHref(page.id)})`
    out += `${markdown.slice(last, match.index)}${link}`
    last = match.index + whole.length
  }
  return { markdown: out + markdown.slice(last), unresolved: [...unresolved] }
}
