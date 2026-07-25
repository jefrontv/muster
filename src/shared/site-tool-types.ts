// Wire types for the site utility tools (the ocsites operational tool set: WP-CLI, plugin diff,
// uploads/plugin sync, connection and health probes, remote file search).
//
// Browser-safe by construction: no node imports, no Electron, no behaviour. The renderer, the
// preload bridge and the main-process modules agree on these shapes and nothing else.
//
// Nothing here carries a credential. The remote DB password parsed out of wp-config.php never
// leaves main, and every `detail` string is built from a redacted source.

export type WpCliLocation = 'local' | 'remote'

/** Result of the read-safety check, returned even when the command was allowed. */
export type WpCliSafetyVerdict = {
  allowed: boolean
  /** Why it was allowed or refused. Shown verbatim, so it names the opt-in flag when refusing. */
  reason: string
}

export type WpCliResult = {
  location: WpCliLocation
  /** True when the safety list refused: no process ran, `code` is -1, and both streams are empty. */
  blocked: boolean
  safetyReason: string
  /** What actually ran, already quoted. Empty when blocked. */
  command: string
  code: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  /** Null for a local run — WP-CLI against the checkout targets no environment. */
  environment: string | null
}

/** How a plugin list was obtained. A directory scan cannot see activation status. */
export type PluginInventorySource = 'wp-cli' | 'directory-scan' | 'unavailable'

export type PluginEntry = {
  name: string
  version: string
  /** 'unknown' from a directory scan, which has no database to ask. */
  status: string
}

export type PluginDiff = 'local-only' | 'remote-only' | 'version-changed' | 'match'

export type PluginComparisonRow = {
  plugin: string
  diff: PluginDiff
  localVersion: string | null
  remoteVersion: string | null
  localStatus: string | null
  remoteStatus: string | null
}

export type PluginComparison = {
  environment: string
  localCount: number
  remoteCount: number
  localSource: PluginInventorySource
  remoteSource: PluginInventorySource
  /** The source of truth; the three name lists below are projections of it. */
  rows: PluginComparisonRow[]
  localOnly: string[]
  remoteOnly: string[]
  versionChanged: string[]
}

export type SiteCheckName =
  | 'ssh-connect'
  | 'wp-config-readable'
  | 'remote-db-credentials'
  | 'remote-db-ping'
  | 'disk-space'
  | 'local-db-login'
  | 'http-reachable'
  | 'tls-certificate'

/** 'skipped' is not a failure: a check that could not run (no live domain, no local DB) reports it. */
export type SiteCheckOutcome = 'ok' | 'failed' | 'skipped'

export type SiteCheck = {
  check: SiteCheckName
  outcome: SiteCheckOutcome
  detail: string
}

/**
 * The first thing that went wrong, classified. ocsites returned only a flat check list with
 * free-text details, so a caller could not tell a wrong password from an unreachable host from a
 * mistyped root path — the three failures with completely different fixes.
 */
export type SiteConnectionFailure =
  | 'no-environment'
  | 'missing-credentials'
  | 'auth'
  | 'unreachable'
  | 'wrong-path'
  | 'remote-database'
  | 'disk-space'
  | 'local-database'
  | 'live-site'

export type SiteConnectionReport = {
  environment: string
  ok: boolean
  checks: SiteCheck[]
  failedCount: number
  /** Null when every check that ran passed. */
  failure: SiteConnectionFailure | null
}

export type SiteWordPressVersions = {
  environment: string
  /** Empty when the version could not be read on that side. */
  local: string
  remote: string
  /** False when either side is unknown — an absent reading is not a mismatch. */
  mismatch: boolean
}

export type SiteActiveThemeSource = 'local-database' | 'remote-wp-cli' | 'remote-database'

export type SiteActiveTheme = {
  theme: string
  source: SiteActiveThemeSource
  /** Null for the local lookup. */
  environment: string | null
}

export type RemoteFileKind = 'file' | 'directory' | 'binary' | 'too-large' | 'unreadable'

export type RemoteFileMatch = {
  path: string
  kind: RemoteFileKind
  /** Null for a directory or when the size could not be determined. */
  sizeBytes: number | null
  /** Decoded contents; only ever set for a text file inside the size cap. */
  content: string | null
  encoding: 'utf-8' | 'latin-1' | null
  /** Why content is absent, when that needs explaining. */
  detail: string | null
}

export type RemoteFileSearch = {
  environment: string
  searchRoot: string
  pattern: string
  kindFilter: RemoteFileSearchKind
  matches: RemoteFileMatch[]
  /** True when the server had more hits than `maxMatches`. */
  moreAvailable: boolean
}

export type RemoteFileSearchKind = 'file' | 'dir' | 'any'
