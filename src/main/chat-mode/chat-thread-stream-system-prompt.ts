// Writes the workspace brief next to the stream child so we can pass
// --append-system-prompt-file instead of a multiline quoted --append-system-prompt
// (zsh -lc + tokenize ate those). The brief carries client emails and URLs, so
// the file is removed with the child rather than left for the OS tmp reaper.

import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chatStreamFilesDir, ensureChatStreamFilesDir } from './chat-thread-stream-files'

const BRIEF_DIR_NAME = 'muster-chat-briefs'

function systemPromptFilePath(threadId: string): string {
  return join(chatStreamFilesDir(BRIEF_DIR_NAME), `${threadId}.txt`)
}

export function appendedSystemPromptArgs(prompt: string, threadId: string): string[] {
  ensureChatStreamFilesDir(BRIEF_DIR_NAME)
  const file = systemPromptFilePath(threadId)
  writeFileSync(file, prompt, { encoding: 'utf8', mode: 0o600 })
  return ['--append-system-prompt-file', file]
}

export function removeChatThreadSystemPromptFile(threadId: string): void {
  try {
    rmSync(systemPromptFilePath(threadId), { force: true })
  } catch {
    // Best-effort cleanup; a stray brief is a leak, not a failure.
  }
}
