// Text operations agents run on a page body: anchored replace, append under a heading, sections.
import { ProjectPagesError } from './project-pages-store'
import { toolCount, toolText, type ToolArgs } from './project-pages-tool-args'

type Heading = { line: number; level: number; text: string }

function headings(lines: readonly string[]): Heading[] {
  const found: Heading[] = []
  let fence: string | null = null
  lines.forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (marker) {
      // A fence closes only on the same character, so a ~~~ inside a ``` block stays text.
      fence = fence === null ? marker[0] : fence === marker[0] ? null : fence
      return
    }
    const match = fence === null ? line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/) : null
    if (match) {
      found.push({ line: index, level: match[1].length, text: match[2] })
    }
  })
  return found
}

function sameHeading(text: string, wanted: string): boolean {
  const clean = (value: string): string =>
    value
      .replace(/^#+\s*/, '')
      .trim()
      .toLowerCase()
  return clean(text) === clean(wanted)
}

/** Lines [start, end) of the section under a heading, heading line included. */
function sectionRange(lines: readonly string[], heading: string): [number, number] {
  const all = headings(lines)
  const matches = all.filter((h) => sameHeading(h.text, heading))
  if (matches.length === 0) {
    throw new ProjectPagesError(
      'not_found',
      `No heading "${heading}". Headings: ${all.map((h) => h.text).join(', ') || 'none'}.`
    )
  }
  if (matches.length > 1) {
    throw new ProjectPagesError('invalid', `More than one heading is "${heading}".`)
  }
  const start = matches[0]
  const next = all.find((h) => h.line > start.line && h.level <= start.level)
  return [start.line, next ? next.line : lines.length]
}

export function readSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n')
  const [start, end] = sectionRange(lines, heading)
  return lines.slice(start, end).join('\n').trimEnd()
}

export function replaceAnchor(markdown: string, oldText: string, newText: string): string {
  if (!oldText) {
    throw new ProjectPagesError('invalid', 'old_text is required.')
  }
  const first = markdown.indexOf(oldText)
  if (first === -1) {
    throw new ProjectPagesError('not_found', 'old_text is not in the page. Re-read it and retry.')
  }
  if (markdown.includes(oldText, first + 1)) {
    throw new ProjectPagesError(
      'invalid',
      'old_text appears more than once. Include more surrounding text.'
    )
  }
  return markdown.slice(0, first) + newText + markdown.slice(first + oldText.length)
}

export function appendMarkdown(markdown: string, addition: string, heading?: string): string {
  const block = addition.trim()
  if (!block) {
    throw new ProjectPagesError('invalid', 'markdown is required.')
  }
  if (!heading) {
    const body = markdown.trimEnd()
    return body ? `${body}\n\n${block}\n` : `${block}\n`
  }
  const lines = markdown.split('\n')
  const [start, end] = sectionRange(lines, heading)
  let last = end
  while (last > start + 1 && lines[last - 1].trim() === '') {
    last -= 1
  }
  const before = lines.slice(0, last).join('\n')
  const after = lines.slice(end).join('\n')
  return after ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}\n`
}

/** A short excerpt around the first match, or null when the text does not contain the query. */
export function matchSnippet(text: string, query: string, radius = 60): string | null {
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) {
    return null
  }
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + query.length + radius)
  const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`
}
/** Body lines as read_page, grep_pages and review notes number them (1-based, title excluded). */
export function bodyLines(markdown: string): string[] {
  const lines = markdown.split('\n')
  if (lines.length > 1 && lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

/** What read_page returns as markdown: the body, one section, or a from_line/to_line slice. */
export function pageBodyForRead(
  markdown: string,
  args: ToolArgs
): { body: string; lines?: { from: number; to: number; total: number } } {
  const section = toolText(args, 'section')
  const from = toolCount(args, 'from_line')
  const to = toolCount(args, 'to_line')
  if (from === undefined && to === undefined) {
    return { body: section ? readSection(markdown, section) : markdown }
  }
  if (section) {
    throw new ProjectPagesError('invalid', 'Pass section or from_line/to_line, not both.')
  }
  const all = bodyLines(markdown)
  const start = from ?? 1
  const end = Math.min(to ?? all.length, all.length)
  if (start < 1 || start > all.length || end < start) {
    throw new ProjectPagesError(
      'invalid',
      `Lines run from 1 to ${all.length}; from_line must start there and to_line must not be before it.`
    )
  }
  return {
    body: all.slice(start - 1, end).join('\n'),
    lines: { from: start, to: end, total: all.length }
  }
}
