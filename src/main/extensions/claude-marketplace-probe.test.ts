import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { probeClaudeMarketplace } from './claude-marketplace-probe'

describe('probeClaudeMarketplace', () => {
  let configDir: string
  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), 'claude-config-'))
  })
  afterEach(() => rmSync(configDir, { recursive: true, force: true }))

  it('is not installed without a known_marketplaces record', () => {
    expect(probeClaudeMarketplace('efront-agent-skills', configDir)).toEqual({
      installed: false,
      version: null
    })
  })

  it('reads the version from the installed marketplace manifest', () => {
    const location = path.join(configDir, 'plugins', 'marketplaces', 'efront-agent-skills')
    mkdirSync(path.join(location, '.claude-plugin'), { recursive: true })
    writeFileSync(
      path.join(configDir, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ 'efront-agent-skills': { installLocation: location } })
    )
    writeFileSync(
      path.join(location, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ name: 'efront-agent-skills', metadata: { version: '1.1.0' } })
    )
    expect(probeClaudeMarketplace('efront-agent-skills', configDir)).toEqual({
      installed: true,
      version: '1.1.0'
    })
  })
})
