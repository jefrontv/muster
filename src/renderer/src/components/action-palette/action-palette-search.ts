import { isCmdJPaletteQueryTooLarge } from '../cmd-j/palette-results'
import type { ActionPaletteEntry } from './action-palette-entries'

/** Weight per searched field; the title dominates so exact labels win over keyword noise. */
const TITLE_WEIGHT = 1
const KEYWORD_WEIGHT = 0.62
const DETAIL_WEIGHT = 0.4

const WORD_BOUNDARY = /[\s.\-/:›»_]/

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Ordered-subsequence match. Adjacent hits and word-boundary hits score higher, so
 * "gtf" ranks "Go to File" above a scattered match in a long settings path.
 */
function subsequenceScore(token: string, value: string): number | null {
  let cursor = 0
  let score = 0
  let streak = 0
  for (const character of token) {
    const hit = value.indexOf(character, cursor)
    if (hit < 0) {
      return null
    }
    streak = hit === cursor ? streak + 1 : 0
    const atBoundary = hit === 0 || WORD_BOUNDARY.test(value[hit - 1] ?? '')
    score += 10 + streak * 5 + (atBoundary ? 8 : 0)
    cursor = hit + 1
  }
  // Shorter haystacks are more specific matches for the same token.
  return score / (1 + value.length / 120)
}

function fieldScore(token: string, value: string): number | null {
  const haystack = normalize(value)
  if (haystack.length === 0) {
    return null
  }
  if (haystack === token) {
    return 1000
  }
  if (haystack.startsWith(token)) {
    return 700
  }
  const boundaryIndex = haystack.indexOf(token)
  if (boundaryIndex > 0 && WORD_BOUNDARY.test(haystack[boundaryIndex - 1] ?? '')) {
    return 520
  }
  if (boundaryIndex > 0) {
    return 300
  }
  return subsequenceScore(token, haystack)
}

function bestWeightedScore(
  token: string,
  values: readonly string[],
  weight: number
): number | null {
  let best: number | null = null
  for (const value of values) {
    const score = fieldScore(token, value)
    if (score !== null && (best === null || score > best)) {
      best = score
    }
  }
  return best === null ? null : best * weight
}

function entryScore(tokens: readonly string[], entry: ActionPaletteEntry): number | null {
  let total = 0
  for (const token of tokens) {
    const candidates = [
      bestWeightedScore(token, [entry.title], TITLE_WEIGHT),
      bestWeightedScore(token, entry.keywords, KEYWORD_WEIGHT),
      bestWeightedScore(token, [entry.detail], DETAIL_WEIGHT)
    ]
    let best: number | null = null
    for (const candidate of candidates) {
      if (candidate !== null && (best === null || candidate > best)) {
        best = candidate
      }
    }
    // Every token must land somewhere, so extra words narrow instead of widen.
    if (best === null) {
      return null
    }
    total += best
  }
  return total
}

function compareByGroupOrder(a: ActionPaletteEntry, b: ActionPaletteEntry): number {
  return a.groupOrder - b.groupOrder || a.order - b.order || a.title.localeCompare(b.title)
}

export function rankActionPaletteEntries(
  query: string,
  entries: readonly ActionPaletteEntry[]
): ActionPaletteEntry[] {
  // A pasted buffer can't be a command name; scoring it would stall the render.
  if (isCmdJPaletteQueryTooLarge(query)) {
    return []
  }
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return [...entries].sort(compareByGroupOrder)
  }

  const scored: { entry: ActionPaletteEntry; score: number }[] = []
  for (const entry of entries) {
    const score = entryScore(tokens, entry)
    if (score !== null) {
      scored.push({ entry, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || compareByGroupOrder(a.entry, b.entry))
    .map((item) => item.entry)
}

/** Typed queries stay long enough to scroll but short enough that cmdk keeps up. */
export const ACTION_PALETTE_MAX_RESULTS = 60
/** Empty query is a browse state; a slice per group keeps every kind visible above the fold. */
export const ACTION_PALETTE_MAX_PER_GROUP = 10

export type ActionPaletteResults = {
  entries: ActionPaletteEntry[]
  /** Matches dropped by the caps above, so the footer can point at typing to narrow. */
  hiddenCount: number
}

export function selectActionPaletteResults(
  query: string,
  entries: readonly ActionPaletteEntry[]
): ActionPaletteResults {
  const ranked = rankActionPaletteEntries(query, entries)
  if (query.trim().length > 0) {
    return {
      entries: ranked.slice(0, ACTION_PALETTE_MAX_RESULTS),
      hiddenCount: Math.max(0, ranked.length - ACTION_PALETTE_MAX_RESULTS)
    }
  }

  const perGroup: Record<string, number> = {}
  const capped: ActionPaletteEntry[] = []
  for (const entry of ranked) {
    const taken = perGroup[entry.group] ?? 0
    if (taken >= ACTION_PALETTE_MAX_PER_GROUP) {
      continue
    }
    perGroup[entry.group] = taken + 1
    capped.push(entry)
  }
  return { entries: capped, hiddenCount: ranked.length - capped.length }
}
