// The process an agent spawns: `Muster --site-mcp`, speaking MCP over stdio.
//
// This replaces ocsites' `ocsites-mcp` daemon and its LaunchAgent. It runs as a headless Electron
// main process because two things require it — safeStorage for the site secrets a run decrypts,
// and app.getPath('userData') for the store and the shared run-log directory.
//
// stdout is the protocol. Nothing else may write to it: a single stray console.log corrupts the
// frame stream and the client drops the connection. Diagnostics go to stderr.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { electronApp } from '../../node-safe-electron'
import {
  ensureActiveOrcaProfile,
  initOrcaProfilePaths
} from '../../orca-profiles/profile-index-store'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'
import { getCanonicalUserDataPath, initDataPath, Store } from '../../persistence'
import { SITE_RUNS_DIR_NAME } from '../site-run-log'
import { createSiteMcpContext } from './site-mcp-engine'
import { createSiteMcpServer } from './site-mcp-server'

/** The argv flag the launcher routes on. Kept here so the CLI and the registrar agree on one name. */
export const SITE_MCP_CLI_FLAG = '--site-mcp'

export function isSiteMcpInvocation(argv: readonly string[]): boolean {
  return argv.includes(SITE_MCP_CLI_FLAG)
}

/**
 * The argv a fresh GUI instance of this same build should launch with.
 *
 * Everything before the flag is kept (dev runs carry the app path, `electron <appPath>`); the flag
 * and anything after it belong to the MCP invocation and must not leak into the GUI launch.
 */
export function guiLaunchArgsFromMcpArgv(argv: readonly string[]): string[] {
  const flagIndex = argv.indexOf(SITE_MCP_CLI_FLAG)
  const args = flagIndex >= 0 ? argv.slice(1, flagIndex) : argv.slice(1)
  return args.filter((value) => value !== SITE_MCP_CLI_FLAG)
}

export type SiteMcpEntryOptions = {
  /** The agent's project directory, which resolves an omitted `site` argument. */
  cwd?: string
  version?: string
  /** Injected by index.ts, which resolves the REAL profile before moving this instance's
   *  Chromium userData to a scratch dir (see the isSiteMcpMode branch for why). */
  store?: Store
  runsBaseDir?: string
}

/** Version for the MCP handshake when no Electron app object exists (node mode). */
function readBundledVersion(): string {
  try {
    // out/main/<chunk> -> out/package.json, which ships asar-unpacked beside the bundles.
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export async function runSiteMcpEntry(options: SiteMcpEntryOptions = {}): Promise<void> {
  // Node mode (the shim hosts the server under ELECTRON_RUN_AS_NODE) has no AppKit to appease:
  // no whenReady, no dock, no activation policy, no LaunchServices registration to suppress.
  const app = electronApp
  if (app) {
    await app.whenReady()
  }
  // No window, no dock icon: this instance exists only to serve one agent's stdio.
  //
  // 'prohibited', not dock.hide(): hiding the dock only demotes the process to UIElement, and a
  // UIElement instance still counts as "Muster is running" to LaunchServices — so a Dock/Finder
  // launch while only MCP servers were alive routed to a windowless server instead of starting
  // the GUI ("running but there is no window"). A prohibited process never registers with LS.
  const demoteToBackground = () => {
    try {
      app?.hide?.()
      app?.dock?.hide()
      app?.setActivationPolicy?.('prohibited')
    } catch {
      // AppKit refusing a policy transition must not kill the MCP server.
    }
  }
  demoteToBackground()

  // A Dock/Finder launch that LaunchServices routes here doesn't just reopen — LS force-promotes
  // this background process to a Foreground app (TransformProcessType), parking a second
  // windowless "Muster" in the Dock for as long as the server lives. The promotion lands after
  // the activation event, so demote again immediately and once more on a delay.
  const reassertBackground = () => {
    demoteToBackground()
    setTimeout(demoteToBackground, 500)
  }
  app?.on('did-become-active', reassertBackground)

  // The promotion also arrives with NO observable AppKit event when LS transforms the process
  // without activating it (a prohibited app cannot become active), so watch the one visible
  // symptom — the dock icon — and demote whenever it appears.
  if (app?.dock?.isVisible) {
    setInterval(() => {
      try {
        if (app.dock?.isVisible()) {
          demoteToBackground()
        }
      } catch {
        // Same contract as demoteToBackground: AppKit hiccups must not kill the server.
      }
    }, 2000).unref()
  }

  // Why: this headless instance still registers with LaunchServices under the app's bundle id, so
  // a Dock/Finder launch while only MCP servers run gets routed HERE as a reopen instead of
  // starting the real app — "Muster is running but there is no window". Act as a trampoline:
  // spawn a fresh GUI instance, which takes the single-instance lock (or focuses the GUI that
  // already holds it) and shows a window.
  app?.on('activate', () => {
    try {
      // Packaged: relaunch through LaunchServices (`open -n`) rather than spawning the binary —
      // a direct child would inherit THIS process's environment, which is the spawning agent's
      // (hook vars, cwd, whatever the harness exported), and that produced GUIs that hung before
      // creating a window. `open -n` forces a NEW instance with a clean LS environment.
      if (app?.isPackaged) {
        const bundlePath = join(dirname(process.execPath), '..', '..')
        spawn('/usr/bin/open', ['-n', '-a', bundlePath], {
          detached: true,
          stdio: 'ignore'
        }).unref()
        return
      }
      const child = spawn(process.execPath, guiLaunchArgsFromMcpArgv(process.argv), {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    } catch (error) {
      console.error('[site-mcp] failed to relaunch the GUI on activate:', error)
    } finally {
      reassertBackground()
    }
  })

  // Mirror the GUI's store bootstrap (index.ts hasSingleInstanceLock block): capture the
  // userData-derived paths once, then open the ACTIVE PROFILE's data file —
  // <userData>/profiles/<id>/orca-data.json (profiles/local-default on a default install) —
  // exactly as the GUI does (index.ts: ensureActiveOrcaProfile → new Store({ dataFile })).
  // A bare `new Store()` would fall back to the legacy <userData>/orca-data.json and serve an
  // empty site list next to a GUI that has plenty. index.ts has already run
  // configureDevUserDataPath/configureOrcaUserDataPathEnv at module scope, so dev and packaged
  // runs land on the same userData the GUI uses.
  const store =
    options.store ??
    (() => {
      initDataPath()
      initOrcaProfilePaths()
      return new Store({ dataFile: ensureActiveOrcaProfile(getProfileUserDataPath()).dataFile })
    })()
  const context = createSiteMcpContext({
    store,
    runsBaseDir: options.runsBaseDir ?? join(getCanonicalUserDataPath(), SITE_RUNS_DIR_NAME),
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
    version: options.version ?? electronApp?.getVersion() ?? readBundledVersion()
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
  if (app) {
    app.quit()
  } else {
    process.exit(0)
  }
}
