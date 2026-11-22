// Response serialization and size guard for the Muster site MCP surface.
//
// Tool results travel inline as compact JSON when small; anything above the client-safe ceiling
// spills to a 0600 file in tmpdir and returns a compact summary envelope with pointers.

import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const SITE_MCP_MAX_INLINE_BYTES = 48 * 1024
export const SITE_MCP_SPILL_DIR = join(tmpdir(), 'muster-mcp-results')
export const SITE_MCP_SPILL_TTL_MS = 24 * 60 * 60 * 1000
export const SITE_MCP_SPILL_PREVIEW_CHARS = 4_000

const MAX_PRESERVED_STRING_CHARS = 500
const MAX_PRESERVED_WARNINGS = 10
const MAX_PRESERVED_WARNING_CHARS = 240

const PRESERVED_SCALAR_KEYS: readonly string[] = [
  'ok',
  'error',
  'site',
  'site_id',
  'location',
  'environment',
  'host',
  'wp_root',
  'exit_code',
  'blocked',
  'run_id',
  'job_id',
  'status',
  'count',
  'differs_count',
  'apply',
  'describe',
  'revert_token',
  'token',
  'output_truncated',
  'truncated_earlier',
  'first_error_index'
]

/** MCP's tool result shape. `isError` keeps a failure inside the conversation instead of the protocol. */
export type SiteMcpToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: true
}

export type ResponseGuardOptions = {
  maxInlineBytes?: number
  spillDir?: string
  nowMs?: number
}

function safeFileSegment(value: string): string {
  const cleaned = value.replaceAll(/[^A-Za-z0-9._-]+/g, '-').replaceAll(/^[-.]+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'tool'
}

function pruneStaleSpillFiles(spillDir: string, nowMs: number): void {
  try {
    for (const entry of readdirSync(spillDir)) {
      const entryPath = join(spillDir, entry)
      try {
        const stats = statSync(entryPath)
        if (stats.isFile() && nowMs - stats.mtimeMs > SITE_MCP_SPILL_TTL_MS) {
          unlinkSync(entryPath)
        }
      } catch {
        continue
      }
    }
  } catch {
    // Best-effort sweep: a race or unwritable temp entry must never fail the current tool result.
  }
}

function extractPreservedMetadata(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return {}
  }
  const source = payload as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of PRESERVED_SCALAR_KEYS) {
    if (!Object.hasOwn(source, key)) {
      continue
    }
    const value = source[key]
    if (typeof value === 'string') {
      out[key] =
        value.length > MAX_PRESERVED_STRING_CHARS
          ? `${value.slice(0, MAX_PRESERVED_STRING_CHARS)}…`
          : value
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value
    }
  }
  if (Array.isArray(source.blocked_by)) {
    out.blocked_by = source.blocked_by
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 10)
      .map((item) => item.slice(0, 100))
  }
  if (Array.isArray(source.warnings)) {
    out.warnings = source.warnings
      .filter((item): item is string => typeof item === 'string')
      .slice(0, MAX_PRESERVED_WARNINGS)
      .map((item) =>
        item.length > MAX_PRESERVED_WARNING_CHARS
          ? `${item.slice(0, MAX_PRESERVED_WARNING_CHARS)}…`
          : item
      )
  }
  return out
}

function writeSpillFile(
  spillDir: string,
  toolName: string,
  text: string,
  nowMs: number
): { filePath: string | null; error: string | null } {
  try {
    mkdirSync(spillDir, { recursive: true, mode: 0o700 })
    pruneStaleSpillFiles(spillDir, nowMs)
    const filePath = join(spillDir, `${safeFileSegment(toolName)}-${randomUUID()}.json`)
    writeFileSync(filePath, text, { encoding: 'utf8', mode: 0o600 })
    return { filePath, error: null }
  } catch (error) {
    return { filePath: null, error: error instanceof Error ? error.message : String(error) }
  }
}

function buildBoundedSummary(
  metadata: Record<string, unknown>,
  text: string,
  totalBytes: number,
  maxInlineBytes: number,
  spill: { filePath: string | null; error: string | null }
): string {
  const hint =
    'Result exceeded inline size limit; full JSON saved to output_file. Inspect that file or narrow the call (fewer fields, return="values", layout_filter, max_value_chars, offset/limit, or smaller max_lines/max_bytes).'
  const base = {
    ...metadata,
    truncated: true,
    output_file: spill.filePath,
    total_bytes: totalBytes,
    inline_limit_bytes: maxInlineBytes,
    ...(spill.error ? { spill_error: spill.error } : {}),
    hint
  }
  let previewChars = Math.min(text.length, SITE_MCP_SPILL_PREVIEW_CHARS)
  let encoded = JSON.stringify({ ...base, preview: text.slice(0, previewChars) })
  // Shrink preview when inline budget or preserved metadata is tight so the summary itself never exceeds the limit.
  while (Buffer.byteLength(encoded, 'utf8') > maxInlineBytes && previewChars > 0) {
    const excess = Buffer.byteLength(encoded, 'utf8') - maxInlineBytes
    previewChars = Math.max(0, previewChars - Math.max(excess, 64))
    encoded = JSON.stringify({ ...base, preview: text.slice(0, previewChars) })
  }
  return encoded
}

export function formatSiteMcpToolResult(
  toolName: string,
  payload: unknown,
  isError: boolean,
  options: ResponseGuardOptions = {}
): SiteMcpToolResult {
  const text = JSON.stringify(payload) ?? 'null'
  const totalBytes = Buffer.byteLength(text, 'utf8')
  const maxInlineBytes = options.maxInlineBytes ?? SITE_MCP_MAX_INLINE_BYTES
  if (totalBytes <= maxInlineBytes) {
    const content = [{ type: 'text' as const, text }]
    return isError ? { content, isError: true } : { content }
  }
  const spill = writeSpillFile(
    options.spillDir ?? SITE_MCP_SPILL_DIR,
    toolName,
    text,
    options.nowMs ?? Date.now()
  )
  const summaryText = buildBoundedSummary(
    extractPreservedMetadata(payload),
    text,
    totalBytes,
    maxInlineBytes,
    spill
  )
  const content = [{ type: 'text' as const, text: summaryText }]
  return isError ? { content, isError: true } : { content }
}
