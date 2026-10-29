import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClaudeMarketplaceAutoUpdate } from './claude-marketplace-auto-update'

const SOURCE = { source: 'git', url: 'git@bitbucket.org:efront_au/efront-agent-skills.git' }

describe('setClaudeMarketplaceAutoUpdate', () => {
  let configDir: string
  const settingsFile = (): string => path.join(configDir, 'settings.json')
  const readSettings = (): Record<string, unknown> =>
    JSON.parse(readFileSync(settingsFile(), 'utf8')) as Record<string, unknown>

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), 'muster-claude-config-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('sets the flag on the declared marketplace and keeps every other setting', () => {
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        theme: 'dark',
        enabledPlugins: { 'humanizer@efront-agent-skills': true },
        extraKnownMarketplaces: {
          'efront-agent-skills': { source: SOURCE },
          other: { source: { source: 'github', repo: 'a/b' } }
        }
      })
    )

    expect(setClaudeMarketplaceAutoUpdate('efront-agent-skills', true, configDir)).toBe('written')

    expect(readSettings()).toEqual({
      theme: 'dark',
      enabledPlugins: { 'humanizer@efront-agent-skills': true },
      extraKnownMarketplaces: {
        'efront-agent-skills': { source: SOURCE, autoUpdate: true },
        other: { source: { source: 'github', repo: 'a/b' } }
      }
    })
    expect(setClaudeMarketplaceAutoUpdate('efront-agent-skills', true, configDir)).toBe('unchanged')
    expect(setClaudeMarketplaceAutoUpdate('efront-agent-skills', false, configDir)).toBe('written')
    expect(readSettings().extraKnownMarketplaces).toMatchObject({
      'efront-agent-skills': { autoUpdate: false }
    })
  })

  it('copies the source from known_marketplaces.json when settings has no entry yet', () => {
    mkdirSync(path.join(configDir, 'plugins'))
    writeFileSync(
      path.join(configDir, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ 'efront-agent-skills': { source: SOURCE, installLocation: '/x' } })
    )

    expect(setClaudeMarketplaceAutoUpdate('efront-agent-skills', true, configDir)).toBe('written')

    expect(readSettings()).toEqual({
      extraKnownMarketplaces: { 'efront-agent-skills': { source: SOURCE, autoUpdate: true } }
    })
  })

  it('does nothing for a marketplace Claude does not know', () => {
    writeFileSync(settingsFile(), '{"theme":"dark"}\n')
    expect(setClaudeMarketplaceAutoUpdate('efront-agent-skills', true, configDir)).toBe(
      'not-installed'
    )
    expect(readFileSync(settingsFile(), 'utf8')).toBe('{"theme":"dark"}\n')
  })

  it('never rewrites a settings file it cannot parse', () => {
    writeFileSync(settingsFile(), '{"theme": "dark",')
    expect(setClaudeMarketplaceAutoUpdate('efront-agent-skills', true, configDir)).toBe(
      'unreadable'
    )
    expect(readFileSync(settingsFile(), 'utf8')).toBe('{"theme": "dark",')
  })
})
