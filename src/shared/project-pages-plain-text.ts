// Plain text, headings and page links pulled out of page markdown, for search and backlinks.
import { maskMarkdownCode } from './project-pages-markdown-code-mask'

export const PAGE_LINK_SCHEME = 'muster-page://'

export function pageLinkHref(pageId: string): string {
  return `${PAGE_LINK_SCHEME}${pageId}`
}

/** Page ids this markdown links to, once each. */
export function extractPageLinks(markdown: string): string[] {
  const ids = new Set<string>()
  for (const match of maskMarkdownCode(markdown).matchAll(
    /muster-page:\/\/([A-Za-z0-9_-]{1,64})/g
  )) {
    ids.add(match[1])
  }
  return [...ids]
}

export function extractHeadings(markdown: string): string[] {
  const headings: string[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
      continue
    }
    const match = inFence ? null : line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)
    if (match) {
      headings.push(match[1])
    }
  }
  return headings
}

/** Markdown with its syntax stripped, close enough for search and snippets. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/`{3,}[^\n]*\n/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, '')
    .replace(/[*_~`]+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
