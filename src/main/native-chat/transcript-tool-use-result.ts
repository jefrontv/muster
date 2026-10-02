// Typed, bounded extras from a Claude transcript record's `toolUseResult`:
// structured patch hunks for edits, stdout/stderr for commands, sources for web
// lookups. Ported from the parked chat engine's tool-result normaliser. Never
// keeps `originalFile` or a Read's file body: those are whole files.

import type {
  NativeChatPatchHunk,
  NativeChatToolResultDetail,
  NativeChatToolSource
} from '../../shared/native-chat-types'

const TEXT_CAP = 8_000
const PATCH_LINE_CAP = 600
const CREATED_FILE_PREVIEW_LINES = 300
const SOURCE_CAP = 8

type Rec = Record<string, unknown>

function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= TEXT_CAP) {
    return { text, truncated: false }
  }
  // Head and tail: errors usually sit at the end of long output.
  const half = Math.floor(TEXT_CAP / 2)
  return { text: `${text.slice(0, half)}\n…\n${text.slice(-half)}`, truncated: true }
}

function readHunks(value: unknown): NativeChatPatchHunk[] {
  if (!Array.isArray(value)) {
    return []
  }
  const hunks: NativeChatPatchHunk[] = []
  let lineBudget = PATCH_LINE_CAP
  for (const entry of value) {
    const hunk = asRecord(entry)
    if (!hunk || !Array.isArray(hunk.lines) || lineBudget <= 0) {
      continue
    }
    const lines = hunk.lines.filter((line): line is string => typeof line === 'string')
    hunks.push({
      oldStart: typeof hunk.oldStart === 'number' ? hunk.oldStart : 0,
      oldLines: typeof hunk.oldLines === 'number' ? hunk.oldLines : 0,
      newStart: typeof hunk.newStart === 'number' ? hunk.newStart : 0,
      newLines: typeof hunk.newLines === 'number' ? hunk.newLines : 0,
      lines: lines.slice(0, lineBudget)
    })
    lineBudget -= lines.length
  }
  return hunks
}

/** Counted from the uncapped hunks so a long edit's totals stay true. */
function countPatch(value: unknown): { additions: number; deletions: number; lines: number } {
  let additions = 0
  let deletions = 0
  let total = 0
  for (const entry of Array.isArray(value) ? value : []) {
    const lines = asRecord(entry)?.lines
    for (const line of Array.isArray(lines) ? lines : []) {
      if (typeof line !== 'string') {
        continue
      }
      total += 1
      if (line.startsWith('+')) {
        additions += 1
      } else if (line.startsWith('-')) {
        deletions += 1
      }
    }
  }
  return { additions, deletions, lines: total }
}

function createdFileDetail(content: string): NativeChatToolResultDetail {
  const lines = content.replace(/\n$/, '').split('\n')
  return {
    created: true,
    additions: lines.length,
    deletions: 0,
    patch: [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        lines: lines.slice(0, CREATED_FILE_PREVIEW_LINES).map((line) => `+${line}`)
      }
    ],
    ...(lines.length > CREATED_FILE_PREVIEW_LINES ? { truncated: true } : {})
  }
}

/** WebSearch results are `[{ content: [{ title, url }] }, "summary text", …]`. */
function webSearchSources(results: unknown): NativeChatToolSource[] {
  const sources: NativeChatToolSource[] = []
  for (const entry of Array.isArray(results) ? results : []) {
    const content = asRecord(entry)?.content
    for (const item of Array.isArray(content) ? content : []) {
      const link = asRecord(item)
      if (typeof link?.url === 'string' && sources.length < SOURCE_CAP) {
        sources.push({ url: link.url, title: typeof link.title === 'string' ? link.title : null })
      }
    }
  }
  return sources
}

function commandDetail(structured: Rec): NativeChatToolResultDetail {
  const stdout = cap(typeof structured.stdout === 'string' ? structured.stdout : '')
  const stderr = cap(typeof structured.stderr === 'string' ? structured.stderr : '')
  return {
    ...(stdout.text ? { stdout: stdout.text } : {}),
    ...(stderr.text ? { stderr: stderr.text } : {}),
    ...(structured.interrupted === true ? { interrupted: true } : {}),
    ...(stdout.truncated || stderr.truncated ? { truncated: true } : {})
  }
}

export function toolUseResultDetail(value: unknown): NativeChatToolResultDetail | undefined {
  const structured = asRecord(value)
  if (!structured) {
    return undefined
  }
  if (structured.type === 'create' && typeof structured.content === 'string') {
    return createdFileDetail(structured.content)
  }
  const patch = readHunks(structured.structuredPatch)
  if (patch.length > 0) {
    const { additions, deletions, lines } = countPatch(structured.structuredPatch)
    const truncated = lines > PATCH_LINE_CAP
    return { patch, additions, deletions, ...(truncated ? { truncated: true } : {}) }
  }
  if (typeof structured.stdout === 'string' || typeof structured.stderr === 'string') {
    return commandDetail(structured)
  }
  if (Array.isArray(structured.results)) {
    const sources = webSearchSources(structured.results)
    return sources.length > 0 ? { sources } : undefined
  }
  if (typeof structured.url === 'string' && typeof structured.code === 'number') {
    return { sources: [{ url: structured.url, title: null }] }
  }
  return undefined
}
