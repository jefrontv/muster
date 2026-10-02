// The hunks to draw for one edit call: the CLI's recorded patch when the result
// carries one, else a line diff of the call's own old/new strings.

import type {
  NativeChatPatchHunk,
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../../../shared/native-chat-types'
import { inputField } from '../../../../shared/native-chat-tool-input-fields'
import { hunkFromEditStrings } from './native-chat-diff-rows'

export type NativeChatEditHunks = {
  hunks: NativeChatPatchHunk[]
  /** False for the input fallback, whose line numbers are relative to the snippet. */
  numbered: boolean
  truncated: boolean
}

function inputEdits(input: unknown): { old: string; new: string }[] {
  if (typeof input !== 'object' || input === null) {
    return []
  }
  const value = input as Record<string, unknown>
  if (Array.isArray(value.edits)) {
    return value.edits.flatMap((edit) => {
      const oldText = inputField(edit, 'old_string') ?? ''
      const newText = inputField(edit, 'new_string') ?? ''
      return oldText || newText ? [{ old: oldText, new: newText }] : []
    })
  }
  const oldText = inputField(input, 'old_string') ?? ''
  const newText =
    inputField(input, 'new_string') ??
    inputField(input, 'content') ??
    inputField(input, 'new_source') ??
    ''
  return oldText || newText ? [{ old: oldText, new: newText }] : []
}

export function editHunks(
  call: NativeChatToolCallBlock | undefined,
  result: NativeChatToolResultBlock | undefined
): NativeChatEditHunks | null {
  const patch = result?.detail?.patch
  if (patch && patch.length > 0) {
    return { hunks: patch, numbered: true, truncated: result?.detail?.truncated === true }
  }
  const hunks = inputEdits(call?.input).flatMap(
    (edit) => hunkFromEditStrings(edit.old, edit.new) ?? []
  )
  return hunks.length > 0 ? { hunks, numbered: false, truncated: false } : null
}
