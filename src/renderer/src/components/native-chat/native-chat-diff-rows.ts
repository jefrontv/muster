// Unified-diff rows from the CLI's structured patch hunks, with word-level
// highlights where a removed line pairs with the line that replaced it. Ported
// from the parked redesign's thread-diff-lines. A call without a recorded patch
// (still running, or an older transcript) falls back to a real line diff of its
// old/new strings, so a one-line change never reads as 30 red and 30 green lines.

import type { NativeChatPatchHunk } from '../../../../shared/native-chat-types'

export type NativeChatDiffSegment = { text: string; changed: boolean }

export type NativeChatDiffRow =
  | { kind: 'hunk'; key: string; header: string }
  | {
      kind: 'line'
      key: string
      type: 'ctx' | 'add' | 'del'
      oldNo: number | null
      newNo: number | null
      segments: NativeChatDiffSegment[]
    }

/** Beyond this many tokens a pair is highlighted whole; LCS cost grows with the product. */
const MAX_WORD_DIFF_TOKENS = 200
/** Input fallback only: the line LCS is quadratic. */
const MAX_INPUT_DIFF_LINES = 400

function tokens(text: string): string[] {
  return text.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? []
}

function merge(segments: NativeChatDiffSegment[]): NativeChatDiffSegment[] {
  const merged: NativeChatDiffSegment[] = []
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

/** Longest-common-subsequence walk over two token lists. */
function lcsWalk<T>(
  a: readonly T[],
  b: readonly T[],
  emit: (op: 'same' | 'del' | 'add', value: T) => void
): void {
  const table = Array.from({ length: a.length + 1 }, () =>
    Array.from<number>({ length: b.length + 1 }).fill(0)
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      emit('same', a[i]!)
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      emit('del', a[i]!)
      i += 1
    } else {
      emit('add', b[j]!)
      j += 1
    }
  }
  for (; i < a.length; i += 1) {
    emit('del', a[i]!)
  }
  for (; j < b.length; j += 1) {
    emit('add', b[j]!)
  }
}

/** Marks the tokens each side does not share with the other. */
export function wordDiff(
  before: string,
  after: string
): { before: NativeChatDiffSegment[]; after: NativeChatDiffSegment[] } {
  const a = tokens(before)
  const b = tokens(after)
  if (a.length > MAX_WORD_DIFF_TOKENS || b.length > MAX_WORD_DIFF_TOKENS) {
    return { before: [{ text: before, changed: true }], after: [{ text: after, changed: true }] }
  }
  const left: NativeChatDiffSegment[] = []
  const right: NativeChatDiffSegment[] = []
  lcsWalk(a, b, (op, text) => {
    if (op !== 'add') {
      left.push({ text, changed: op === 'del' })
    }
    if (op !== 'del') {
      right.push({ text, changed: op === 'add' })
    }
  })
  return { before: merge(left), after: merge(right) }
}

/** One hunk from an edit's old/new strings; numbered from 1 since the file offset is unknown. */
export function hunkFromEditStrings(oldText: string, newText: string): NativeChatPatchHunk | null {
  const split = (text: string): string[] => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))
  const a = split(oldText).slice(0, MAX_INPUT_DIFF_LINES)
  const b = split(newText).slice(0, MAX_INPUT_DIFF_LINES)
  if (a.length === 0 && b.length === 0) {
    return null
  }
  const lines: string[] = []
  lcsWalk(a, b, (op, line) =>
    lines.push(`${op === 'same' ? ' ' : op === 'del' ? '-' : '+'}${line}`)
  )
  return { oldStart: 1, oldLines: a.length, newStart: 1, newLines: b.length, lines }
}

export function countHunkChanges(hunks: readonly NativeChatPatchHunk[]): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const line of hunks.flatMap((hunk) => hunk.lines)) {
    if (line.startsWith('+')) {
      additions += 1
    } else if (line.startsWith('-')) {
      deletions += 1
    }
  }
  return { additions, deletions }
}

export function diffRows(hunks: readonly NativeChatPatchHunk[]): NativeChatDiffRow[] {
  const rows: NativeChatDiffRow[] = []
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
          oldNo: oldNo++,
          newNo: newNo++,
          segments: [{ text: line.slice(1), changed: false }]
        })
        index += 1
        continue
      }
      // A run of removals then additions pairs line by line for word highlights.
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
