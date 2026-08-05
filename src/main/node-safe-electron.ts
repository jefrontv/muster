// Electron's modules, usable from code that also runs under ELECTRON_RUN_AS_NODE.
//
// Three runtimes share these modules:
//  - Electron processes: `import 'electron'` is the real builtin.
//  - vitest: `vi.mock('electron')` must keep intercepting, so the import stays STATIC.
//  - plain Node (the muster-sites MCP server): 'electron' resolves to the stub package emitted at
//    out/main/node_modules/electron (see the site-mcp-electron-stub plugin), which exports {} —
//    so every binding below is undefined and callers take their node fallbacks.

import { app, safeStorage } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { App, SafeStorage } from 'electron'

export const electronApp: App | undefined =
  typeof app === 'object' && app !== null ? app : undefined
export const electronSafeStorage: SafeStorage | undefined =
  typeof safeStorage === 'object' && safeStorage !== null ? safeStorage : undefined

/**
 * The userData directory when `app` is unavailable. MUST resolve to the same directory Electron
 * gives the GUI ('Muster' comes from the app name); the MCP server reads the GUI's store with it.
 */
export function nodeFallbackUserDataDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Muster')
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'Muster')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Muster')
}
