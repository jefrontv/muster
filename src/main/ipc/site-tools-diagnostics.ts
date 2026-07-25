// Read-mostly site tools: WP-CLI, the plugin diff, connection and health probes, WordPress version,
// active theme, and remote file search.
//
// Fast enough to answer inline, so these are plain invoke channels rather than runs. Every handler
// returns the tagged SiteResult union — a throw across the bridge loses its type and its stack.
//
// The one write path here is WP-CLI with `allowWrites`, which goes through the same run guard an
// import or deploy does: an unmatched branch must never silently mutate production.

import { ipcMain } from 'electron'
import type {
  PluginComparison,
  RemoteFileSearch,
  SiteActiveTheme,
  SiteConnectionReport,
  SiteWordPressVersions,
  WpCliResult
} from '../../shared/site-tool-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import { findRemoteFiles } from '../sites/remote-file-find'
import { comparePlugins } from '../sites/remote-plugin-sync'
import { checkSiteConnection } from '../sites/site-connection-health'
import { createSiteSshSession } from '../sites/site-ssh-session'
import { withRemoteSiteTool } from '../sites/site-tool-session'
import {
  readLocalActiveTheme,
  readRemoteActiveTheme,
  readWordPressVersions
} from '../sites/site-wordpress-facts'
import { runLocalWpCli, runRemoteWpCli } from '../sites/wp-cli-runner'
import {
  readEnvironment,
  readFlag,
  readPositiveInteger,
  readSearchKind,
  readToolArgs,
  readWpCliLocation,
  requireSiteId,
  requireText,
  requireWpCliArgs
} from './site-tools-payload'
import { assertSiteToolAllowed, resolveSiteToolTarget } from './site-tools-target'
import { failure } from './sites-result'

export const SITE_TOOL_DIAGNOSTIC_CHANNELS = [
  'siteTools:runWpCli',
  'siteTools:comparePlugins',
  'siteTools:testConnection',
  'siteTools:checkHealth',
  'siteTools:wordpressVersion',
  'siteTools:activeTheme',
  'siteTools:findFile'
] as const

const MAX_FIND_MATCHES = 200
const MAX_FIND_SIZE_BYTES = 4 * 1024 * 1024
const MAX_FIND_DEPTH = 12
const MAX_WP_CLI_TIMEOUT_MS = 120_000
/**
 * A hard deadline for every read tool. These channels have no cancel affordance — the renderer
 * awaits one invoke — so without it a wedged host would pin the call open indefinitely.
 */
const TOOL_DEADLINE_MS = 180_000

export function registerSiteToolDiagnosticHandlers(store: Store): void {
  ipcMain.handle(
    'siteTools:runWpCli',
    async (_event, raw: unknown): Promise<SiteResult<WpCliResult>> => {
      try {
        const args = readToolArgs(raw)
        const location = readWpCliLocation(args)
        const requested = readEnvironment(args)
        const allowWrites = readFlag(args, 'allowWrites', false)
        const timeoutMs = readPositiveInteger(args, 'timeoutMs', 60_000, MAX_WP_CLI_TIMEOUT_MS)
        const cliArgs = requireWpCliArgs(args)
        const target = await resolveSiteToolTarget(store, requireSiteId(args), requested, 'deploy')
        if (allowWrites) {
          assertSiteToolAllowed({
            target,
            group: 'deploy',
            step: { key: 'wp-cli', label: `WP-CLI (${location})`, remote: location === 'remote' },
            requestedEnvironment: requested,
            confirmed: readFlag(args, 'confirm', false)
          })
        }
        if (location === 'local') {
          return {
            ok: true,
            value: await runLocalWpCli({
              cwd: target.config.wpDir,
              args: cliArgs,
              allowWrites,
              timeoutMs,
              ...(target.site.dbSocket ? { dbSocket: target.site.dbSocket } : {})
            })
          }
        }
        const signal = AbortSignal.timeout(TOOL_DEADLINE_MS)
        return {
          ok: true,
          value: await withRemoteSiteTool(target.config, signal, ({ session, layout }) =>
            runRemoteWpCli(session, {
              rootPath: layout.webroot,
              args: cliArgs,
              allowWrites,
              timeoutMs,
              environment: target.environment
            })
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteTools:comparePlugins',
    async (_event, raw: unknown): Promise<SiteResult<PluginComparison>> => {
      try {
        const args = readToolArgs(raw)
        const target = await resolveSiteToolTarget(
          store,
          requireSiteId(args),
          readEnvironment(args),
          'import'
        )
        const signal = AbortSignal.timeout(TOOL_DEADLINE_MS)
        return {
          ok: true,
          value: await withRemoteSiteTool(target.config, signal, ({ session, layout }) =>
            comparePlugins(target.config, session, layout)
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  for (const [channel, includeLiveSite] of [
    ['siteTools:testConnection', false],
    ['siteTools:checkHealth', true]
  ] as const) {
    ipcMain.handle(
      channel,
      async (_event, raw: unknown): Promise<SiteResult<SiteConnectionReport>> => {
        try {
          const args = readToolArgs(raw)
          const target = await resolveSiteToolTarget(
            store,
            requireSiteId(args),
            readEnvironment(args),
            'import'
          )
          const signal = AbortSignal.timeout(TOOL_DEADLINE_MS)
          return {
            ok: true,
            value: await checkSiteConnection({
              config: target.config,
              openSession: () => createSiteSshSession(target.config, signal),
              includeLiveSite,
              signal
            })
          }
        } catch (error) {
          return failure(error)
        }
      }
    )
  }

  ipcMain.handle(
    'siteTools:wordpressVersion',
    async (_event, raw: unknown): Promise<SiteResult<SiteWordPressVersions>> => {
      try {
        const args = readToolArgs(raw)
        const target = await resolveSiteToolTarget(
          store,
          requireSiteId(args),
          readEnvironment(args),
          'import'
        )
        const signal = AbortSignal.timeout(TOOL_DEADLINE_MS)
        return {
          ok: true,
          value: await withRemoteSiteTool(target.config, signal, ({ session, layout }) =>
            readWordPressVersions(target.config, session, layout)
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteTools:activeTheme',
    async (_event, raw: unknown): Promise<SiteResult<SiteActiveTheme>> => {
      try {
        const args = readToolArgs(raw)
        const location = readWpCliLocation(args)
        const target = await resolveSiteToolTarget(
          store,
          requireSiteId(args),
          readEnvironment(args),
          'import'
        )
        if (location === 'local') {
          return { ok: true, value: await readLocalActiveTheme(target.config) }
        }
        const signal = AbortSignal.timeout(TOOL_DEADLINE_MS)
        return {
          ok: true,
          value: await withRemoteSiteTool(target.config, signal, ({ session, layout }) =>
            readRemoteActiveTheme(target.config, session, layout)
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteTools:findFile',
    async (_event, raw: unknown): Promise<SiteResult<RemoteFileSearch>> => {
      try {
        const args = readToolArgs(raw)
        const pattern = requireText(args, 'pattern')
        const searchPath = args.path === undefined ? '' : requireText(args, 'path')
        const kind = readSearchKind(args)
        const maxMatches = readPositiveInteger(args, 'maxMatches', 20, MAX_FIND_MATCHES)
        const maxSizeBytes = readPositiveInteger(
          args,
          'maxSizeBytes',
          256 * 1024,
          MAX_FIND_SIZE_BYTES
        )
        const maxDepth = readPositiveInteger(args, 'maxDepth', 6, MAX_FIND_DEPTH)
        const target = await resolveSiteToolTarget(
          store,
          requireSiteId(args),
          readEnvironment(args),
          'import'
        )
        const signal = AbortSignal.timeout(TOOL_DEADLINE_MS)
        return {
          ok: true,
          value: await withRemoteSiteTool(target.config, signal, ({ session, layout }) =>
            findRemoteFiles(session, {
              pattern,
              searchRoot: searchPath || layout.webroot,
              kind,
              maxMatches,
              maxSizeBytes,
              maxDepth,
              environment: target.environment
            })
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )
}
