// Byte-budgeted tail windowing for MCP run and job logs.
//
// Line counts alone let a single verbose dump overwhelm the client's tool response ceiling, so
// each line's text is clamped first and the window grows backward until the byte budget is spent.

import type { SiteRunLogLine } from '../../../shared/site-run-types'
import { findFirstErrorIndex } from '../site-run-log'

export const DEFAULT_RUN_LOG_MAX_BYTES = 24_000
export const DEFAULT_JOB_LOG_MAX_BYTES = 12_000
export const MAX_LOG_BYTES = 200_000
export const MAX_LOG_LINE_CHARS = 2_000

export type LogByteWindow = {
  lines: SiteRunLogLine[]
  truncatedEarlier: number
  truncatedByBytes: boolean
  firstErrorIndex: number
}

export function fitLogLinesToByteBudget(
  lines: readonly SiteRunLogLine[],
  truncatedEarlier: number,
  maxBytes: number
): LogByteWindow {
  if (lines.length === 0) {
    return { lines: [], truncatedEarlier, truncatedByBytes: false, firstErrorIndex: -1 }
  }
  let anyLineClamped = false
  const clamped = lines.map((entry) => {
    if (entry.text.length <= MAX_LOG_LINE_CHARS) {
      return entry
    }
    anyLineClamped = true
    return { ...entry, text: `${entry.text.slice(0, MAX_LOG_LINE_CHARS)}… [line truncated]` }
  })

  const budget = Math.max(0, maxBytes)
  let usedBytes = 0
  let startIndex = clamped.length
  for (let index = clamped.length - 1; index >= 0; index -= 1) {
    const entry = clamped[index]!
    const entryBytes = Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1
    // Always keep the newest line so a single huge log entry still shows the latest status.
    if (startIndex < clamped.length && usedBytes + entryBytes > budget) {
      break
    }
    usedBytes += entryBytes
    startIndex = index
  }

  const kept = clamped.slice(startIndex)
  const dropped = startIndex
  return {
    lines: kept,
    truncatedEarlier: truncatedEarlier + dropped,
    truncatedByBytes: dropped > 0 || anyLineClamped,
    firstErrorIndex: findFirstErrorIndex(kept)
  }
}
