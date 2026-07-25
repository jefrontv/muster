// The process an agent spawns: `Muster --site-mcp`, speaking MCP over stdio.
//
// This replaces ocsites' `ocsites-mcp` daemon and its LaunchAgent. It runs as a headless Electron
// main process because two things require it — safeStorage for the site secrets a run decrypts,
// and app.getPath('userData') for the store and the shared run-log directory.
//
// stdout is the protocol. Nothing else may write to it: a single stray console.log corrupts the
// frame stream and the client drops the connection. Diagnostics go to stderr.

import { join } from 'node:path'
import { app } from 'electron'
import { Store } from '../../persistence'
import { SITE_RUNS_DIR_NAME } from '../site-run-log'
import { createSiteMcpContext } from './site-mcp-engine'
import { createSiteMcpServer } from './site-mcp-server'

/** The argv flag the launcher routes on. Kept here so the CLI and the registrar agree on one name. */
export const SITE_MCP_CLI_FLAG = '--site-mcp'

export function isSiteMcpInvocation(argv: readonly string[]): boolean {
  return argv.includes(SITE_MCP_CLI_FLAG)
}

export type SiteMcpEntryOptions = {
  /** The agent's project directory, which resolves an omitted `site` argument. */
  cwd?: string
  version?: string
}

export async function runSiteMcpEntry(options: SiteMcpEntryOptions = {}): Promise<void> {
  await app.whenReady()
  // No window, no dock icon: this instance exists only to serve one agent's stdio.
  app.dock?.hide()

  const store = new Store()
  const context = createSiteMcpContext({
    store,
    runsBaseDir: join(app.getPath('userData'), SITE_RUNS_DIR_NAME),
    cwd: options.cwd ?? process.env.MUSTER_MCP_CWD ?? process.cwd()
  })
  const server = createSiteMcpServer({
    context,
    write: (frame) => {
      try {
        process.stdout.write(frame)
      } catch {
        // The client hung up mid-response. Nothing to report to and nowhere to report it.
      }
    },
    version: options.version ?? app.getVersion()
  })
  // Same reason: an EPIPE on a closed stdout arrives as an event, and the default handler for an
  // unhandled 'error' on a stream is to throw.
  process.stdout.on('error', () => {})

  await new Promise<void>((resolve) => {
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      server.push(chunk)
    })
    // The client closing stdin is the shutdown signal; drain first so a tool call that was already
    // in flight still gets its response out before the process exits.
    process.stdin.once('end', () => {
      server.end()
      void server.drain().finally(resolve)
    })
    process.stdin.once('error', () => {
      resolve()
    })
    // A host that kills the server instead of closing the pipe must still get the cleanup below.
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
      process.once(signal, () => {
        resolve()
      })
    }
    process.stdin.resume()
  })

  await context.shutdownRuns()
  app.quit()
}
