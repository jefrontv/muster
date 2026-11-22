// upload_files / download_files: move files between the local checkout and a site's remote host
// over the same SSH session the import and deploy pipelines use.
//
// Why these exist as their own tools rather than leaving agents to shell out: `run_ssh_command`
// can reach the host but has no way to carry bytes, so the only alternatives were base64 through a
// command line (fragile past a few KB, and it lands in shell history) or a `scp` the stored
// credential cannot authenticate.
//
// The safety model is the RUN model, unchanged: the environment is resolved from the checked-out
// branch exactly as a deploy resolves it, and a branch matching no environment REFUSES rather than
// silently falling back onto what is usually production. That applies to downloads too — reading
// the wrong host's files is its own kind of wrong answer.
//
// Every upload is verified by checksum. A transfer that reports success while writing truncated
// bytes is worse than one that fails, because the next thing to notice is production.

import { stat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import type { Site } from '../../../shared/site-types'
import { hashLocalFileSha256 } from '../file-sha256'
import { quoteShellArgument, type SiteSshSession } from '../pipeline-contract'
import { buildSiteRunConfig } from '../site-run-config'
import { buildSiteToolPlan, canStartRun } from '../site-run-plan'
import {
  readBoolean,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { createTransferProgressReporter, withProgressHeartbeat } from './site-mcp-progress'
import { CONFIRM_PROPERTY, ENV_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

/** Enough for a plugin directory's worth of files, short of a request that runs for an hour. */
const MAX_FILES_PER_CALL = 50

/** Per-file ceiling. A database or a media library belongs in the import pipeline, not here. */
const MAX_FILE_BYTES = 100 * 1024 * 1024

const REMOTE_HASH_TIMEOUT_MS = 60_000

type TransferPair = { local: string; remote: string }

function readPairs(args: ToolArguments, localKey: 'local', remoteKey: 'remote'): TransferPair[] {
  const raw = args.files
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new SiteMcpToolError('files must be a non-empty array.')
  }
  if (raw.length > MAX_FILES_PER_CALL) {
    throw new SiteMcpToolError(`files may list at most ${MAX_FILES_PER_CALL} entries per call.`)
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new SiteMcpToolError(`files[${index}] must be an object.`)
    }
    const row = entry as Record<string, unknown>
    const local = typeof row[localKey] === 'string' ? (row[localKey] as string).trim() : ''
    const remote = typeof row[remoteKey] === 'string' ? (row[remoteKey] as string).trim() : ''
    if (local.length === 0 || remote.length === 0) {
      throw new SiteMcpToolError(`files[${index}] needs both '${localKey}' and '${remoteKey}'.`)
    }
    // Why absolute only: a relative remote path resolves against whatever directory the SSH user
    // happens to land in, which is not something the caller can see or rely on.
    if (!remote.startsWith('/')) {
      throw new SiteMcpToolError(`files[${index}].remote must be an absolute path.`)
    }
    if (!isAbsolute(local)) {
      throw new SiteMcpToolError(`files[${index}].local must be an absolute path.`)
    }
    return { local, remote }
  })
}

/**
 * The remote file's SHA-256, or null when the host has no usable digest tool.
 *
 * Null is not a failure: the transfer still happened, and saying "unverified" is more honest than
 * failing a good upload because a minimal container lacks coreutils.
 */
async function remoteSha256(session: SiteSshSession, remotePath: string): Promise<string | null> {
  const quoted = quoteShellArgument(remotePath)
  // shasum is the fallback for hosts without coreutils (older macOS, some BSD images).
  const result = await session.exec(
    `sha256sum ${quoted} 2>/dev/null || shasum -a 256 ${quoted} 2>/dev/null`,
    { timeoutMs: REMOTE_HASH_TIMEOUT_MS }
  )
  const digest = result.stdout.trim().split(/\s+/)[0] ?? ''
  return /^[0-9a-f]{64}$/.test(digest) ? digest : null
}

async function remoteExists(session: SiteSshSession, remotePath: string): Promise<boolean> {
  const result = await session.exec(`test -e ${quoteShellArgument(remotePath)}`)
  return result.code === 0
}

/**
 * Resolves the site and environment under the run guard, or explains the refusal.
 *
 * Shared by both tools so an upload and a download can never disagree about which host they are
 * pointed at.
 */
async function resolveTarget(
  context: SiteMcpContext,
  args: ToolArguments,
  action: string
): Promise<
  { ok: true; site: Site; environment: string } | { ok: false; blocked: Record<string, unknown> }
> {
  const site = resolveMcpSite(context, readString(args, 'site'))
  const requested = readString(args, 'env')
  if (requested.length > 0 && !Object.hasOwn(site.environments, requested)) {
    throw new SiteMcpToolError(`Environment '${requested}' not found for this site.`, {
      available_environments: Object.keys(site.environments)
    })
  }
  const summary = await context.summarize(site)
  const plan = buildSiteToolPlan({
    site,
    group: 'deploy',
    step: { key: 'file-transfer', label: action, remote: true },
    branch: summary.branch,
    requestedEnvironment: requested.length > 0 ? requested : null,
    hasSshSecret: (environment) => context.hasSshSecret(site.id, environment),
    pathExists: summary.pathExists
  })
  if (!canStartRun(plan, readBoolean(args, 'confirm')) || !plan.environment) {
    return {
      ok: false,
      blocked: {
        ok: false,
        blocked: true,
        needs_confirmation: plan.confirmable,
        site: site.displayName,
        site_id: site.id,
        current_branch: summary.branch ?? '',
        resolved_environment: plan.environment,
        blocked_by: plan.blockedBy,
        message: plan.blockedBy.includes('missing-ssh-credentials')
          ? `No SSH password is stored for '${plan.environment ?? '(none)'}'. Set it in Muster or turn on 'Use SSH key' for this environment; confirm=true does not override it.`
          : plan.blockedBy.includes('unmatched-branch')
            ? `Branch '${summary.branch ?? '(none)'}' matches no environment, so this would target '${plan.environment}' by fallback (which may be production). Re-call with env='${plan.environment}' to target it explicitly, or confirm=true to accept the fallback.`
            : 'This site has no environment to transfer files to.'
      }
    }
  }
  return { ok: true, site, environment: plan.environment }
}

async function uploadFiles(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const pairs = readPairs(args, 'local', 'remote')
  const target = await resolveTarget(context, args, 'Upload files')
  if (!target.ok) {
    return target.blocked
  }
  const makeParents = readBoolean(args, 'mkdir', true)
  const overwrite = readBoolean(args, 'overwrite')
  const mode = readString(args, 'mode').trim()

  const config = await buildSiteRunConfig(target.site, target.environment, 'deploy')
  return withProgressHeartbeat(context, `Uploading ${pairs.length} file(s)`, async () => {
    const controller = new AbortController()
    const session = await context.openSshSession(config, controller.signal)
    const files: Record<string, unknown>[] = []
    try {
      for (const pair of pairs) {
        const info = await stat(pair.local).catch(() => null)
        if (!info?.isFile()) {
          files.push({
            remote: pair.remote,
            ok: false,
            error: `Not a readable file: ${pair.local}`
          })
          continue
        }
        if (info.size > MAX_FILE_BYTES) {
          files.push({
            remote: pair.remote,
            ok: false,
            error: `File is ${info.size} bytes, over the ${MAX_FILE_BYTES}-byte limit for this tool.`
          })
          continue
        }
        if (!overwrite && (await remoteExists(session, pair.remote))) {
          files.push({
            remote: pair.remote,
            ok: false,
            error: 'Remote path already exists. Pass overwrite=true to replace it.'
          })
          continue
        }
        if (makeParents) {
          // dirname on the remote, not locally: the separator belongs to the remote host.
          await session.exec(`mkdir -p "$(dirname ${quoteShellArgument(pair.remote)})"`)
        }
        const onProgress = createTransferProgressReporter(
          context,
          `Uploading ${basename(pair.local)}`
        )
        await session.upload(pair.local, pair.remote, onProgress)
        if (mode.length > 0) {
          await session.exec(`chmod ${quoteShellArgument(mode)} ${quoteShellArgument(pair.remote)}`)
        }
        const localDigest = await hashLocalFileSha256(pair.local)
        const expected = localDigest?.sha256 ?? null
        const actual = await remoteSha256(session, pair.remote)
        const verified = expected === null || actual === null ? null : actual === expected
        files.push({
          remote: pair.remote,
          local: pair.local,
          ok: verified !== false,
          bytes: info.size,
          sha256: expected,
          verified,
          ...(verified === false
            ? { error: 'Checksum mismatch — the remote copy does not match the local file.' }
            : {})
        })
      }
      return {
        ok: files.every((file) => file.ok === true),
        site: target.site.displayName,
        site_id: target.site.id,
        environment: target.environment,
        host: `${config.environment.username}@${config.environment.hostname}`,
        files
      }
    } finally {
      await session.close().catch(() => undefined)
    }
  })
}

async function downloadFiles(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const pairs = readPairs(args, 'local', 'remote')
  const target = await resolveTarget(context, args, 'Download files')
  if (!target.ok) {
    return target.blocked
  }

  const config = await buildSiteRunConfig(target.site, target.environment, 'import')
  return withProgressHeartbeat(context, `Downloading ${pairs.length} file(s)`, async () => {
    const controller = new AbortController()
    const session = await context.openSshSession(config, controller.signal)
    const files: Record<string, unknown>[] = []
    try {
      for (const pair of pairs) {
        if (!(await remoteExists(session, pair.remote))) {
          files.push({ remote: pair.remote, ok: false, error: 'No such file on the remote host.' })
          continue
        }
        const expected = await remoteSha256(session, pair.remote)
        const onProgress = createTransferProgressReporter(
          context,
          `Downloading ${basename(pair.remote)}`
        )
        await session.download(pair.remote, pair.local, onProgress)
        const localDigest = await hashLocalFileSha256(pair.local)
        const actual = localDigest?.sha256 ?? null
        files.push({
          remote: pair.remote,
          local: pair.local,
          ok: localDigest !== null && (expected === null || actual === expected),
          bytes: localDigest?.bytes ?? 0,
          sha256: actual,
          verified: expected === null || actual === null ? null : actual === expected,
          ...(localDigest === null
            ? { error: 'The local copy could not be read back after the transfer.' }
            : expected !== null && actual !== expected
              ? { error: 'Checksum mismatch — the local copy does not match the remote file.' }
              : {})
        })
      }
      return {
        ok: files.every((file) => file.ok === true),
        site: target.site.displayName,
        site_id: target.site.id,
        environment: target.environment,
        host: `${config.environment.username}@${config.environment.hostname}`,
        files
      }
    } finally {
      await session.close().catch(() => undefined)
    }
  })
}

const FILES_PROPERTY = {
  type: 'array',
  description: 'Pairs to transfer (both paths must be absolute).',
  items: {
    type: 'object',
    properties: {
      local: { type: 'string', description: 'Absolute local path.' },
      remote: { type: 'string', description: 'Absolute remote path.' }
    },
    required: ['local', 'remote'],
    additionalProperties: false
  }
}

export const SITE_MCP_TRANSFER_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'upload_files',
    description:
      'Upload local files over stored SSH credentials and verify each by SHA-256 (max 50 files, 100 MB each). Refuses overwrite unless overwrite=true; unmatched branch refuses unless env= or confirm=true.',
    inputSchema: objectSchema(
      {
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        files: FILES_PROPERTY,
        mkdir: {
          type: 'boolean',
          description: 'Create missing remote parent dirs (default true).'
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite existing remote files (default false).'
        },
        mode: { type: 'string', description: 'Optional chmod after upload, e.g. "0644".' },
        ...CONFIRM_PROPERTY
      },
      ['files']
    ),
    concurrent: true,
    run: uploadFiles
  },
  {
    name: 'download_files',
    description:
      'Download remote files over stored SSH credentials and verify each by SHA-256 (max 50 files). Unmatched branch refuses unless env= or confirm=true.',
    inputSchema: objectSchema(
      { ...SITE_PROPERTY, ...ENV_PROPERTY, files: FILES_PROPERTY, ...CONFIRM_PROPERTY },
      ['files']
    ),
    concurrent: true,
    run: downloadFiles
  }
]
