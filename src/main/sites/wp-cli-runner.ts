// WP-CLI, local and remote, behind ocsites' read-safety list (mcp_server.py:776-995).
//
// The posture is read-safe by default: a verb/subcommand pair on the allowlist runs freely, and
// anything else — including everything that writes — needs an explicit opt-in from the caller.
// Three verbs are refused even with the opt-in because they execute arbitrary PHP.
//
// Arguments are validated for shell metacharacters AND quoted with quoteShellArgument on the way
// out. Both layers are load-bearing: the local path spawns argv directly (no shell) while the
// remote path must build one command string for the server's shell, so the quoting is what keeps a
// crafted argument a single argument there.

import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import type { WpCliResult, WpCliSafetyVerdict } from '../../shared/site-tool-types'
import { createLocalWpHost } from './localwp-host'
import { buildLocalWpWpEnv } from './localwp-wp-cli-environment'
import {
  quoteShellArgument,
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteExecResult,
  type SiteSshSession
} from './pipeline-contract'

export const WP_CLI_STEP = 'wp-cli'
const WP_BINARY = 'wp'

/** Caps ported verbatim: a huge `wp db export -` would otherwise flood the caller. */
export const WP_CLI_MAX_OUTPUT_CHARS = 50_000
export const WP_CLI_MAX_ARGS = 30
export const WP_CLI_DEFAULT_TIMEOUT_MS = 60_000
const WP_CLI_MIN_TIMEOUT_MS = 5_000
const WP_CLI_MAX_TIMEOUT_MS = 120_000

/**
 * Verb → subcommands that only read. The subcommand is the first positional argument after the
 * verb; two-word forms ('cron event list') are matched as a pair.
 */
const WP_READ_ALLOWLIST: Record<string, readonly string[]> = {
  option: ['get', 'list', 'pluck'],
  user: ['list', 'get', 'meta'],
  plugin: ['list', 'status', 'is-active', 'is-installed', 'path', 'search', 'verify-checksums'],
  theme: ['list', 'status', 'is-active', 'is-installed', 'path', 'get', 'mod'],
  post: ['list', 'get', 'meta', 'url'],
  page: ['list', 'get'],
  term: ['list', 'get'],
  site: ['list'],
  core: ['version', 'check-update', 'is-installed', 'verify-checksums'],
  db: ['tables', 'size', 'check', 'search', 'prefix'],
  menu: ['list'],
  role: ['list', 'exists'],
  rewrite: ['list', 'structure'],
  config: ['list', 'get', 'has', 'path'],
  cli: ['version', 'info', 'alias', 'param-dump', 'completions'],
  transient: ['list', 'get'],
  cron: ['event list', 'schedule list', 'test'],
  comment: ['list', 'get', 'count'],
  sidebar: ['list'],
  widget: ['list'],
  language: ['core list', 'plugin list', 'theme list']
}

/** Arbitrary code execution: refused even with the write opt-in. */
const WP_HARD_BANNED: readonly string[] = ['eval', 'eval-file', 'shell']

/** Shell metacharacters. Defence in depth — the quoting below already neutralises these. */
const DANGEROUS_ARGUMENT = /[;`$<>|&]|\$\(|\)\$|\$\{/

/** Flags that would repoint WP-CLI at another install or load caller-chosen PHP. */
const FORBIDDEN_FLAG_PREFIXES: readonly string[] = ['--path=', '--url=', '--require=']

export function checkWpCliSafety(
  args: readonly string[],
  allowWrites: boolean
): WpCliSafetyVerdict {
  if (args.length === 0) {
    return { allowed: false, reason: 'No WP-CLI verb supplied.' }
  }
  if (args.length > WP_CLI_MAX_ARGS) {
    return {
      allowed: false,
      reason: `Too many arguments (${args.length} > ${WP_CLI_MAX_ARGS}) — refusing to forward.`
    }
  }
  for (const argument of args) {
    if (typeof argument !== 'string') {
      return { allowed: false, reason: 'Every WP-CLI argument must be a string.' }
    }
    if (DANGEROUS_ARGUMENT.test(argument)) {
      return { allowed: false, reason: `Argument contains shell metacharacters: ${argument}` }
    }
    const forbidden = FORBIDDEN_FLAG_PREFIXES.find((prefix) => argument.startsWith(prefix))
    if (forbidden) {
      return { allowed: false, reason: `Refusing a caller-supplied ${forbidden} flag.` }
    }
    if (argument.startsWith('--debug')) {
      return { allowed: false, reason: 'Refusing --debug flags.' }
    }
  }

  const verb = args[0]
  if (WP_HARD_BANNED.includes(verb)) {
    return {
      allowed: false,
      reason: `\`wp ${verb}\` is never allowed: it executes arbitrary code on the target.`
    }
  }

  const subIndex = args.findIndex((argument, index) => index > 0 && !argument.startsWith('-'))
  const sub = subIndex === -1 ? '' : args[subIndex]
  const allowed = WP_READ_ALLOWLIST[verb] ?? []
  if (sub && allowed.includes(sub)) {
    return { allowed: true, reason: 'Read-only allowlist match.' }
  }
  const pair = subIndex === -1 ? '' : `${sub} ${args[subIndex + 1] ?? ''}`.trim()
  if (pair && allowed.includes(pair)) {
    return { allowed: true, reason: 'Read-only allowlist match.' }
  }
  // ocsites' one special case: a dry run of search-replace reports without touching a row.
  if (verb === 'search-replace' && args.includes('--dry-run')) {
    return { allowed: true, reason: 'search-replace with --dry-run performs no writes.' }
  }
  if (allowWrites) {
    return { allowed: true, reason: 'Outside the read-only allowlist; writes explicitly allowed.' }
  }
  return {
    allowed: false,
    reason:
      `\`wp ${[verb, sub].filter(Boolean).join(' ')}\` is not on the read-only allowlist. ` +
      'Re-run with allowWrites once the user has agreed to a change.'
  }
}

export type WpCliRequest = {
  args: readonly string[]
  allowWrites: boolean
  /** Clamped to 5–120 s, as in ocsites. */
  timeoutMs?: number
  signal?: AbortSignal
}

export type LocalWpCliRequest = WpCliRequest & {
  /** The WordPress root; WP-CLI is spawned here and bootstraps the site's own wp-config.php. */
  cwd: string
  /** LocalWP per-site socket. When set, WP-CLI runs under Local's PHP so it can reach the socket. */
  dbSocket?: string
}

/** Resolves LocalWP's PHP/socket environment; injected so tests need no Local.app. */
export type LocalWpEnvResolver = (socketPath: string) => Promise<Record<string, string> | null>

const blockedResult = (
  location: 'local' | 'remote',
  environment: string | null,
  verdict: WpCliSafetyVerdict
): WpCliResult => ({
  location,
  blocked: true,
  safetyReason: verdict.reason,
  command: '',
  code: -1,
  stdout: '',
  stderr: '',
  stdoutTruncated: false,
  stderrTruncated: false,
  environment
})

export async function runLocalWpCli(
  request: LocalWpCliRequest,
  resolveLocalWpEnv: LocalWpEnvResolver = (socketPath) =>
    buildLocalWpWpEnv(createLocalWpHost(), socketPath)
): Promise<WpCliResult> {
  const verdict = checkWpCliSafety(request.args, request.allowWrites)
  if (!verdict.allowed) {
    return blockedResult('local', null, verdict)
  }
  const args = [...request.args]
  const socketPath = request.dbSocket?.trim() ?? ''
  const localWpEnv = socketPath.length > 0 ? await resolveLocalWpEnv(socketPath) : null
  let result: StreamCommandResult
  try {
    result = await streamCommand(WP_BINARY, args, {
      cwd: request.cwd,
      env: {
        ...(localWpEnv ?? process.env),
        // A benign PHP warning from a messy wp-config must not be read as command output.
        WP_CLI_PHP_ARGS: '-d error_reporting=E_ERROR -d display_errors=0'
      },
      timeoutMs: clampTimeout(request.timeoutMs),
      ...(request.signal ? { signal: request.signal } : {})
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SiteRunCancelledError()
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new SiteRunStepError(
      WP_CLI_STEP,
      `WP-CLI (\`wp\`) could not be run in ${request.cwd}: ${detail}`
    )
  }
  return finish('local', null, verdict, buildLocalCommandLine(args), result)
}

export type RemoteWpCliRequest = WpCliRequest & {
  /** Remote WordPress root, as configured on the environment. */
  rootPath: string
  environment: string
}

export async function runRemoteWpCli(
  session: SiteSshSession,
  request: RemoteWpCliRequest
): Promise<WpCliResult> {
  const verdict = checkWpCliSafety(request.args, request.allowWrites)
  if (!verdict.allowed) {
    return blockedResult('remote', request.environment, verdict)
  }
  const command = buildRemoteWpCliCommand(request.rootPath, request.args)
  let result: SiteExecResult
  try {
    result = await session.exec(command, { timeoutMs: clampTimeout(request.timeoutMs) })
  } catch (error) {
    if (error instanceof SiteRunCancelledError) {
      throw error
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new SiteRunStepError(WP_CLI_STEP, `Remote WP-CLI failed: ${detail}`)
  }
  return finish('remote', request.environment, verdict, command, result)
}

/**
 * `cd <root> && wp --no-color <args>` with every part single-quoted. The root comes from user
 * config and the arguments from a caller, so neither may reach the remote shell unquoted.
 */
export function buildRemoteWpCliCommand(rootPath: string, args: readonly string[]): string {
  const root = rootPath.trim().replace(/\/+$/, '') || '.'
  const quoted = args.map(quoteShellArgument).join(' ')
  return `cd ${quoteShellArgument(root)} && ${WP_BINARY} --no-color ${quoted}`.trim()
}

/** Purely for display and audit: what a shell would have needed to reproduce the local run. */
function buildLocalCommandLine(args: readonly string[]): string {
  return [WP_BINARY, ...args].map(quoteShellArgument).join(' ')
}

function finish(
  location: 'local' | 'remote',
  environment: string | null,
  verdict: WpCliSafetyVerdict,
  command: string,
  result: { code: number; stdout: string; stderr: string }
): WpCliResult {
  const stdout = result.stdout.slice(0, WP_CLI_MAX_OUTPUT_CHARS)
  const stderr = result.stderr.slice(0, WP_CLI_MAX_OUTPUT_CHARS)
  return {
    location,
    blocked: false,
    safetyReason: verdict.reason,
    command,
    code: result.code,
    stdout,
    stderr,
    stdoutTruncated: stdout.length < result.stdout.length,
    stderrTruncated: stderr.length < result.stderr.length,
    environment
  }
}

function clampTimeout(timeoutMs: number | undefined): number {
  const requested = timeoutMs && timeoutMs > 0 ? timeoutMs : WP_CLI_DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(requested, WP_CLI_MIN_TIMEOUT_MS), WP_CLI_MAX_TIMEOUT_MS)
}
