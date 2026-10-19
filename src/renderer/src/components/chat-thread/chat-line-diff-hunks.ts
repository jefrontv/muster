// Unified hunks between two texts: a live Edit's old_string and new_string
// before the CLI's structured patch exists.

import { DIFF_DELETE, DIFF_INSERT, makeDiff } from '@sanity/diff-match-patch'
import type { ChatEnginePatchHunk } from '../../../../shared/chat-engine-types'

/** One char per distinct line, skipping the surrogate range, caps a file near 63k distinct lines. */
const FIRST_CODE = 0x20
const SURROGATE_START = 0xd800
const SURROGATE_END = 0xdfff
const LAST_CODE = 0xffff

type Op = { sign: ' ' | '-' | '+'; text: string }

function splitLines(text: string): string[] {
  if (text === '') {
    return []
  }
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''))
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

class LineCodes {
  private next = FIRST_CODE
  private readonly codes = new Map<string, string>()
  readonly lines = new Map<string, string>()

  encode(lines: string[]): string | null {
    let out = ''
    for (const line of lines) {
      let code = this.codes.get(line)
      if (code === undefined) {
        if (this.next > LAST_CODE) {
          return null
        }
        code = String.fromCharCode(this.next)
        this.next = this.next + 1 === SURROGATE_START ? SURROGATE_END + 1 : this.next + 1
        this.codes.set(line, code)
        this.lines.set(code, line)
      }
      out += code
    }
    return out
  }
}

function lineOps(original: string, modified: string): Op[] | null {
  const codes = new LineCodes()
  const a = codes.encode(splitLines(original))
  const b = a === null ? null : codes.encode(splitLines(modified))
  if (a === null || b === null) {
    return null
  }
  const ops: Op[] = []
  for (const [type, chunk] of makeDiff(a, b, { checkLines: false, timeout: 1 })) {
    const sign = type === DIFF_DELETE ? '-' : type === DIFF_INSERT ? '+' : ' '
    for (const code of chunk) {
      ops.push({ sign, text: codes.lines.get(code) ?? '' })
    }
  }
  return ops
}

/** Null when the file has too many distinct lines to diff here. */
export function lineDiffHunks(
  original: string,
  modified: string,
  context = 3
): ChatEnginePatchHunk[] | null {
  const ops = lineOps(original, modified)
  if (!ops) {
    return null
  }
  const oldBefore: number[] = []
  const newBefore: number[] = []
  let oldCount = 0
  let newCount = 0
  for (const op of ops) {
    oldBefore.push(oldCount)
    newBefore.push(newCount)
    oldCount += op.sign === '+' ? 0 : 1
    newCount += op.sign === '-' ? 0 : 1
  }

  const hunks: ChatEnginePatchHunk[] = []
  let index = 0
  while (index < ops.length) {
    if (ops[index]!.sign === ' ') {
      index += 1
      continue
    }
    const start = Math.max(0, index - context)
    let lastChange = index
    let cursor = index
    while (cursor < ops.length && cursor - lastChange <= 2 * context) {
      if (ops[cursor]!.sign !== ' ') {
        lastChange = cursor
      }
      cursor += 1
    }
    const end = Math.min(ops.length, lastChange + context + 1)
    const slice = ops.slice(start, end)
    hunks.push({
      oldStart: oldBefore[start]! + 1,
      oldLines: slice.filter((op) => op.sign !== '+').length,
      newStart: newBefore[start]! + 1,
      newLines: slice.filter((op) => op.sign !== '-').length,
      lines: slice.map((op) => `${op.sign}${op.text}`)
    })
    index = end
  }
  return hunks
}
