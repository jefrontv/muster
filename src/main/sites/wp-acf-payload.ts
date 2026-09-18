// ACF field-path grammar and the JSON payload the bundled PHP runner consumes.
//
// Paths are 0-based and match unformatted get_field() arrays / option-key integers.
// The PHP walker is the authority at runtime; this module refuses junk before SSH.

import {
  readBoolean,
  readString,
  SiteMcpToolError,
  type ToolArguments
} from './mcp/site-mcp-arguments'
import acfFieldsPhp from './php/acf-fields.php?raw'

export const ACF_FIELDS_PHP = acfFieldsPhp
export const ACF_MAX_PATHS = 40
export const ACF_MAX_PAYLOAD_BYTES = 256 * 1024

export type AcfPathSegment =
  | { kind: 'field'; name: string }
  | { kind: 'index'; index: number }
  | { kind: 'wildcard' }

export type AcfTargetKind = 'option' | 'post' | 'term' | 'user' | 'comment'

export type AcfTarget = {
  kind: AcfTargetKind
  id?: string | number
}

export type AcfFieldWrite = {
  path: string
  value: unknown
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const INDEX_SEGMENT = /^[0-9]+$/
export const WILDCARD_SEGMENT = '*'
const TARGET_KINDS: readonly AcfTargetKind[] = ['option', 'post', 'term', 'user', 'comment']

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

export function parseAcfTarget(raw: Record<string, unknown>): AcfTarget {
  const kindRaw = raw.kind
  if (kindRaw === 'options') {
    return parseAcfTarget({ ...raw, kind: 'option' })
  }
  if (typeof kindRaw !== 'string' || !(TARGET_KINDS as readonly string[]).includes(kindRaw)) {
    throw new SiteMcpToolError("'target.kind' must be option, post, term, user, or comment.")
  }
  const kind = kindRaw as AcfTargetKind
  const id = raw.id
  if (kind === 'option') {
    if (id === undefined || id === null || id === '') {
      return { kind: 'option' }
    }
    if (typeof id === 'string' || typeof id === 'number') {
      return { kind: 'option', id }
    }
    throw new SiteMcpToolError("'target.id' for option must be a string.")
  }
  if (id === undefined || id === null || id === '') {
    throw new SiteMcpToolError(`'target.id' is required for kind '${kind}'.`)
  }
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
    return { kind, id }
  }
  if (typeof id === 'string' && /^[0-9]+$/.test(id)) {
    const parsed = Number.parseInt(id, 10)
    if (parsed > 0) {
      return { kind, id: parsed }
    }
  }
  throw new SiteMcpToolError(`'target.id' for kind '${kind}' must be a positive integer.`)
}

export function readAcfTarget(args: ToolArguments): AcfTarget {
  const value = args.target
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SiteMcpToolError("'target' must be an object.")
  }
  return parseAcfTarget(value as Record<string, unknown>)
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
  if (!Array.isArray(value) || value.length === 0) {
    throw new SiteMcpToolError("'fields' must be a non-empty array of {path, value}.")
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
    if (hasWildcard(parseAcfPath(row.path))) {
      throw new SiteMcpToolError(
        `'fields[${index}].path' uses a wildcard; wildcards are read-only. Use get_wp_fields to expand them, or a row operation.`
      )
    }
    return { path: row.path, value: row.value }
  })
}

function hasWildcard(segments: readonly AcfPathSegment[]): boolean {
  return segments.some((segment) => segment.kind === 'wildcard')
}

export type AcfGetRequest =
  | { mode: 'get'; fields: string[] }
  | { mode: 'describe'; fields: string[]; layoutFilter?: string }

// describe answers "what is on this target"; its paths name containers, so a wildcard has nothing to expand.
export function readAcfDescribePaths(args: ToolArguments): string[] {
  const value = args.fields
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new SiteMcpToolError("'fields' must be an array of paths.")
  }
  if (value.length > ACF_MAX_PATHS) {
    throw new SiteMcpToolError(`'fields' may list at most ${ACF_MAX_PATHS} paths.`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new SiteMcpToolError(`'fields[${index}]' must be a non-empty path.`)
    }
    if (hasWildcard(parseAcfPath(entry))) {
      throw new SiteMcpToolError(`'fields[${index}]' cannot use a wildcard with describe.`)
    }
    return entry
  })
}

export function readAcfGetRequest(args: ToolArguments): AcfGetRequest {
  const layoutFilter = readString(args, 'layout_filter')
  if (!readBoolean(args, 'describe')) {
    if (layoutFilter.length > 0) {
      throw new SiteMcpToolError("'layout_filter' needs describe: true.")
    }
    return { mode: 'get', fields: readAcfGetPaths(args) }
  }
  const fields = readAcfDescribePaths(args)
  return layoutFilter.length > 0
    ? { mode: 'describe', fields, layoutFilter }
    : { mode: 'describe', fields }
}

export function buildAcfPayload(input: {
  mode: 'get' | 'describe' | 'preview' | 'apply'
  target: AcfTarget
  fields: (string | AcfFieldWrite)[]
  layoutFilter?: string
}): string {
  const reading = input.mode === 'get' || input.mode === 'describe'
  const fields = reading
    ? (input.fields as string[]).map((path) => ({ path }))
    : (input.fields as AcfFieldWrite[])
  const json = JSON.stringify({
    mode: input.mode,
    target: input.target,
    fields,
    ...(input.layoutFilter ? { layout_filter: input.layoutFilter } : {})
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
}

// Tested before NO_WORDPRESS: WP-CLI's database error also names wp-config.php.
const DB_FAILURE =
  /error establishing a database connection|can't connect to (?:the )?(?:local )?mysql|access denied for user|unknown database|mysqli/i
const NO_WORDPRESS =
  /this does not seem to be a wordpress installation|wp-config\.php\W*(?:file )?(?:is empty|not found|is missing)|(?:strange|missing|no) wp-config\.php/i

export function explainAcfRunnerFailure(outcome: AcfRunnerOutcome): SiteMcpToolError {
  const details: Record<string, unknown> = {
    exit_code: outcome.exitCode,
    location: outcome.location,
    wp_root: outcome.wpRoot,
    stderr: outputTail(outcome.stderr),
    stdout: outputTail(outcome.stdout),
    ...(outcome.command ? { command: outcome.command } : {})
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
  return parseAcfRunnerStdout(outcome.stdout)
}
