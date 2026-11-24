// Turns [[Title]] links in agent-written markdown into page links, so agents link pages by name.
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { resolvePageRef } from './project-pages-tool-target'

const WIKI_LINK = /\[\[([^[\]\n|]{1,200})(?:\|([^[\]\n]{1,200}))?\]\]/g
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

/** A path from the top, else a title that only one live page has. */
function findPage(pages: readonly ProjectPageMeta[], ref: string): ProjectPageMeta | null {
  try {
    return resolvePageRef(pages, ref)
  } catch {
    const title = ref.split('/').pop()?.trim().toLowerCase() ?? ''
    const matches = pages.filter(
      (page) => page.archivedAt === null && (page.title || 'Untitled').toLowerCase() === title
    )
    return matches.length === 1 ? matches[0] : null
  }
}

export function resolveWikiLinks(
  markdown: string,
  pages: readonly ProjectPageMeta[]
): { markdown: string; unresolved: string[] } {
  const unresolved = new Set<string>()
  let inFence = false
  const lines = markdown.split('\n').map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence
      return line
    }
    if (inFence || !line.includes('[[')) {
      return line
    }
    return line.replace(WIKI_LINK, (whole, ref: string, alias: string | undefined) => {
      const page = findPage(pages, ref.trim())
      if (!page) {
        unresolved.add(ref.trim())
        return whole
      }
      const label = (alias ?? page.title).trim() || 'Untitled'
      return `[${label.replace(/[[\]]/g, '')}](${pageLinkHref(page.id)})`
    })
  })
  return { markdown: lines.join('\n'), unresolved: [...unresolved] }
}
