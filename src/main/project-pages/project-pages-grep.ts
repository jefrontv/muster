// Exact-match search over a project's live pages: body lines, diagram shapes, database cells and,
// on request, comments. Capped by hits, characters and time, since it runs in the main process.
import type { PageCommentThread } from '../../shared/project-pages-comment-types'
import type { ProjectPageDatabase } from '../../shared/project-pages-database-types'
import { tagKey } from '../../shared/project-pages-tags'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import type { ProjectPagesSnapshot } from './project-pages-search-index'
import { ProjectPagesError } from './project-pages-store'
import { pagePath, pagesBelow } from './project-pages-tool-target'

export const GREP_LIMITS = {
  hits: 200,
  perPage: 20,
  context: 3,
  text: 240,
  /** A bad regex only ever sees this much of a line. */
  regexLine: 2_000,
  regexPattern: 200,
  chars: 30_000,
  ms: 250
} as const

export type GrepOptions = {
  query: string
  regex: boolean
  caseSensitive: boolean
  folderId: string | null
  tag: string | null
  limit: number
  context: number
  comments: boolean
}

export type GrepSources = {
  snapshot: ProjectPagesSnapshot
  database?: (pageId: string) => ProjectPageDatabase | null
  comments?: (pageId: string) => PageCommentThread[]
}

type Hit = Record<string, unknown>
type PageHits = { id: string; path: string; hits: Hit[]; more?: number }

/** Index of the first match in text, or -1. */
function matcher(options: GrepOptions): (text: string) => number {
  if (!options.regex) {
    const needle = options.caseSensitive ? options.query : options.query.toLowerCase()
    return (text) => (options.caseSensitive ? text : text.toLowerCase()).indexOf(needle)
  }
  if (options.query.length > GREP_LIMITS.regexPattern) {
    throw new ProjectPagesError(
      'invalid',
      `A regex may be at most ${GREP_LIMITS.regexPattern} characters.`
    )
  }
  let pattern: RegExp
  try {
    pattern = new RegExp(options.query, options.caseSensitive ? '' : 'i')
  } catch (error) {
    throw new ProjectPagesError('invalid', `Invalid regex: ${(error as Error).message}`)
  }
  return (text) => pattern.exec(text.slice(0, GREP_LIMITS.regexLine))?.index ?? -1
}

/** A line cut to GREP_LIMITS.text, keeping the match in view. */
function clip(text: string, at = 0): string {
  if (text.length <= GREP_LIMITS.text) {
    return text
  }
  const start = Math.max(0, Math.min(at - 60, text.length - GREP_LIMITS.text))
  const end = start + GREP_LIMITS.text
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function cellText(database: ProjectPageDatabase, propertyId: string, value: unknown): string {
  const property = database.schema.properties.find((p) => p.id === propertyId)
  if (property?.type === 'select') {
    return property.options?.find((o) => o.id === value)?.name ?? ''
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** Every searchable string on a page, with the hit fields that locate it. */
function* pageTexts(page: ProjectPageMeta, sources: GrepSources, options: GrepOptions) {
  const entry = sources.snapshot.entries.get(page.id)
  if (page.diagram) {
    for (const row of entry?.shapes ?? []) {
      yield { text: row.text, at: { shape: row.shape, field: row.field } }
    }
  } else {
    const lines = entry?.lines ?? []
    for (let i = 0; i < lines.length; i++) {
      yield { text: lines[i], at: { line: i + 1 }, lineIndex: i, lines }
    }
  }
  const database = page.database ? sources.database?.(page.id) : null
  for (const row of database?.rows ?? []) {
    for (const [propertyId, value] of Object.entries(row.properties ?? {})) {
      const column = database!.schema.properties.find((p) => p.id === propertyId)?.name
      const text = cellText(database!, propertyId, value)
      if (column && text) {
        yield {
          text,
          at: { row: row.id, row_path: pagePath(sources.snapshot.pages, row.id), column }
        }
      }
    }
  }
  if (options.comments) {
    for (const thread of sources.comments?.(page.id) ?? []) {
      for (const message of thread.messages) {
        yield { text: message.body, at: { thread: thread.id, message: message.id } }
      }
    }
  }
}

function scope(sources: GrepSources, options: GrepOptions): ProjectPageMeta[] {
  const all = sources.snapshot.pages
  const below = pagesBelow(all, options.folderId, Number.POSITIVE_INFINITY)
  const folder = options.folderId ? all.find((p) => p.id === options.folderId) : undefined
  const pages = folder ? [folder, ...below] : below
  if (!options.tag) {
    return pages
  }
  const key = tagKey(options.tag.replace(/^#/, ''))
  return pages.filter((p) => sources.snapshot.entries.get(p.id)?.tags.some((t) => t.key === key))
}

export function grepPages(
  sources: GrepSources,
  options: GrepOptions
): { count: number; truncated: boolean; note?: string; pages: PageHits[] } {
  const find = matcher(options)
  const deadline = Date.now() + GREP_LIMITS.ms
  const result: PageHits[] = []
  let count = 0
  let chars = 0
  let stop: 'limit' | 'size' | 'time' | null = null
  for (const page of scope(sources, options)) {
    const group: PageHits = {
      id: page.id,
      path: pagePath(sources.snapshot.pages, page.id),
      hits: []
    }
    let scanned = 0
    for (const item of pageTexts(page, sources, options)) {
      if (++scanned % 64 === 0 && Date.now() > deadline) {
        stop = 'time'
        break
      }
      const at = find(item.text)
      if (at < 0) {
        continue
      }
      if (group.hits.length >= GREP_LIMITS.perPage) {
        group.more = (group.more ?? 0) + 1
        continue
      }
      const hit: Hit = { ...item.at, text: clip(item.text, at) }
      if (item.lines && options.context > 0) {
        const i = item.lineIndex
        hit.before = item.lines.slice(Math.max(0, i - options.context), i).map((l) => clip(l))
        hit.after = item.lines.slice(i + 1, i + 1 + options.context).map((l) => clip(l))
      }
      chars += JSON.stringify(hit).length
      if (chars > GREP_LIMITS.chars) {
        stop = 'size'
        break
      }
      group.hits.push(hit)
      if (++count >= options.limit) {
        stop = 'limit'
        break
      }
    }
    if (group.hits.length > 0 || group.more) {
      result.push(group)
    }
    if (stop) {
      break
    }
  }
  const note =
    stop === 'time'
      ? `Stopped after ${GREP_LIMITS.ms} ms. Narrow the query, folder or tag.`
      : stop === 'size'
        ? 'Output limit reached. Narrow the query or lower context.'
        : undefined
  return { count, truncated: stop !== null, ...(note ? { note } : {}), pages: result }
}
