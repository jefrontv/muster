// Finding a query inside transcript text and cutting a readable excerpt around
// it. Pure and separate from the index so the matching rules can be tested
// without touching disk.

import {
  CHAT_SEARCH_MAX_QUERY_LENGTH,
  CHAT_SEARCH_MIN_QUERY_LENGTH,
  CHAT_SEARCH_SNIPPET_LENGTH
} from '../../shared/chat-thread-search-types'

/** Collapses whitespace so a match spanning a line break still reads as one line. */
export function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The query as searched, or null when it is not worth running.
 *
 * Over-long queries are clipped rather than rejected: a paste into the search
 * box should still search, just not with 10KB of needle.
 */
export function normalizeSearchQuery(query: string): string | null {
  const collapsed = normalizeSearchText(query).toLowerCase()
  if (collapsed.length < CHAT_SEARCH_MIN_QUERY_LENGTH) {
    return null
  }
  return collapsed.slice(0, CHAT_SEARCH_MAX_QUERY_LENGTH)
}

/**
 * An excerpt around the first occurrence, or null when the text does not match.
 *
 * The window is nudged to start a little before the match so the reader gets
 * lead-in context rather than the match sitting flush against the left edge.
 */
export function buildSearchSnippet(
  text: string,
  normalizedQuery: string,
  maxLength = CHAT_SEARCH_SNIPPET_LENGTH
): string | null {
  const normalized = normalizeSearchText(text)
  const index = normalized.toLowerCase().indexOf(normalizedQuery)
  if (index === -1) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  const lead = Math.floor((maxLength - normalizedQuery.length) / 3)
  const start = Math.max(0, Math.min(index - lead, normalized.length - maxLength))
  const end = Math.min(normalized.length, start + maxLength)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < normalized.length ? '…' : ''
  return `${prefix}${normalized.slice(start, end)}${suffix}`
}
