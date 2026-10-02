import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { nodeFallbackUserDataDir } from './node-safe-electron'

const base =
  process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : null

afterEach(() => {
  delete process.env.ORCA_DEV_USER_DATA_PATH
})

describe('nodeFallbackUserDataDir', () => {
  it.runIf(base)('serves the installed app’s data to a packaged MCP', () => {
    const entry =
      '/Applications/Muster.app/Contents/Resources/app.asar.unpacked/out/main/site-mcp-shim.js'
    expect(nodeFallbackUserDataDir(entry)).toBe(join(base!, 'Muster'))
  })

  it.runIf(base)('follows the dev GUI onto muster-dev for a source checkout build', () => {
    expect(nodeFallbackUserDataDir('/Sites/muster-ui/out/main/site-mcp-shim.js')).toBe(
      join(base!, 'muster-dev')
    )
  })

  it('honours the dev override path only for a source checkout build', () => {
    process.env.ORCA_DEV_USER_DATA_PATH = '/tmp/repro'
    expect(nodeFallbackUserDataDir('/Sites/muster-ui/out/main/site-mcp-shim.js')).toBe('/tmp/repro')
    expect(nodeFallbackUserDataDir('/x/app.asar/out/main/site-mcp-shim.js')).not.toBe('/tmp/repro')
  })
})
