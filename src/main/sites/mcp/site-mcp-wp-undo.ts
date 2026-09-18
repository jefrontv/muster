// Storing a revert after an apply, and replaying one from its token.
//
// The inline revert is still returned unchanged; the token exists because the session that wrote
// the change is often not the session that wants it back. Before replaying, the roots are
// checksummed against the digests taken right after the write: replaying onto content somebody
// else has edited would quietly discard their work, so drift refuses instead.

import { ACF_FIELDS_PHP, buildAcfPayload, type AcfFieldWrite } from '../wp-acf-payload'
import type { AcfRowOp } from '../wp-acf-row-ops'
import type { AcfTarget } from '../wp-acf-target'
import type { AcfStateRecord, AcfStateStore } from '../wp-acf-state-store'
import { readBoolean, readString, SiteMcpToolError, type ToolArguments } from './site-mcp-arguments'
import type { SiteMcpContext } from './site-mcp-context'
import { resolveMcpSite } from './site-mcp-arguments'
import { fieldResult, runEval } from './site-mcp-wp-eval-run'

export type AcfRevertPayload = {
  target?: unknown
  fields?: unknown[]
  rows?: unknown[]
}

function digestsOf(envelope: Record<string, unknown>): Record<string, string> {
  const value = envelope.digests
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {}
}

function summarise(payload: AcfRevertPayload, target: unknown): string {
  const fields = Array.isArray(payload.fields) ? payload.fields.length : 0
  const rows = Array.isArray(payload.rows) ? payload.rows.length : 0
  const where =
    target !== null && typeof target === 'object'
      ? Object.entries(target as Record<string, unknown>)
          .map(([key, item]) => `${key} ${String(item)}`)
          .join(' ')
      : 'target'
  return `${fields} field${fields === 1 ? '' : 's'}, ${rows} row op${rows === 1 ? '' : 's'} on ${where}`
}

/** Returns the token, or undefined when there is nothing to store or nowhere to store it. */
export function storeAcfRevert(
  store: AcfStateStore | undefined,
  input: {
    envelope: Record<string, unknown>
    transport: Record<string, unknown>
    target: unknown
  }
): string | undefined {
  const revert = input.envelope.revert
  const siteId = input.transport.site_id
  if (!store || typeof siteId !== 'string' || revert === null || typeof revert !== 'object') {
    return undefined
  }
  const payload = revert as AcfRevertPayload
  if (!Array.isArray(payload.fields) && !Array.isArray(payload.rows)) {
    return undefined
  }
  const target = payload.target ?? input.target
  return store.save({
    kind: 'revert',
    site_id: siteId,
    location: input.transport.location === 'remote' ? 'remote' : 'local',
    environment:
      typeof input.transport.environment === 'string' ? input.transport.environment : null,
    target,
    summary: summarise(payload, target),
    digests: digestsOf(input.envelope),
    payload: revert
  }).token
}

function driftedRoots(
  checked: Record<string, unknown>,
  expected: Record<string, string>
): string[] {
  const results = Array.isArray(checked.results) ? checked.results : []
  const seen = new Map<string, unknown>()
  for (const entry of results) {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>
      if (typeof row.path === 'string') {
        seen.set(row.path, row.digest)
      }
    }
  }
  return Object.keys(expected).filter((root) => seen.get(root) !== expected[root])
}

function loadRecord(
  context: SiteMcpContext,
  args: ToolArguments,
  token: string
): {
  store: AcfStateStore
  siteId: string
  record: AcfStateRecord
} {
  const store = context.acfState
  if (!store) {
    throw new SiteMcpToolError('This server keeps no undo records, so a token cannot be replayed.')
  }
  const siteId = resolveMcpSite(context, readString(args, 'site')).id
  const record = store.load(siteId, token)
  if (!record || record.kind !== 'revert') {
    throw new SiteMcpToolError(
      `No revert is stored for token '${token}' on this site. list_wp_reverts shows the tokens that are still held.`
    )
  }
  if (record.consumed) {
    throw new SiteMcpToolError(
      `Revert '${token}' was already replayed at ${record.consumed} (${record.summary}). Read the current values before writing again.`
    )
  }
  return { store, siteId, record }
}

export async function runAcfUndo(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const token = readString(args, 'undo')
  const { store, siteId, record } = loadRecord(context, args, token)
  const apply = readBoolean(args, 'apply')
  const location = record.location
  // The record names the host it was written on; a replay elsewhere would undo the wrong content.
  const evalArgs: ToolArguments = { ...args, env: record.environment ?? args.env }
  const target = record.target as AcfTarget
  const payload = record.payload as AcfRevertPayload
  const roots = Object.keys(record.digests)

  if (roots.length > 0) {
    const transport = await runEval(
      context,
      evalArgs,
      location,
      'Check ACF drift',
      ACF_FIELDS_PHP,
      buildAcfPayload({ mode: 'checksum', target, fields: roots })
    )
    if (transport.blocked === true) {
      return transport
    }
    const drifted = driftedRoots(fieldResult(transport), record.digests)
    if (drifted.length > 0) {
      throw new SiteMcpToolError(
        `${drifted.join(', ')} changed since revert '${token}' was stored, so replaying it would discard that change. Read the current values and write them yourself.`,
        { token, drifted, summary: record.summary }
      )
    }
  }

  type Half = { result: Record<string, unknown>; transport: Record<string, unknown> } | null

  const half = async (kind: 'rows' | 'fields', entries: unknown[]): Promise<Half> => {
    if (entries.length === 0) {
      return null
    }
    const transport = await runEval(
      context,
      evalArgs,
      location,
      `Replay ACF ${kind}`,
      ACF_FIELDS_PHP,
      buildAcfPayload({
        mode: apply ? 'apply' : 'preview',
        target,
        fields: kind === 'fields' ? (entries as AcfFieldWrite[]) : [],
        ...(kind === 'rows' ? { rows: entries as readonly AcfRowOp[] } : {})
      })
    )
    return { result: transport.blocked === true ? transport : fieldResult(transport), transport }
  }

  // Rows first: a row op moves the indexes a field path uses, so fields must land afterwards.
  const rowsRun = await half('rows', Array.isArray(payload.rows) ? payload.rows : [])
  const rowsFailed = rowsRun !== null && rowsRun.result.ok !== true
  const fieldsRun =
    apply && rowsFailed
      ? null
      : await half('fields', Array.isArray(payload.fields) ? payload.fields : [])
  const ok = (rowsRun?.result.ok ?? true) === true && (fieldsRun?.result.ok ?? true) === true
  const consumed = apply && ok
  if (consumed) {
    store.markConsumed(siteId, token)
  }
  // An undo is itself a write, so each applied half gets its own token: that is the redo path.
  const tokens: Record<string, string> = {}
  if (apply) {
    for (const [kind, run] of [
      ['rows', rowsRun],
      ['fields', fieldsRun]
    ] as const) {
      const stored =
        run && run.result.ok === true
          ? storeAcfRevert(store, { envelope: run.result, transport: run.transport, target })
          : undefined
      if (stored !== undefined) {
        tokens[kind] = stored
      }
    }
  }
  return {
    ok,
    undo: token,
    apply,
    consumed,
    location,
    environment: record.environment,
    summary: record.summary,
    drift_checked: roots,
    rows: rowsRun?.result ?? null,
    fields: fieldsRun?.result ?? null,
    ...(Object.keys(tokens).length > 0 ? { revert_tokens: tokens } : {}),
    ...(apply && rowsFailed
      ? { warnings: ['the rows half failed, so the fields half was not replayed'] }
      : {})
  }
}
