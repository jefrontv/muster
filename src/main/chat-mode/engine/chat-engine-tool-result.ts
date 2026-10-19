// Normalises a tool_result block plus the CLI's structured `tool_use_result`
// into the bounded shape the UI draws. Caps keep one noisy command from
// bloating every snapshot and patch.

import type { ChatEnginePatchHunk, ChatEngineToolResult } from '../../../shared/chat-engine-types'

const TEXT_CAP = 20_000
const PATCH_LINE_CAP = 2_000

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

/** tool_result `content` is a string or an array of text/image blocks. */
export function toolResultText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((block) => {
      const record = asRecord(block)
      return record?.type === 'text' && typeof record.text === 'string' ? record.text : ''
    })
    .filter((text) => text !== '')
    .join('\n')
}

function readHunks(value: unknown): ChatEnginePatchHunk[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const hunks: ChatEnginePatchHunk[] = []
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

function countPatch(hunks: readonly ChatEnginePatchHunk[]): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) {
        additions += 1
      } else if (line.startsWith('-')) {
        deletions += 1
      }
    }
  }
  return { additions, deletions }
}

const CREATED_FILE_PREVIEW_LINES = 400

export function buildToolResult(args: {
  content: unknown
  isError: boolean
  structured: unknown
}): ChatEngineToolResult {
  const body = cap(toolResultText(args.content))
  const result: ChatEngineToolResult = {
    text: body.text,
    isError: args.isError,
    truncated: body.truncated
  }
  const structured = asRecord(args.structured)
  if (!structured) {
    return result
  }

  const patch = readHunks(structured.structuredPatch)
  if (patch && patch.length > 0) {
    const gitDiff = asRecord(structured.gitDiff)
    const counted = countPatch(patch)
    result.patch = patch
    result.additions =
      typeof gitDiff?.additions === 'number' ? gitDiff.additions : counted.additions
    result.deletions =
      typeof gitDiff?.deletions === 'number' ? gitDiff.deletions : counted.deletions
  }

  if (structured.type === 'create' && typeof structured.content === 'string') {
    // A new file has no patch to show; its content, capped, reads as one added hunk.
    const lines = structured.content.replace(/\n$/, '').split('\n')
    result.created = true
    result.additions = lines.length
    result.deletions = 0
    result.patch = [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        lines: lines.slice(0, CREATED_FILE_PREVIEW_LINES).map((line) => `+${line}`)
      }
    ]
  }

  if (typeof structured.stdout === 'string' || typeof structured.stderr === 'string') {
    const stdout = cap(typeof structured.stdout === 'string' ? structured.stdout : '')
    const stderr = cap(typeof structured.stderr === 'string' ? structured.stderr : '')
    result.stdout = stdout.text
    result.stderr = stderr.text
    result.truncated = result.truncated || stdout.truncated || stderr.truncated
    if (structured.interrupted === true) {
      result.interrupted = true
    }
    if (typeof structured.returnCodeInterpretation === 'string') {
      result.exitInterpretation = structured.returnCodeInterpretation
    }
    if (typeof structured.backgroundTaskId === 'string') {
      result.backgroundTaskId = structured.backgroundTaskId
    }
    const fullOutputPath = structured.persistedOutputPath ?? structured.rawOutputPath
    if (typeof fullOutputPath === 'string') {
      result.fullOutputPath = fullOutputPath
    }
  }
  return result
}
