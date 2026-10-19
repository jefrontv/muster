// Unified-diff rows from the CLI's structured patch hunks, with word-level
// highlights where a removed line is paired with the line that replaced it.

import type { ChatEnginePatchHunk } from '../../../../shared/chat-engine-types'

export type DiffSegment = { text: string; changed: boolean }

export type DiffRow =
  | { kind: 'hunk'; key: string; header: string }
  | {
      kind: 'line'
      key: string
      type: 'ctx' | 'add' | 'del'
      oldNo: number | null
      newNo: number | null
      segments: DiffSegment[]
    }

/** Beyond this many tokens a pair is highlighted whole; LCS cost grows with the product. */
const MAX_WORD_DIFF_TOKENS = 200

function tokens(text: string): string[] {
  return text.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? []
}

function merge(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = []
  for (const segment of segments) {
    const last = merged.at(-1)
    if (last && last.changed === segment.changed) {
      last.text += segment.text
    } else {
      merged.push({ ...segment })
    }
  }
  return merged
}

/** Marks the tokens each side does not share with the other (longest common subsequence). */
export function wordDiff(
  before: string,
  after: string
): { before: DiffSegment[]; after: DiffSegment[] } {
  const a = tokens(before)
  const b = tokens(after)
  if (a.length > MAX_WORD_DIFF_TOKENS || b.length > MAX_WORD_DIFF_TOKENS) {
    return { before: [{ text: before, changed: true }], after: [{ text: after, changed: true }] }
  }
  const table = Array.from({ length: a.length + 1 }, () =>
    Array.from<number>({ length: b.length + 1 }).fill(0)
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const left: DiffSegment[] = []
  const right: DiffSegment[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      left.push({ text: a[i]!, changed: false })
      right.push({ text: b[j]!, changed: false })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      left.push({ text: a[i]!, changed: true })
      i += 1
    } else {
      right.push({ text: b[j]!, changed: true })
      j += 1
    }
  }
  for (; i < a.length; i += 1) {
    left.push({ text: a[i]!, changed: true })
  }
  for (; j < b.length; j += 1) {
    right.push({ text: b[j]!, changed: true })
  }
  return { before: merge(left), after: merge(right) }
}

export function diffRows(hunks: ChatEnginePatchHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  hunks.forEach((hunk, hunkIndex) => {
    if (hunk.oldLines > 0 || hunkIndex > 0) {
      rows.push({
        kind: 'hunk',
        key: `h${hunkIndex}`,
        header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
      })
    }
    let oldNo = hunk.oldStart
    let newNo = hunk.newStart
    const lines = hunk.lines.filter((line) => !line.startsWith('\\'))
    let index = 0
    while (index < lines.length) {
      const line = lines[index] ?? ''
      if (!line.startsWith('-') && !line.startsWith('+')) {
        rows.push({
          kind: 'line',
          key: `h${hunkIndex}-${index}`,
          type: 'ctx',
          oldNo,
          newNo,
          segments: [{ text: line.slice(1), changed: false }]
        })
        oldNo += 1
        newNo += 1
        index += 1
        continue
      }
      // A run of removals followed by additions: pair them line by line for word highlights.
      const removed: string[] = []
      const added: string[] = []
      while (index < lines.length && lines[index]?.startsWith('-')) {
        removed.push((lines[index] ?? '').slice(1))
        index += 1
      }
      while (index < lines.length && lines[index]?.startsWith('+')) {
        added.push((lines[index] ?? '').slice(1))
        index += 1
      }
      const pairs =
        removed.length > 0 && added.length > 0 ? Math.min(removed.length, added.length) : 0
      const diffs = Array.from({ length: pairs }, (_, pair) =>
        wordDiff(removed[pair]!, added[pair]!)
      )
      removed.forEach((text, offset) => {
        rows.push({
          kind: 'line',
          key: `h${hunkIndex}-d${oldNo}`,
          type: 'del',
          oldNo: oldNo++,
          newNo: null,
          segments: diffs[offset]?.before ?? [{ text, changed: false }]
        })
      })
      added.forEach((text, offset) => {
        rows.push({
          kind: 'line',
          key: `h${hunkIndex}-a${newNo}`,
          type: 'add',
          oldNo: null,
          newNo: newNo++,
          segments: diffs[offset]?.after ?? [{ text, changed: false }]
        })
      })
    }
  })
  return rows
}

const SIGN = { add: '+ ', del: '- ', ctx: '  ' } as const

/** The diff as plain text, the way the card draws it. */
export function diffRowsText(rows: DiffRow[]): string {
  return rows
    .map((row) =>
      row.kind === 'hunk'
        ? row.header
        : `${SIGN[row.type]}${row.segments.map((segment) => segment.text).join('')}`
    )
    .join('\n')
}
