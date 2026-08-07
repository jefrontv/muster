import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { latestContextUsageFromLines, readTranscriptContextUsage } from './transcript-context-usage'

function assistantLine(usage: Record<string, unknown>): string {
  return JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage } })
}

describe('latestContextUsageFromLines', () => {
  it('sums input, cache read, cache creation, and output tokens', () => {
    const lines = [
      assistantLine({
        input_tokens: 10,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 20,
        output_tokens: 5
      })
    ]
    expect(latestContextUsageFromLines(lines)).toEqual({ usedTokens: 135 })
  })

  it('uses the latest assistant record, ignoring user records after it', () => {
    const lines = [
      assistantLine({ input_tokens: 1, output_tokens: 1 }),
      assistantLine({ input_tokens: 50, cache_read_input_tokens: 950, output_tokens: 7 }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })
    ]
    expect(latestContextUsageFromLines(lines)).toEqual({ usedTokens: 1007 })
  })

  it('treats missing usage fields as zero when at least one is present', () => {
    expect(latestContextUsageFromLines([assistantLine({ output_tokens: 3 })])).toEqual({
      usedTokens: 3
    })
  })

  it('skips assistant records without usage and unparseable lines', () => {
    const lines = [
      assistantLine({ input_tokens: 9 }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }),
      '{"truncated'
    ]
    expect(latestContextUsageFromLines(lines)).toEqual({ usedTokens: 9 })
  })

  it('returns null when no assistant record carries usage', () => {
    expect(latestContextUsageFromLines(['not json', '{"type":"user"}'])).toBeNull()
    expect(latestContextUsageFromLines([])).toBeNull()
  })
})

describe('readTranscriptContextUsage', () => {
  let dir: string | null = null

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
      dir = null
    }
  })

  it('reads the latest assistant usage from a transcript file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctx-usage-'))
    const filePath = join(dir, 'session.jsonl')
    await writeFile(
      filePath,
      [
        assistantLine({ input_tokens: 5, output_tokens: 1 }),
        assistantLine({ input_tokens: 8, cache_read_input_tokens: 40, output_tokens: 2 })
      ].join('\n'),
      'utf-8'
    )
    await expect(readTranscriptContextUsage(filePath)).resolves.toEqual({ usedTokens: 50 })
  })

  it('returns null for a missing file', async () => {
    await expect(readTranscriptContextUsage('/nonexistent/nowhere.jsonl')).resolves.toBeNull()
  })
})
