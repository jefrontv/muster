// Row operations for update_wp_fields: add, remove, reorder and copy rows of a repeater or
// flexible field.
//
// Everything checkable without ACF is checked here, before any SSH: a bad op wastes a round trip
// and, worse, lands in the middle of an atomic apply. Whether a layout is required is an ACF
// question (flexible yes, repeater no), so the walker keeps that one.

import { SiteMcpToolError, type ToolArguments } from './mcp/site-mcp-arguments'
import { hasAcfWildcard, parseAcfPath } from './wp-acf-payload'

export const ACF_MAX_ROW_OPS = 40

export type AcfRowOpKind = 'append' | 'insert' | 'delete' | 'move' | 'duplicate'

export type AcfRowOp = {
  op: AcfRowOpKind
  path: string
  layout?: string
  index?: number
  to?: number
  values?: Record<string, unknown>
}

const ROW_OP_KINDS: readonly AcfRowOpKind[] = ['append', 'insert', 'delete', 'move', 'duplicate']
const NEEDS_INDEX: readonly AcfRowOpKind[] = ['insert', 'delete', 'move', 'duplicate']
const TAKES_ROW_BODY: readonly AcfRowOpKind[] = ['append', 'insert']
const ROW_OP_KEYS = ['op', 'path', 'layout', 'index', 'to', 'values']

export function readAcfRowOps(args: ToolArguments): AcfRowOp[] {
  const value = args.rows
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new SiteMcpToolError("'rows' must be an array of row operations.")
  }
  if (value.length > ACF_MAX_ROW_OPS) {
    throw new SiteMcpToolError(`'rows' may list at most ${ACF_MAX_ROW_OPS} operations.`)
  }
  return value.map((entry, index) => readRowOp(entry, `rows[${index}]`))
}

function readRowOp(entry: unknown, label: string): AcfRowOp {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new SiteMcpToolError(`'${label}' must be an object.`)
  }
  const row = entry as Record<string, unknown>
  for (const key of Object.keys(row)) {
    if (!ROW_OP_KEYS.includes(key)) {
      throw new SiteMcpToolError(
        `'${label}.${key}' is not a row operation field. Use ${ROW_OP_KEYS.join(', ')}.`
      )
    }
  }
  const op = readOpKind(row, label)
  const result: AcfRowOp = { op, path: readContainerPath(row, label) }
  const index = readOptionalRowIndex(row, 'index', label)
  if (NEEDS_INDEX.includes(op)) {
    if (index === undefined) {
      throw new SiteMcpToolError(`'${label}.index' is required by ${op}.`)
    }
    result.index = index
  } else if (index !== undefined) {
    throw new SiteMcpToolError(`'${label}.index' is not used by append, which always adds last.`)
  }
  const to = readOptionalRowIndex(row, 'to', label)
  if (op === 'move' && to === undefined) {
    throw new SiteMcpToolError(`'${label}.to' is required by move.`)
  }
  if (to !== undefined) {
    if (op !== 'move' && op !== 'duplicate') {
      throw new SiteMcpToolError(`'${label}.to' is only used by move and duplicate.`)
    }
    result.to = to
  }
  const layout = readOpLayout(row, op, label)
  if (layout !== undefined) {
    result.layout = layout
  }
  const values = readOpValues(row, op, label)
  if (values !== undefined) {
    result.values = values
  }
  return result
}

function readOpKind(row: Record<string, unknown>, label: string): AcfRowOpKind {
  const value = row.op
  if (typeof value !== 'string' || !(ROW_OP_KINDS as readonly string[]).includes(value)) {
    throw new SiteMcpToolError(`'${label}.op' must be one of ${ROW_OP_KINDS.join(', ')}.`)
  }
  return value as AcfRowOpKind
}

function readContainerPath(row: Record<string, unknown>, label: string): string {
  const value = row.path
  if (typeof value !== 'string' || value.length === 0) {
    throw new SiteMcpToolError(`'${label}.path' must be a non-empty path.`)
  }
  const segments = parseAcfPath(value)
  if (hasAcfWildcard(segments)) {
    throw new SiteMcpToolError(
      `'${label}.path' uses a wildcard; wildcards are read-only. Expand it with get_wp_fields first.`
    )
  }
  if (segments.at(-1)?.kind === 'index') {
    throw new SiteMcpToolError(
      `'${label}.path' must name the repeater or flexible field, not one of its rows; put the row number in index.`
    )
  }
  return value
}

// Models routinely send "3" for a JSON-schema integer, and silently truncating a junk value would
// delete or move the wrong row.
function readOptionalRowIndex(
  row: Record<string, unknown>,
  key: string,
  label: string
): number | undefined {
  const value = row[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    return Number.parseInt(value, 10)
  }
  throw new SiteMcpToolError(`'${label}.${key}' must be a 0-based row index.`)
}

function readOpLayout(
  row: Record<string, unknown>,
  op: AcfRowOpKind,
  label: string
): string | undefined {
  const value = row.layout
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (!TAKES_ROW_BODY.includes(op)) {
    throw new SiteMcpToolError(`'${label}.layout' is only used by append and insert.`)
  }
  if (typeof value !== 'string') {
    throw new SiteMcpToolError(`'${label}.layout' must be a layout name.`)
  }
  return value
}

function readOpValues(
  row: Record<string, unknown>,
  op: AcfRowOpKind,
  label: string
): Record<string, unknown> | undefined {
  const value = row.values
  if (value === undefined || value === null) {
    return undefined
  }
  if (!TAKES_ROW_BODY.includes(op)) {
    throw new SiteMcpToolError(`'${label}.values' is only used by append and insert.`)
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new SiteMcpToolError(`'${label}.values' must be an object keyed by sub-field name.`)
  }
  return value as Record<string, unknown>
}
