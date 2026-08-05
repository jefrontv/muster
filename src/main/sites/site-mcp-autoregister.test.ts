import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/types'
import type { Store } from '../persistence'

vi.mock('electron', () => ({
  // node-safe-electron imports safeStorage from the same module; a partial mock throws at import.
  safeStorage: undefined,
  app: {
    isPackaged: true,
    getAppPath: () => '/Applications/Muster.app/Contents/Resources/app.asar',
    getVersion: () => '1.2.3'
  }
}))

import { autoRegisterSiteMcpServers } from './site-mcp-autoregister'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

/** A site whose `.mcp.json` holds a stale entry — the one case auto-registration rewrites. */
function siteWithStaleEntry(): { sitePath: string; configPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'muster-site-mcp-'))
  roots.push(root)
  const sitePath = join(root, 'site')
  mkdirSync(sitePath, { recursive: true })
  const configPath = join(sitePath, '.mcp.json')
  writeFileSync(
    configPath,
    JSON.stringify({ mcpServers: { 'muster-sites': { command: '/old/Muster', args: [] } } }),
    'utf8'
  )
  return { sitePath, configPath }
}

function storeWith(sitePath: string, settings: Partial<GlobalSettings>): Store {
  return {
    listSites: () => [{ id: 'site-1', path: sitePath }],
    getSettings: () => settings
  } as unknown as Store
}

describe('autoRegisterSiteMcpServers', () => {
  it('repairs a stale entry when the capability is unset, as it always has', () => {
    const { sitePath, configPath } = siteWithStaleEntry()

    const result = autoRegisterSiteMcpServers(storeWith(sitePath, {}))

    expect(result.repaired).toEqual([configPath])
    expect(readFileSync(configPath, 'utf8')).not.toContain('/old/Muster')
  })

  it('repairs a stale entry when the capability is explicitly on', () => {
    const { sitePath } = siteWithStaleEntry()

    const result = autoRegisterSiteMcpServers(
      storeWith(sitePath, { agentCapabilitySitesMcp: true })
    )

    expect(result.repaired).toHaveLength(1)
  })

  it('touches nothing once the user turns the site tools off', () => {
    const { sitePath, configPath } = siteWithStaleEntry()
    const before = readFileSync(configPath, 'utf8')

    const result = autoRegisterSiteMcpServers(
      storeWith(sitePath, { agentCapabilitySitesMcp: false })
    )

    expect(result).toEqual({ scanned: 0, repaired: [], failed: [] })
    // The entry a user registered by hand stays put; only our unattended upkeep stops.
    expect(readFileSync(configPath, 'utf8')).toBe(before)
  })
})
