// list_wp_reverts / snapshot_wp_fields / restore_wp_fields.
//
// A snapshot of a whole page is far too large for the stdout ceiling, so the walker writes it beside
// its payload and Muster collects the file. The values live in a token-addressed record rather than
// in the response, because an agent that has to carry a megabyte of JSON between calls will not.

import { ACF_FIELDS_PHP, buildAcfPayload, parseAcfPath } from '../wp-acf-payload'
import { readAcfTarget, type AcfTarget } from '../wp-acf-target'
import { WP_EVAL_RESTORE_SIDECAR_MAX_BYTES } from '../wp-eval-file'
import type { AcfStateStore } from '../wp-acf-state-store'
import {
  readBoolean,
  readLocation,
  readNumber,
  readRequiredString,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import {
  CONFIRM_PROPERTY,
  ENV_PROPERTY,
  LIMIT_PROPERTY,
  LOCATION_PROPERTY,
  objectSchema,
  SITE_PROPERTY,
  TARGET_PROPERTY
} from './site-mcp-schemas'
import { fieldResult, runEval } from './site-mcp-wp-eval-run'

function requireStore(context: SiteMcpContext): AcfStateStore {
  const store = context.acfState
  if (!store) {
    throw new SiteMcpToolError('This server keeps no snapshot or revert records.')
  }
  return store
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

// A snapshot restores whole roots through update_field, so half a root is not a thing to capture.
function readRootNames(args: ToolArguments): string[] {
  const value = args.fields
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new SiteMcpToolError("'fields' must be an array of root field names.")
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new SiteMcpToolError(`'fields[${index}]' must be a root field name.`)
    }
    const segments = parseAcfPath(entry)
    if (segments.length !== 1) {
      throw new SiteMcpToolError(
        `'fields[${index}]' must be a root field name, not the path '${entry}'; a snapshot captures whole roots.`
      )
    }
    return entry
  })
}

async function listWpReverts(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const store = requireStore(context)
  const site = resolveMcpSite(context, readString(args, 'site'))
  const limit = readNumber(args, 'limit', 20, 200) || 20
  const reverts = store.list(site.id, 'revert', limit)
  return {
    ok: true,
    site: site.displayName,
    count: reverts.length,
    reverts: reverts.map((record) => ({
      token: record.token,
      target: record.target,
      location: record.location,
      environment: record.environment,
      when: record.when,
      summary: record.summary,
      consumed: Boolean(record.consumed)
    }))
  }
}

async function snapshotWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const store = requireStore(context)
  const target = readAcfTarget(args)
  const sidecar = buildAcfPayload({ mode: 'snapshot', target, fields: readRootNames(args) })
  const transport = await runEval(
    context,
    args,
    readLocation(args),
    'Snapshot ACF fields',
    ACF_FIELDS_PHP,
    sidecar,
    [],
    { collectOutputFile: true }
  )
  if (transport.blocked === true) {
    return transport
  }
  const envelope = fieldResult(transport)
  const contents = transport.output_file_contents
  if (typeof contents !== 'string') {
    const bytes = envelope.bytes
    // The walker says it wrote one, so the file exists and the copy back is what failed.
    if (envelope.snapshot === true && typeof bytes === 'number' && bytes > 0) {
      throw new SiteMcpToolError(
        'The walker wrote the snapshot file but Muster could not collect it from the host, so there is nothing to store.',
        { output_file: envelope.output_file, bytes }
      )
    }
    throw new SiteMcpToolError(
      'The walker ran but wrote no snapshot file, so there is nothing to store.',
      { envelope }
    )
  }
  const digests = asRecord(envelope.digests) as Record<string, string>
  const paths = Object.keys(digests)
  const record = store.save({
    kind: 'snapshot',
    site_id: String(transport.site_id ?? ''),
    location: transport.location === 'remote' ? 'remote' : 'local',
    environment: typeof transport.environment === 'string' ? transport.environment : null,
    target,
    summary: `${paths.length} root${paths.length === 1 ? '' : 's'}`,
    digests,
    payload: JSON.parse(contents)
  })
  return {
    ok: envelope.ok === true,
    token: record.token,
    target,
    paths,
    when: record.when,
    digest: envelope.target_digest ?? null,
    bytes: envelope.bytes ?? null,
    location: record.location,
    environment: record.environment,
    site: envelope.site,
    warnings: envelope.warnings ?? []
  }
}

async function restoreWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const store = requireStore(context)
  const site = resolveMcpSite(context, readString(args, 'site'))
  const token = readRequiredString(args, 'token')
  const record = store.load(site.id, token)
  if (!record || record.kind !== 'snapshot') {
    throw new SiteMcpToolError(`No snapshot is stored for token '${token}' on this site.`)
  }
  const apply = readBoolean(args, 'apply')
  const override = readString(args, 'location')
  if (override.length > 0 && override !== 'local' && override !== 'remote') {
    throw new SiteMcpToolError("'location' must be 'local' or 'remote'.")
  }
  const location = override.length > 0 ? (override as 'local' | 'remote') : record.location
  const requestedEnv = readString(args, 'env')
  // Same host as the snapshot means its environment; a different env there was silently ignored.
  if (
    location === record.location &&
    requestedEnv.length > 0 &&
    record.environment !== null &&
    requestedEnv !== record.environment
  ) {
    throw new SiteMcpToolError(
      `Snapshot '${token}' was taken on '${record.environment}', not '${requestedEnv}'. Omit env to restore where it came from; restoring onto another environment needs location as well.`
    )
  }
  const runEnv = location === record.location ? (record.environment ?? args.env) : args.env
  // The record holds the walker's whole output file; only its roots half goes back.
  const roots = asRecord(asRecord(record.payload).roots)
  if (Object.keys(roots).length === 0) {
    throw new SiteMcpToolError(`Snapshot '${token}' holds no roots to restore.`)
  }
  // A restore overwrites whole roots and drops rows past the snapshot's count, so take the way
  // back first. No save point, no write.
  let preRestoreToken: string | null = null
  if (apply) {
    const before = await snapshotWpFields(context, {
      site: site.id,
      location,
      target: record.target,
      fields: Object.keys(roots),
      ...(typeof runEnv === 'string' && runEnv.length > 0 ? { env: runEnv } : {}),
      ...(readBoolean(args, 'confirm') ? { confirm: true } : {})
    })
    if (before.blocked === true) {
      return before
    }
    preRestoreToken = typeof before.token === 'string' ? before.token : null
    if (!preRestoreToken) {
      throw new SiteMcpToolError(
        'Could not snapshot the current values before restoring, so nothing was written.',
        { snapshot: before }
      )
    }
  }
  const sidecar = buildAcfPayload({
    mode: 'restore',
    target: record.target as AcfTarget,
    fields: [],
    roots,
    applyFlag: apply
  })
  const transport = await runEval(
    context,
    { ...args, env: runEnv },
    location,
    'Restore ACF fields',
    ACF_FIELDS_PHP,
    sidecar,
    [],
    { maxSidecarBytes: WP_EVAL_RESTORE_SIDECAR_MAX_BYTES }
  )
  if (transport.blocked === true) {
    return transport
  }
  return {
    ...fieldResult(transport),
    snapshot: token,
    apply,
    ...(preRestoreToken ? { pre_restore_token: preRestoreToken } : {}),
    taken: record.when,
    snapshot_location: record.location,
    snapshot_digests: record.digests
  }
}

export const SITE_MCP_WP_SNAPSHOT_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'list_wp_reverts',
    description:
      'List the ACF revert tokens Muster still holds for a site, newest first. Every update_wp_fields apply stores one; the newest 20 per site are kept for 24 hours. Each entry carries token, target, location, environment, when, summary and consumed. Replay one with update_wp_fields undo=<token>.',
    inputSchema: objectSchema({ ...SITE_PROPERTY, ...LIMIT_PROPERTY }, []),
    run: listWpReverts
  },
  {
    name: 'snapshot_wp_fields',
    description:
      'Capture every ACF root on a target, or only the roots named in fields, and store it under a token. Values travel as a file rather than in the response, so a 260-row page is not subject to the output ceiling; the response carries the token, the root names, a digest per root and one for the whole target. The newest 10 snapshots per site are kept for 7 days. Restore one with restore_wp_fields. This reads only; it writes nothing to WordPress.',
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Root field names to capture, e.g. ["modules"]. A dotted path is refused because a snapshot captures whole roots. Omit it to capture every usable root on the target.'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'target']
    ),
    run: snapshotWpFields
  },
  {
    name: 'restore_wp_fields',
    description:
      "Write a stored snapshot back. apply defaults to false: a preview reports per root whether it would change, the row count before and after, and the digest before and after, without writing. apply=true writes each root through update_field, which rebuilds the rows and drops any beyond the snapshot's count, then verifies each root's digest against the snapshot and reports applied per root. Before it writes, apply=true snapshots the same roots where it is about to write and returns that as pre_restore_token; restore it to undo. No values come back either way. A root that cannot be resolved means nothing is written, and a preview says which one. Values never go through raw meta: add_post_meta unslashes serialized values and is not a safe route. location defaults to the host the snapshot came from, and env must then match the snapshot's environment or be omitted; overriding location restores across hosts, which needs the same post ID on both sides.",
    inputSchema: objectSchema(
      {
        token: {
          type: 'string',
          description: 'Snapshot token from snapshot_wp_fields.'
        },
        apply: {
          type: 'boolean',
          description: 'Default false = preview. true writes every root through update_field.'
        },
        location: {
          type: 'string',
          enum: ['local', 'remote'],
          description:
            'Override the host to restore onto. Omitted means the one the snapshot was taken from.'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['token']
    ),
    run: restoreWpFields
  }
]
