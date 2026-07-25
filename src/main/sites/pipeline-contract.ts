// The contract every site pipeline stage codes against.
//
// Pipelines are pure staged functions: they take a context and a resolved config, emit progress,
// and honour an AbortSignal. They never touch Electron, IPC, the Store, or secret storage — that
// keeps them unit-testable without a running app and keeps secret handling in one place.

import type { Site, SiteEnvironment, SiteRunGroup } from '../../shared/site-types'

export class SiteRunCancelledError extends Error {
  constructor() {
    super('Run cancelled')
    this.name = 'SiteRunCancelledError'
  }
}

/** Raised by a stage for an expected, explainable failure (bad config, missing binary, remote error). */
export class SiteRunStepError extends Error {
  readonly step: string
  constructor(step: string, message: string) {
    super(message)
    this.name = 'SiteRunStepError'
    this.step = step
  }
}

export type SiteRunProgress = {
  /** Human label for the current stage, e.g. 'Downloading database'. */
  label: string
  transferred: number
  total: number
}

export type SiteRunContext = {
  signal: AbortSignal
  /** A line of output for the run log and the console. Must already be redacted. */
  log: (line: string) => void
  /** Marks the start of a named stage; drives the stepper UI. */
  status: (stage: string) => void
  /** Byte-level transfer progress; throttled downstream, so callers may emit freely. */
  progress: (progress: SiteRunProgress) => void
  /** Throws SiteRunCancelledError when the run has been aborted. Call between stages. */
  throwIfCancelled: () => void
}

export type SiteExecResult = {
  code: number
  stdout: string
  stderr: string
}

export type SiteExecOptions = {
  /** Overall wall-clock budget. 0 disables it — required for mysqldump on large databases. */
  timeoutMs?: number
  /** Streams stdout as it arrives instead of buffering; used for long remote commands. */
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

export type SiteTransferProgress = (transferred: number, total: number) => void

/**
 * A live SSH session against one environment. Implemented over Orca's SshConnectionManager;
 * pipelines see only this surface so they can be tested with a fake.
 */
export type SiteSshSession = {
  /** Runs a command. Never interpolate untrusted values — use quoteShellArgument. */
  exec: (command: string, options?: SiteExecOptions) => Promise<SiteExecResult>
  download: (
    remotePath: string,
    localPath: string,
    onProgress?: SiteTransferProgress
  ) => Promise<void>
  upload: (
    localPath: string,
    remotePath: string,
    onProgress?: SiteTransferProgress
  ) => Promise<void>
  /** Writes a small file (mode 0600) — used for the mysqldump option file. */
  writeSecureRemoteFile: (remotePath: string, contents: string) => Promise<void>
  /** Best-effort delete; never throws. */
  removeRemoteFile: (remotePath: string) => Promise<void>
  close: () => Promise<void>
}

/** Everything a pipeline needs, with secrets already decrypted by the caller. */
export type SiteRunConfig = {
  site: Site
  environmentName: string
  environment: SiteEnvironment
  group: SiteRunGroup
  /** Absolute path to the WordPress root: site.path joined with site.localWpRoot. */
  wpDir: string
  sshPassword: string
  dbPassword: string
}

/** Remote layout, resolved once per run: standard WordPress or Bedrock (web/ + web/app). */
export type RemoteLayout = {
  webroot: string
  /** Directory name holding themes/plugins/uploads: 'wp-content', or 'app' under Bedrock. */
  contentDir: string
}

/**
 * POSIX single-quote quoting for remote commands. Every value interpolated into a remote shell
 * string must go through this — hostnames, paths, and DB names all come from user config.
 */
export function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}
