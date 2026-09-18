// ACF field-path grammar and the JSON payload the bundled PHP runner consumes.
//
// Paths are 0-based and match unformatted get_field() arrays / option-key integers.
// The PHP walker is the authority at runtime; this module refuses junk before SSH.

import { readString, SiteMcpToolError, type ToolArguments } from './mcp/site-mcp-arguments'
import type { AcfTarget } from './wp-acf-target'
import acfFieldsPhp from './php/acf-fields.php?raw'
// Type-only, so the row-op module can keep importing the path grammar from here without a runtime cycle.
import type { AcfRowOp } from './wp-acf-row-ops'

export const ACF_FIELDS_PHP = acfFieldsPhp
export const ACF_MAX_PATHS = 40
export const ACF_MAX_PAYLOAD_BYTES = 256 * 1024

export type AcfPathSegment =
  | { kind: 'field'; name: string }
  | { kind: 'index'; index: number }
  | { kind: 'wildcard' }

export type AcfFieldWrite = {
  path: string
  value: unknown
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const INDEX_SEGMENT = /^[0-9]+$/
export const WILDCARD_SEGMENT = '*'

export function parseAcfPath(path: string): AcfPathSegment[] {
  if (path.length === 0) {
    throw new SiteMcpToolError('path is empty.')
  }
  if (path.startsWith('.') || path.endsWith('.') || path.includes('..')) {
    throw new SiteMcpToolError(`invalid path '${path}'.`)
  }
  const parts = path.split('.')
  return parts.map((part, index) => {
    if (part === WILDCARD_SEGMENT) {
      if (index === 0) {
        throw new SiteMcpToolError('path cannot start with a row index.')
      }
      return { kind: 'wildcard' }
    }
    if (INDEX_SEGMENT.test(part)) {
      if (index === 0) {
        throw new SiteMcpToolError('path cannot start with a row index.')
      }
      return { kind: 'index', index: Number.parseInt(part, 10) }
    }
    if (!FIELD_NAME.test(part)) {
      throw new SiteMcpToolError(`invalid path segment '${part}'.`)
    }
    return { kind: 'field', name: part }
  })
}

export function readAcfGetPaths(args: ToolArguments): string[] {
  const value = args.fields
  if (!Array.isArray(value) || value.length === 0) {
    throw new SiteMcpToolError("'fields' must be a non-empty array of paths.")
  }
  if (value.length > ACF_MAX_PATHS) {
    throw new SiteMcpToolError(`'fields' may list at most ${ACF_MAX_PATHS} paths.`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new SiteMcpToolError(`'fields[${index}]' must be a non-empty path.`)
    }
    parseAcfPath(entry)
    return entry
  })
}

export function readAcfWrites(args: ToolArguments): AcfFieldWrite[] {
  const value = args.fields
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new SiteMcpToolError("'fields' must be an array of {path, value}.")
  }
  if (value.length > ACF_MAX_PATHS) {
    throw new SiteMcpToolError(`'fields' may list at most ${ACF_MAX_PATHS} paths.`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new SiteMcpToolError(`'fields[${index}]' must be an object with path and value.`)
    }
    const row = entry as Record<string, unknown>
    if (typeof row.path !== 'string' || row.path.length === 0) {
      throw new SiteMcpToolError(`'fields[${index}].path' must be a non-empty string.`)
    }
    if (!('value' in row)) {
      throw new SiteMcpToolError(`'fields[${index}].value' is required.`)
    }
    if (hasAcfWildcard(parseAcfPath(row.path))) {
      throw new SiteMcpToolError(
        `'fields[${index}].path' uses a wildcard; wildcards are read-only. Use get_wp_fields to expand them, or a row operation.`
      )
    }
    return { path: row.path, value: row.value }
  })
}

// Exported so the read-request and row-op modules can refuse a pattern without re-walking the path.
export function hasAcfWildcard(segments: readonly AcfPathSegment[]): boolean {
  return segments.some((segment) => segment.kind === 'wildcard')
}

export type AcfReturnMode = 'full' | 'values'

// 'full' stays byte-identical to what shipped, so the key is only sent when it changes something.
export function readAcfReturnMode(args: ToolArguments): AcfReturnMode {
  const value = readString(args, 'return', 'full')
  if (value !== 'full' && value !== 'values') {
    throw new SiteMcpToolError("'return' must be 'full' or 'values'.")
  }
  return value
}

export function buildAcfPayload(input: {
  mode: 'get' | 'describe' | 'checksum' | 'preview' | 'apply' | 'snapshot' | 'restore'
  target?: AcfTarget
  targets?: readonly AcfTarget[]
  fields: (string | AcfFieldWrite)[]
  layoutFilter?: string
  returnMode?: AcfReturnMode
  rows?: readonly AcfRowOp[]
  roots?: Record<string, unknown>
  applyFlag?: boolean
}): string {
  const writing = input.mode === 'preview' || input.mode === 'apply'
  const fields = writing
    ? (input.fields as AcfFieldWrite[])
    : (input.fields as string[]).map((path) => ({ path }))
  const json = JSON.stringify({
    mode: input.mode,
    ...(input.targets ? { targets: input.targets } : { target: input.target }),
    fields,
    ...(input.layoutFilter ? { layout_filter: input.layoutFilter } : {}),
    ...(input.returnMode === 'values' ? { return: 'values' } : {}),
    ...(input.rows && input.rows.length > 0 ? { rows: input.rows } : {}),
    ...(input.roots ? { roots: input.roots } : {}),
    ...(input.applyFlag === undefined ? {} : { apply: input.applyFlag })
  })
  if (Buffer.byteLength(json, 'utf8') > ACF_MAX_PAYLOAD_BYTES) {
    throw new SiteMcpToolError(`Field payload is over the ${ACF_MAX_PAYLOAD_BYTES}-byte cap.`)
  }
  return json
}

function outputTail(value: string): string {
  return value.trim().slice(-2000)
}

function extractJsonObject(stdout: string): string | null {
  const trimmed = stdout.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  return start < 0 || end <= start ? null : trimmed.slice(start, end + 1)
}

export function parseAcfRunnerStdout(stdout: string): Record<string, unknown> {
  const json = extractJsonObject(stdout)
  if (json === null) {
    throw new SiteMcpToolError('ACF runner did not return JSON.', {
      stdout: outputTail(stdout)
    })
  }
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new SiteMcpToolError('ACF runner returned invalid JSON.', {
      stdout: outputTail(stdout)
    })
  }
}

export type AcfRunnerOutcome = {
  exitCode: number
  stdout: string
  stderr: string
  location: 'local' | 'remote'
  wpRoot: string
  command?: string
  outputTruncated?: boolean
  maxOutputChars?: number
}

// Tested before NO_WORDPRESS: WP-CLI's database error also names wp-config.php.
const DB_FAILURE =
  /error establishing a database connection|can't connect to (?:the )?(?:local )?mysql|access denied for user|unknown database|mysqli/i
const NO_WORDPRESS =
  /this does not seem to be a wordpress installation|wp-config\.php\W*(?:file )?(?:is empty|not found|is missing)|(?:strange|missing|no) wp-config\.php/i

function runnerFailureDetails(outcome: AcfRunnerOutcome): Record<string, unknown> {
  return {
    exit_code: outcome.exitCode,
    location: outcome.location,
    wp_root: outcome.wpRoot,
    stderr: outputTail(outcome.stderr),
    stdout: outputTail(outcome.stdout),
    ...(outcome.command ? { command: outcome.command } : {})
  }
}

// A cut envelope usually still holds a '{' and a '}', so it reads as invalid JSON rather than as
// missing JSON. Both routes name the cut, because "invalid JSON" sends the agent hunting a bug.
export function acfOutputCutError(outcome: AcfRunnerOutcome): SiteMcpToolError {
  const cap = outcome.maxOutputChars ?? outcome.stdout.length
  return new SiteMcpToolError(
    `ACF runner output was cut at ${cap} characters. Narrow the request: fewer paths, a layout_filter, or describe one container.`,
    runnerFailureDetails(outcome)
  )
}

export function explainAcfRunnerFailure(outcome: AcfRunnerOutcome): SiteMcpToolError {
  const details = runnerFailureDetails(outcome)
  if (outcome.outputTruncated === true) {
    return acfOutputCutError(outcome)
  }
  if (DB_FAILURE.test(outcome.stderr)) {
    return new SiteMcpToolError(
      `WordPress at ${outcome.wpRoot} could not connect to its database, so the ACF runner never ran.`,
      details
    )
  }
  if (NO_WORDPRESS.test(outcome.stderr)) {
    if (outcome.location === 'local') {
      return new SiteMcpToolError(
        `This site's local WordPress root (${outcome.wpRoot}) is not a bootable WordPress install (path + localWpRoot). Use location='remote' or point localWpRoot at the WordPress directory.`,
        details
      )
    }
    return new SiteMcpToolError(
      `WP-CLI did not find WordPress at the resolved webroot ${outcome.wpRoot} on the remote host.`,
      details
    )
  }
  if (outcome.exitCode === 0) {
    return new SiteMcpToolError('ACF runner did not return JSON.', details)
  }
  return new SiteMcpToolError(
    `WP-CLI exited ${outcome.exitCode} before the ACF runner produced JSON.`,
    details
  )
}

// A non-zero exit that still printed JSON is the runner's own ok:false envelope, not a transport failure.
export function parseAcfRunnerOutcome(outcome: AcfRunnerOutcome): Record<string, unknown> {
  if (extractJsonObject(outcome.stdout) === null) {
    throw explainAcfRunnerFailure(outcome)
  }
  try {
    return parseAcfRunnerStdout(outcome.stdout)
  } catch (error) {
    throw outcome.outputTruncated === true ? acfOutputCutError(outcome) : error
  }
}
