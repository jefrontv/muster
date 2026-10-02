import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claudeUserSettingsPath, readClaudeSettingsEffortLevel } from './claude-settings-effort'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'claude-effort-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readClaudeSettingsEffortLevel', () => {
  it('reads a recognised effortLevel', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, JSON.stringify({ effortLevel: 'medium', model: 'opus' }))
    await expect(readClaudeSettingsEffortLevel(file)).resolves.toBe('medium')
  })

  it('is null for a missing file, bad JSON or an unknown level', async () => {
    await expect(readClaudeSettingsEffortLevel(join(dir, 'nope.json'))).resolves.toBeNull()
    const bad = join(dir, 'bad.json')
    await writeFile(bad, '{ not json')
    await expect(readClaudeSettingsEffortLevel(bad)).resolves.toBeNull()
    const odd = join(dir, 'odd.json')
    await writeFile(odd, JSON.stringify({ effortLevel: 'turbo' }))
    await expect(readClaudeSettingsEffortLevel(odd)).resolves.toBeNull()
  })

  it('honours CLAUDE_CONFIG_DIR', () => {
    expect(claudeUserSettingsPath({ CLAUDE_CONFIG_DIR: dir })).toBe(join(dir, 'settings.json'))
  })
})
