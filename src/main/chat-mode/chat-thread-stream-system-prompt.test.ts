import { readFileSync, rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { commandWithAppendedSystemPromptFile } from './chat-thread-stream-system-prompt'

describe('commandWithAppendedSystemPromptFile', () => {
  it('writes the brief and appends the file flag', () => {
    const command = commandWithAppendedSystemPromptFile(
      'claude -p',
      'Primary client email: a@b.co',
      't-brief-test'
    )
    const match = /--append-system-prompt-file '([^']+)'/.exec(command)
    expect(match?.[1]).toBeTruthy()
    const file = match![1]!
    try {
      expect(command.startsWith('claude -p --append-system-prompt-file ')).toBe(true)
      expect(readFileSync(file, 'utf8')).toBe('Primary client email: a@b.co')
    } finally {
      rmSync(file, { force: true })
    }
  })
})
