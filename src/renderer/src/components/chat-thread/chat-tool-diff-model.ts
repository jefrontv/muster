// The diff an Edit, MultiEdit or Write card shows. While the call runs it is
// built from the input; once the CLI answers, its structured patch replaces it.

import type { ChatEnginePatchHunk } from '../../../../shared/chat-engine-types'
import { diffRows, type DiffRow } from './chat-diff-rows'
import { lineDiffHunks } from './chat-line-diff-hunks'
import { inputList, inputRecord, inputText, type ChatToolItem } from './chat-tool-input'

/** Lines a collapsed card shows before "Show N more lines". */
export const DIFF_PREVIEW_LINES = 9

export const DIFF_TOOL_NAMES = new Set(['Edit', 'MultiEdit', 'Write'])

export type ChatToolDiffModel = {
  rows: DiffRow[]
  /** Built from the input: line numbers are relative to the snippet, so hide them. */
  live: boolean
  additions: number
  deletions: number
  hiddenLines: number
}

function editHunks(oldText: string, newText: string): ChatEnginePatchHunk[] {
  return lineDiffHunks(oldText, newText) ?? []
}

function liveHunks(item: ChatToolItem): ChatEnginePatchHunk[] {
  const input = item.input
  if (item.name === 'Write') {
    const lines = (inputText(input, 'content') ?? '').replace(/\n$/, '').split('\n')
    return lines.length === 1 && lines[0] === ''
      ? []
      : [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: lines.length,
            lines: lines.map((line) => `+${line}`)
          }
        ]
  }
  const edits =
    item.name === 'MultiEdit' ? inputList(input, 'edits').map(inputRecord) : [inputRecord(input)]
  return edits.flatMap((edit) =>
    editHunks(
      typeof edit.old_string === 'string' ? edit.old_string : '',
      typeof edit.new_string === 'string' ? edit.new_string : ''
    )
  )
}

const count = (rows: DiffRow[], type: 'add' | 'del'): number =>
  rows.filter((row) => row.kind === 'line' && row.type === type).length

export function toolDiffModel(item: ChatToolItem, expanded: boolean): ChatToolDiffModel | null {
  if (!DIFF_TOOL_NAMES.has(item.name)) {
    return null
  }
  const settled = item.result?.patch
  const live = !settled
  const all = diffRows(settled ?? liveHunks(item))
  if (all.length === 0) {
    return null
  }
  let rows = all
  let hiddenLines = 0
  if (!expanded) {
    const lineIndexes = all.flatMap((row, index) => (row.kind === 'line' ? [index] : []))
    if (lineIndexes.length > DIFF_PREVIEW_LINES) {
      rows = all.slice(0, lineIndexes[DIFF_PREVIEW_LINES - 1]! + 1)
      hiddenLines = lineIndexes.length - DIFF_PREVIEW_LINES
    }
  }
  return {
    rows,
    live,
    additions: item.result?.additions ?? count(all, 'add'),
    deletions: item.result?.deletions ?? count(all, 'del'),
    hiddenLines
  }
}
