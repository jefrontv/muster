// Writes the workspace brief next to the stream child so we can pass
// --append-system-prompt-file instead of a multiline quoted --append-system-prompt
// (zsh -lc + tokenize ate those). The brief carries client emails and URLs, so
// the file is removed with the child rather than left for the OS tmp reaper.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BRIEF_DIR_NAME = 'muster-chat-briefs'

function systemPromptFilePath(threadId: string): string {
  return join(tmpdir(), BRIEF_DIR_NAME, `${threadId}.txt`)
}

export function commandWithAppendedSystemPromptFile(
  command: string,
  prompt: string,
  threadId: string
): string {
  mkdirSync(join(tmpdir(), BRIEF_DIR_NAME), { recursive: true })
  const file = systemPromptFilePath(threadId)
  writeFileSync(file, prompt, { encoding: 'utf8', mode: 0o600 })
  const quoted = `'${file.replace(/'/g, `'\\''`)}'`
  return `${command} --append-system-prompt-file ${quoted}`
}

export function removeChatThreadSystemPromptFile(threadId: string): void {
  try {
    rmSync(systemPromptFilePath(threadId), { force: true })
  } catch {
    // Best-effort cleanup; a stray brief is a leak, not a failure.
  }
}
