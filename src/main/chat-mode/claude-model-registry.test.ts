import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  flushClaudeModelRegistryForTests,
  getLearnedClaudeModels,
  learnedClaudeContextWindow,
  recordClaudeModelSighting,
  resetClaudeModelRegistryForTests
} from './claude-model-registry'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'claude-model-registry-'))
  resetClaudeModelRegistryForTests(path.join(dir, 'registry.json'))
})

afterEach(async () => {
  resetClaudeModelRegistryForTests(null)
  await rm(dir, { recursive: true, force: true })
})

describe('claude model registry', () => {
  it('records sightings with and without windows', async () => {
    await recordClaudeModelSighting({ model: 'claude-fable-5', contextWindow: 1_000_000, now: 1 })
    await recordClaudeModelSighting({ model: 'claude-muse-6', now: 2 })
    expect(await getLearnedClaudeModels()).toEqual({
      'claude-fable-5': { lastSeenAt: 1, contextWindow: 1_000_000 },
      'claude-muse-6': { lastSeenAt: 2 }
    })
  })

  it('keeps a learned window when a later sighting has none', async () => {
    await recordClaudeModelSighting({ model: 'claude-fable-5', contextWindow: 1_000_000, now: 1 })
    await recordClaudeModelSighting({ model: 'claude-fable-5', now: 2 })
    expect(await learnedClaudeContextWindow('claude-fable-5')).toBe(1_000_000)
    expect((await getLearnedClaudeModels())['claude-fable-5']?.lastSeenAt).toBe(2)
  })

  it('ignores junk ids', async () => {
    await recordClaudeModelSighting({ model: '<synthetic>', now: 1 })
    await recordClaudeModelSighting({ model: '', now: 1 })
    await recordClaudeModelSighting({ model: 'deepseek-v4-flash', now: 1 })
    expect(await getLearnedClaudeModels()).toEqual({})
  })

  it('persists and reloads across resets', async () => {
    const file = path.join(dir, 'registry.json')
    await recordClaudeModelSighting({ model: 'claude-opus-5', contextWindow: 1_000_000, now: 5 })
    await flushClaudeModelRegistryForTests()
    expect(JSON.parse(await readFile(file, 'utf-8'))).toEqual({
      'claude-opus-5': { lastSeenAt: 5, contextWindow: 1_000_000 }
    })
    resetClaudeModelRegistryForTests(file)
    expect(await learnedClaudeContextWindow('claude-opus-5')).toBe(1_000_000)
  })

  it('returns null for never-reported windows', async () => {
    expect(await learnedClaudeContextWindow('claude-unknown')).toBeNull()
    expect(await learnedClaudeContextWindow(null)).toBeNull()
  })
})
