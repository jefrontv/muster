// Paints annotated passages inline in the plan.
//
// Why the CSS Custom Highlight API rather than wrapping text in <mark>: the document is rendered by
// react-markdown, so injecting elements into it fights React for ownership of the same nodes. The
// highlight registry styles Ranges without touching the tree — the same reason MarkdownPreview's
// find-in-page uses it (see markdown-preview-search.ts).

/** Must match the ::highlight() selectors in plan-annotation.css. */
const NOTE_HIGHLIGHT = 'plan-annotation-note'
const ACTIVE_NOTE_HIGHLIGHT = 'plan-annotation-note-active'

type HighlightScope = {
  CSS?: { highlights?: Map<string, unknown> }
  Highlight?: new () => { add: (range: Range) => void }
}

function registry(): {
  highlights: Map<string, unknown>
  create: (ranges: readonly Range[]) => unknown
} | null {
  const scope = window as unknown as HighlightScope
  const highlights = scope.CSS?.highlights
  const Ctor = scope.Highlight
  if (!highlights || typeof Ctor !== 'function') {
    return null
  }
  return {
    highlights,
    // Why .add() and not new Highlight(...ranges): spreading a large range list overflows V8's
    // argument stack. Same lesson as markdown-preview-search.ts.
    create: (ranges) => {
      const highlight = new Ctor()
      for (const range of ranges) {
        highlight.add(range)
      }
      return highlight
    }
  }
}

export function paintPlanHighlights(args: {
  ranges: readonly Range[]
  activeRange: Range | null
}): void {
  const api = registry()
  if (!api) {
    return
  }
  const inactive = args.ranges.filter((range) => range !== args.activeRange)
  if (inactive.length > 0) {
    api.highlights.set(NOTE_HIGHLIGHT, api.create(inactive))
  } else {
    api.highlights.delete(NOTE_HIGHLIGHT)
  }
  if (args.activeRange) {
    api.highlights.set(ACTIVE_NOTE_HIGHLIGHT, api.create([args.activeRange]))
  } else {
    api.highlights.delete(ACTIVE_NOTE_HIGHLIGHT)
  }
}

export function clearPlanHighlights(): void {
  const api = registry()
  api?.highlights.delete(NOTE_HIGHLIGHT)
  api?.highlights.delete(ACTIVE_NOTE_HIGHLIGHT)
}

/**
 * Rebuilds a Range for a note whose live Range is gone — a restored draft, or a re-render.
 *
 * Why search by text rather than offsets: the note was anchored to a quote precisely because
 * positions move. Scoped to the note's block first so a phrase repeated elsewhere cannot steal it.
 */
export function findRangeForQuote(
  root: HTMLElement,
  quote: string,
  startLine: number
): Range | null {
  if (quote.length === 0) {
    return null
  }
  const block = root.querySelector<HTMLElement>(`[data-plan-line-start="${startLine}"]`) ?? root
  return searchWithin(block, quote) ?? searchWithin(root, quote)
}

function searchWithin(host: HTMLElement, quote: string): Range | null {
  const needle = quote.replace(/\s+/g, ' ').trim()
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  // Accumulate text across nodes so a quote spanning inline markup (a link, a `code` span) is
  // still found — which is most quotes worth making in a plan.
  const nodes: Text[] = []
  let joined = ''
  let node = walker.nextNode() as Text | null
  while (node) {
    nodes.push(node)
    joined += node.data
    node = walker.nextNode() as Text | null
  }
  const index = joined.replace(/\s+/g, ' ').indexOf(needle)
  if (index < 0) {
    return null
  }
  return rangeFromOffsets(nodes, joined, index, needle.length)
}

/** Maps a whitespace-normalised offset back onto the original text nodes. */
function rangeFromOffsets(
  nodes: readonly Text[],
  joined: string,
  start: number,
  length: number
): Range | null {
  const map: number[] = []
  let normalised = ''
  for (let i = 0; i < joined.length; i += 1) {
    const char = joined[i]!
    const isSpace = /\s/.test(char)
    if (isSpace && normalised.endsWith(' ')) {
      continue
    }
    map.push(i)
    normalised += isSpace ? ' ' : char
  }
  const rawStart = map[start]
  const rawEnd = map[start + length - 1]
  if (rawStart === undefined || rawEnd === undefined) {
    return null
  }
  const from = locate(nodes, rawStart)
  const to = locate(nodes, rawEnd + 1)
  if (!from || !to) {
    return null
  }
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

function locate(nodes: readonly Text[], offset: number): { node: Text; offset: number } | null {
  let remaining = offset
  for (const node of nodes) {
    if (remaining <= node.data.length) {
      return { node, offset: remaining }
    }
    remaining -= node.data.length
  }
  return null
}
