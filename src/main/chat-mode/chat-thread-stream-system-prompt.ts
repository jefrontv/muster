// Writes the workspace brief next to the stream child so we can pass
// --append-system-prompt-file instead of a multiline quoted --append-system-prompt
// (zsh -lc + tokenize ate those).

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function commandWithAppendedSystemPromptFile(
  command: string,
  prompt: string,
  threadId: string
): string {
  const dir = join(tmpdir(), 'muster-chat-briefs')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${threadId}.txt`)
  writeFileSync(file, prompt, 'utf8')
  const quoted = `'${file.replace(/'/g, `'\\''`)}'`
  return `${command} --append-system-prompt-file ${quoted}`
}
