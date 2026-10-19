import { existsSync, readFileSync, rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  appendedSystemPromptArgs,
  removeChatThreadSystemPromptFile
} from './chat-thread-stream-system-prompt'

describe('appendedSystemPromptArgs', () => {
  it('writes the brief and appends the file flag', () => {
    const [flag, file] = appendedSystemPromptArgs('Primary client email: a@b.co', 't-brief-test')
    expect(flag).toBe('--append-system-prompt-file')
    try {
      expect(readFileSync(file!, 'utf8')).toBe('Primary client email: a@b.co')
    } finally {
      rmSync(file!, { force: true })
    }
  })

  it('remove deletes the brief and is idempotent', () => {
    const [, file] = appendedSystemPromptArgs('brief', 't-brief-remove') as [string, string]
    expect(existsSync(file)).toBe(true)
    removeChatThreadSystemPromptFile('t-brief-remove')
    removeChatThreadSystemPromptFile('t-brief-remove')
    expect(existsSync(file)).toBe(false)
  })
})
