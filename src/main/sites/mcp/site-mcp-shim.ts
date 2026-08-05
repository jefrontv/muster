// Node host for the muster-sites MCP server.
//
// Harness configs launch `Muster <this file> --site-mcp` with ELECTRON_RUN_AS_NODE=1, so this
// process is PLAIN NODE: no NSApplication, no Dock icon, no LaunchServices registration, no
// Chromium profile, and no way to touch the harness's controlling terminal. Every prior
// incarnation that booted Electron here fought exactly those four things.
//
// The server graph (persistence, site tools, run pipelines) is node-safe via node-safe-electron:
// store paths fall back to the real userData directory, and secret reads fall back to Chromium's
// OSCrypt scheme (os-crypt-node) — decrypt only; the GUI stays the sole writer of secrets.
//
// stdout is the MCP wire. Nothing else may write to it.

import { runSiteMcpEntry } from './site-mcp-entry'

void runSiteMcpEntry().catch((error: unknown) => {
  console.error('[site-mcp] fatal:', error)
  process.exit(1)
})
