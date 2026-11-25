// Which page a [[Title]] or [[Parent/Child]] link names, checked against the pages that exist now,
// so a link written before its page resolves once the page appears.
import { maskMarkdownCode } from './project-pages-markdown-code-mask'
import { childrenOf } from './project-pages-tree'
import type { ProjectPageMeta } from './project-pages-types'

export const WIKI_LINK = /\[\[([^[\]\n|]{1,200})(?:\|([^[\]\n]{1,200}))?\]\]/g

const titleKey = (page: ProjectPageMeta): string => (page.title || 'Untitled').toLowerCase()

/** An id, a path from the top, else a title that only one live page has. */
export function findWikiLinkPage(
  pages: readonly ProjectPageMeta[],
  ref: string
): ProjectPageMeta | null {
  const live = pages.filter((page) => page.archivedAt === null)
  const wanted = ref.trim()
  const byId = live.find((page) => page.id === wanted)
  if (byId) {
    return byId
  }
  const segments = wanted.split('/').map((part) => part.trim().toLowerCase())
  let parentId: string | null = null
  let found: ProjectPageMeta | null = null
  for (const segment of segments) {
    const matches = childrenOf(live, parentId).filter((page) => titleKey(page) === segment)
    found = matches.length === 1 ? matches[0] : null
    if (!found) {
      break
    }
    parentId = found.id
  }
  if (found) {
    return found
  }
  const title = segments.at(-1) ?? ''
  const matches = live.filter((page) => titleKey(page) === title)
  return matches.length === 1 ? matches[0] : null
}

/** The [[links]] outside code and escapes, with their spans in the original markdown. */
export function wikiLinkMatches(markdown: string): RegExpExecArray[] {
  const masked = maskMarkdownCode(markdown)
  return masked.includes('[[') ? [...masked.matchAll(WIKI_LINK)] : []
}

/** The targets of the [[links]] in markdown, once each. */
export function extractWikiLinkRefs(markdown: string): string[] {
  return [...new Set(wikiLinkMatches(markdown).map((match) => match[1].trim()))]
}
