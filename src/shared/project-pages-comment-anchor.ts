// Finds a comment's quote again after the page text moves. Line numbers drift when an agent
// rewrites a page; the quote and its neighbours rarely do.
import { PAGE_COMMENT_LIMITS, type PageCommentAnchor } from './project-pages-comment-types'

export type TextRange = { start: number; end: number }

export function anchorAt(text: string, start: number, end: number): PageCommentAnchor {
  const context = PAGE_COMMENT_LIMITS.context
  return {
    quote: text.slice(start, end).slice(0, PAGE_COMMENT_LIMITS.quote),
    prefix: text.slice(Math.max(0, start - context), start),
    suffix: text.slice(end, end + context)
  }
}

function sharedSuffixLength(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n += 1
  }
  return n
}

function sharedPrefixLength(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) {
    n += 1
  }
  return n
}

/** Best occurrence of the quote, scored by how much of the old context still surrounds it. */
export function locateAnchor(text: string, anchor: PageCommentAnchor): TextRange | null {
  const { quote, prefix, suffix } = anchor
  if (!quote) {
    return null
  }
  const context = PAGE_COMMENT_LIMITS.context
  let best: TextRange | null = null
  let bestScore = -1
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const end = at + quote.length
    const score =
      sharedSuffixLength(text.slice(Math.max(0, at - context), at), prefix) +
      sharedPrefixLength(text.slice(end, end + context), suffix)
    if (score > bestScore) {
      best = { start: at, end }
      bestScore = score
    }
  }
  return best
}
