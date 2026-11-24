// Page outline: heading rows for the rail and which section the reader is in.
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  buildMarkdownTableOfContents,
  type MarkdownTocItem
} from '../editor/markdown-table-of-contents'

export const PAGE_OUTLINE_MIN_HEADINGS = 2
// A heading this close under the top edge already counts as the section in view.
export const PAGE_OUTLINE_SPY_OFFSET_PX = 48

export type PageOutlineHeading = { level: number; text: string }

/** A table-of-contents item flattened for the rail; depth is its nesting, not its h-level. */
export type PageOutlineItem = MarkdownTocItem & { depth: number }

export function collectPageOutlineHeadings(doc: ProseMirrorNode): PageOutlineHeading[] {
  const headings: PageOutlineHeading[] = []
  doc.descendants((node) => {
    if (node.type.name !== 'heading') {
      return true
    }
    headings.push({ level: Number(node.attrs.level), text: node.textContent })
    return false
  })
  return headings
}

const MARKDOWN_PUNCTUATION = /[\\`*_{}[\]()#+\-.!<>|~&]/g

// Escaped so the shared markdown TOC parser reads heading text back literally.
export function pageOutlineMarkdown(headings: readonly PageOutlineHeading[]): string {
  return headings
    .filter((heading) => heading.level >= 1 && heading.level <= 6)
    .map((heading) => {
      const text = heading.text.replace(/\s+/g, ' ').trim().replace(MARKDOWN_PUNCTUATION, '\\$&')
      return `${'#'.repeat(heading.level)} ${text}`
    })
    .join('\n\n')
}

function flattenOutline(items: readonly MarkdownTocItem[], depth: number): PageOutlineItem[] {
  return items.flatMap((item) => [{ ...item, depth }, ...flattenOutline(item.children, depth + 1)])
}

export function buildPageOutline(headings: readonly PageOutlineHeading[]): PageOutlineItem[] {
  return flattenOutline(buildMarkdownTableOfContents(pageOutlineMarkdown(headings)), 0)
}

export function showsPageOutline(items: readonly PageOutlineItem[]): boolean {
  return items.length >= PAGE_OUTLINE_MIN_HEADINGS
}

export function samePageOutline(
  a: readonly PageOutlineItem[],
  b: readonly PageOutlineItem[]
): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]
      return (
        item.id === other.id &&
        item.title === other.title &&
        item.level === other.level &&
        item.depth === other.depth
      )
    })
  )
}

/** Index of the heading whose section is in view, or -1 before the first one shows. */
export function pageOutlineActiveIndex({
  tops,
  scrollTop,
  viewportHeight,
  scrollHeight
}: {
  /** Each heading's offset from the top of the scrolled content, in document order. */
  tops: readonly number[]
  scrollTop: number
  viewportHeight: number
  scrollHeight: number
}): number {
  const bottom = scrollTop + viewportHeight
  // Scrolled to the end, the last headings can never reach the top line.
  const atEnd = scrollTop > 0 && bottom >= scrollHeight - 1
  const line = atEnd ? bottom - 1 : scrollTop + PAGE_OUTLINE_SPY_OFFSET_PX
  let active = -1
  tops.forEach((top, index) => {
    if (top <= line) {
      active = index
    }
  })
  if (active === -1 && tops.length > 0 && tops[0] < bottom) {
    return 0
  }
  return active
}
