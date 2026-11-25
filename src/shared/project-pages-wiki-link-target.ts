// Which page a [[Title]] or [[Parent/Child]] link names, checked against the pages that exist now,
// so a link written before its page resolves once the page appears.
import { childrenOf } from './project-pages-tree'
import type { ProjectPageMeta } from './project-pages-types'

export const WIKI_LINK = /\[\[([^[\]\n|]{1,200})(?:\|([^[\]\n]{1,200}))?\]\]/g
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

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

/** Each line of markdown outside code fences, with whether it can hold a link. */
export function* wikiLinkLines(markdown: string): Generator<{ line: string; linkable: boolean }> {
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence
      yield { line, linkable: false }
      continue
    }
    yield { line, linkable: !inFence && line.includes('[[') }
  }
}

/** The targets of the [[links]] in markdown, once each. */
export function extractWikiLinkRefs(markdown: string): string[] {
  const refs = new Set<string>()
  for (const { line, linkable } of wikiLinkLines(markdown)) {
    if (linkable) {
      for (const match of line.matchAll(WIKI_LINK)) {
        refs.add(match[1].trim())
      }
    }
  }
  return [...refs]
}
