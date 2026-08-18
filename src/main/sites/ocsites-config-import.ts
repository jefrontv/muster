// One-way import of the legacy ocsites configuration (~/.config/ocsites/).
//
// Read-only against the source: ocsites keeps working off its own files until it is
// decommissioned. Re-running is safe — sites are matched on their local path, so an existing
// Muster site is updated rather than duplicated.
//
// Secrets are Fernet-decrypted here and immediately re-encrypted with safeStorage; plaintext
// never lands on disk and never crosses IPC.

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  createEmptySiteEnvironment,
  DEFAULT_SITE_REMOTE_ROOT_PATH,
  type Site,
  type SiteEnvironment,
  type SiteLocalStack
} from '../../shared/site-types'
import { decryptFernetToken, parseFernetKey, type FernetKey } from './ocsites-fernet'

export type OcsitesGlobalConfig = {
  sitesRoots: string[]
  bitbucketUsername: string
  bitbucketAppPassword: string
  bitbucketWorkspace: string
  favorites: string[]
}

export type OcsitesImportedSecret = {
  environment: string
  kind: 'ssh' | 'db'
  value: string
}

export type OcsitesImportedSite = {
  site: Site
  secrets: OcsitesImportedSecret[]
}

export type OcsitesImportReport = {
  configDirectory: string
  found: boolean
  global: OcsitesGlobalConfig | null
  sites: OcsitesImportedSite[]
  /** Presets skipped because they carry no local path — unusable without a checkout. */
  skippedPresets: number
  /** Per-secret decrypt failures; the site still imports, minus that password. */
  secretFailures: { path: string; environment: string; kind: string; reason: string }[]
}

export function getOcsitesConfigDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME?.trim()
  return xdg ? path.join(xdg, 'ocsites') : path.join(homedir(), '.config', 'ocsites')
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return null
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function readGlobalConfig(configDirectory: string): OcsitesGlobalConfig | null {
  const parsed = readJsonFile(path.join(configDirectory, 'config.json'))
  if (parsed === null || typeof parsed !== 'object') {
    return null
  }
  const raw = parsed as Record<string, unknown>
  const roots = Array.isArray(raw.sites_roots)
    ? raw.sites_roots.filter((entry): entry is string => typeof entry === 'string')
    : []
  const legacyRoot = asString(raw.sites_root)
  return {
    sitesRoots: roots.length > 0 ? roots : legacyRoot ? [legacyRoot] : [],
    bitbucketUsername: asString(raw.bitbucket_username),
    bitbucketAppPassword: asString(raw.bitbucket_api_key),
    bitbucketWorkspace: asString(raw.bitbucket_workspace),
    favorites: Array.isArray(raw.favorites)
      ? raw.favorites.filter((entry): entry is string => typeof entry === 'string')
      : []
  }
}

function loadFernetKey(configDirectory: string): FernetKey | null {
  const keyPath = path.join(configDirectory, 'secret.key')
  if (!existsSync(keyPath)) {
    return null
  }
  try {
    return parseFernetKey(readFileSync(keyPath, 'utf8'))
  } catch {
    return null
  }
}

// ocsites stores live_domain as a bare host, but hand-edited presets sometimes carry a scheme.
// The pipeline needs them split: the host drives search-replace, the scheme drives upload rewrite.
function splitLiveDomain(raw: string): { liveDomain: string; protocol: 'http' | 'https' } {
  const trimmed = raw.trim()
  if (trimmed.startsWith('http://')) {
    return { liveDomain: trimmed.slice('http://'.length).replace(/\/+$/, ''), protocol: 'http' }
  }
  if (trimmed.startsWith('https://')) {
    return { liveDomain: trimmed.slice('https://'.length).replace(/\/+$/, ''), protocol: 'https' }
  }
  return { liveDomain: trimmed.replace(/\/+$/, ''), protocol: 'https' }
}

function convertEnvironment(raw: Record<string, unknown>): SiteEnvironment {
  const { liveDomain, protocol } = splitLiveDomain(asString(raw.live_domain))
  return {
    ...createEmptySiteEnvironment(),
    hostname: asString(raw.hostname),
    // ocsites presets may store the port as a number; keep the app's text shape.
    sshPort: typeof raw.ssh_port === 'number' ? String(raw.ssh_port) : asString(raw.ssh_port),
    username: asString(raw.username),
    rootPath: asString(raw.root_path) || DEFAULT_SITE_REMOTE_ROOT_PATH,
    liveDomain,
    liveDomainProtocol: protocol,
    deployCommand: asString(raw.deploy_command),
    themeDistPath: asString(raw.theme_dist_path),
    exportDatabase: asBoolean(raw.export_database),
    exportFiles: asBoolean(raw.export_files),
    wpSearchReplace: asBoolean(raw.wp_search_replace),
    wpUploadRewrite: asBoolean(raw.wp_upload_rewrite),
    gitPullOnServer: asBoolean(raw.git_pull_on_server),
    clearServerCache: asBoolean(raw.clear_server_cache),
    deployThemes: asBoolean(raw.deploy_themes)
  }
}

/**
 * A guess from an imported ocsites config, deliberately still LocalWP-biased.
 *
 * The layout alone cannot separate the two managed stacks: agent-local adopts a LocalWP site in
 * place, docroot and all, so `app/public` describes both. Nothing here can tell them apart, and
 * only agent-local's own registry can — so this keeps the historical answer and leaves the
 * correction to the live detection pass in ipc/site-stacks.ts, which probes agent-local first.
 */
function detectLocalStack(localWpRoot: string, dbSocket: string): SiteLocalStack {
  if (dbSocket.length > 0 || localWpRoot === 'app/public') {
    return 'localwp'
  }
  return 'plain'
}

export function importOcsitesConfig(
  configDirectory = getOcsitesConfigDirectory()
): OcsitesImportReport {
  const report: OcsitesImportReport = {
    configDirectory,
    found: false,
    global: null,
    sites: [],
    skippedPresets: 0,
    secretFailures: []
  }
  if (!existsSync(configDirectory)) {
    return report
  }
  report.found = true
  report.global = readGlobalConfig(configDirectory)

  const presetsRaw = readJsonFile(path.join(configDirectory, 'deploy_presets.json'))
  if (presetsRaw === null || typeof presetsRaw !== 'object') {
    return report
  }
  const presets = (presetsRaw as Record<string, unknown>).connection_presets
  if (!Array.isArray(presets)) {
    return report
  }

  const fernetKey = loadFernetKey(configDirectory)

  for (const entry of presets) {
    if (entry === null || typeof entry !== 'object') {
      report.skippedPresets += 1
      continue
    }
    const preset = entry as Record<string, unknown>
    const sitePath = asString(preset.local_target_directory).trim()
    if (sitePath.length === 0) {
      report.skippedPresets += 1
      continue
    }

    const environments: Record<string, SiteEnvironment> = {}
    const secrets: OcsitesImportedSecret[] = []
    const rawEnvironments =
      preset.environments !== null && typeof preset.environments === 'object'
        ? (preset.environments as Record<string, unknown>)
        : {}

    for (const [name, rawEnvironment] of Object.entries(rawEnvironments)) {
      if (rawEnvironment === null || typeof rawEnvironment !== 'object') {
        continue
      }
      const environmentRecord = rawEnvironment as Record<string, unknown>
      environments[name] = convertEnvironment(environmentRecord)
      const token = asString(environmentRecord.password)
      if (token.length > 0) {
        decryptInto(secrets, report, fernetKey, sitePath, name, 'ssh', token)
      }
    }

    const localWpRoot = asString(preset.local_wp_root)
    const dbSocket = asString(preset.db_socket)
    const dbPasswordToken = asString(preset.db_password)
    if (dbPasswordToken.length > 0) {
      // The DB password is site-wide in ocsites; store it against every environment so the
      // pipeline can read it with one lookup shape regardless of target.
      const names = Object.keys(environments)
      for (const name of names.length > 0 ? names : ['main']) {
        decryptInto(secrets, report, fernetKey, sitePath, name, 'db', dbPasswordToken)
      }
    }

    const dbPortRaw = preset.db_port
    report.sites.push({
      site: {
        id: randomUUID(),
        path: sitePath,
        repoId: null,
        displayName: path.basename(sitePath.replace(/[/\\]+$/, '')) || sitePath,
        localWpRoot,
        localDomain: asString(preset.local_domain),
        localStack: detectLocalStack(localWpRoot, dbSocket),
        dbUser: asString(preset.db_user) || 'root',
        dbSocket,
        dbPort: typeof dbPortRaw === 'number' && Number.isFinite(dbPortRaw) ? dbPortRaw : null,
        phpVersion: asString(preset.php_version),
        activeEnvironment: asString(preset.active_environment),
        environments,
        notes: asString(preset.notes),
        searchReplaceTimeoutSeconds: 600
      },
      secrets
    })
  }

  return report
}

// ocsites stores base64url(fernet_token) rather than the token itself — ConfigManager.encrypt_password
// wraps Fernet's already-base64url output a second time (deploy/config.py:138). Unwrap that layer
// before decrypting. Values written by hand or by an older build may be a bare token, so accept both.
const FERNET_TOKEN_PREFIX = 'gAAAAA'

function unwrapStoredToken(stored: string): string {
  const trimmed = stored.trim()
  if (trimmed.startsWith(FERNET_TOKEN_PREFIX)) {
    return trimmed
  }
  const decoded = Buffer.from(trimmed, 'base64url').toString('utf8')
  return decoded.startsWith(FERNET_TOKEN_PREFIX) ? decoded : trimmed
}

function decryptInto(
  secrets: OcsitesImportedSecret[],
  report: OcsitesImportReport,
  key: FernetKey | null,
  sitePath: string,
  environment: string,
  kind: 'ssh' | 'db',
  token: string
): void {
  if (key === null) {
    report.secretFailures.push({
      path: sitePath,
      environment,
      kind,
      reason: 'secret.key missing or unreadable'
    })
    return
  }
  try {
    const value = decryptFernetToken(key, unwrapStoredToken(token))
    if (value.length > 0) {
      secrets.push({ environment, kind, value })
    }
  } catch (error) {
    report.secretFailures.push({
      path: sitePath,
      environment,
      kind,
      reason: error instanceof Error ? error.message : String(error)
    })
  }
}
