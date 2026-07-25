// Argument coercion and site lookup for the MCP tool surface.
//
// Agent-supplied arguments are untrusted and weakly typed — a model will send "true", 25.0, null,
// or nothing at all for the same parameter. Every reader coerces to a definite value or throws
// SiteMcpToolError, which the dispatcher renders as an `isError` tool result. A tool must never
// throw an unhandled exception: that would kill the stdio server for every subsequent call.

import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import type { Site } from '../../../shared/site-types'
import type { SiteMcpContext } from './site-mcp-context'

const MAX_STRING_LENGTH = 4_096
/** Enough to walk out of a deep monorepo checkout without ever looping on a malformed path. */
const MAX_PARENT_WALK = 40

export class SiteMcpToolError extends Error {
  readonly details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'SiteMcpToolError'
    this.details = details
  }
}

export type ToolArguments = Record<string, unknown>

export function readString(args: ToolArguments, key: string, fallback = ''): string {
  const value = args[key]
  if (value === undefined || value === null) {
    return fallback
  }
  if (typeof value !== 'string') {
    throw new SiteMcpToolError(`'${key}' must be a string.`)
  }
  if (value.length > MAX_STRING_LENGTH) {
    throw new SiteMcpToolError(`'${key}' exceeds ${MAX_STRING_LENGTH} characters.`)
  }
  return value.trim()
}

export function readRequiredString(args: ToolArguments, key: string): string {
  const value = readString(args, key)
  if (value.length === 0) {
    throw new SiteMcpToolError(`'${key}' is required.`)
  }
  return value
}

// Why coerce the strings: models routinely send "true"/"false" for JSON-schema booleans, and
// silently treating "false" as truthy would turn a refusal into an unconfirmed production deploy.
export function readBoolean(args: ToolArguments, key: string, fallback = false): boolean {
  const value = args[key]
  if (value === undefined || value === null) {
    return fallback
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true' || value === 'false') {
    return value === 'true'
  }
  throw new SiteMcpToolError(`'${key}' must be a boolean.`)
}

export function readNumber(
  args: ToolArguments,
  key: string,
  fallback: number,
  max: number
): number {
  const value = args[key]
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new SiteMcpToolError(`'${key}' must be a number.`)
  }
  return Math.min(Math.max(Math.trunc(parsed), 0), max)
}

export function readRecord(args: ToolArguments, key: string): Record<string, unknown> {
  const value = args[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SiteMcpToolError(`'${key}' must be a non-empty object.`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).length === 0) {
    throw new SiteMcpToolError(`'${key}' must be a non-empty object.`)
  }
  return record
}

export function readRunGroup(args: ToolArguments, key: string): 'import' | 'deploy' {
  const value = readString(args, key, 'import')
  if (value !== 'import' && value !== 'deploy') {
    throw new SiteMcpToolError(`'${key}' must be 'import' or 'deploy'.`)
  }
  return value
}

/**
 * ocsites' `_find_site`. An omitted selector means "the site I am working in", which is the whole
 * point of an in-app MCP server: the agent editing a theme deploys that theme's site. cwd is
 * matched by walking up, because the agent's cwd is usually a subdirectory of the checkout.
 */
export function resolveMcpSite(context: SiteMcpContext, selector: string): Site {
  if (selector.length === 0) {
    return resolveSiteFromCwd(context)
  }
  const byId = context.store.getSite(selector)
  if (byId) {
    return byId
  }
  const byPath = context.store.findSiteByPath(selector)
  if (byPath) {
    return byPath
  }
  return resolveSiteByName(context, selector)
}

function resolveSiteFromCwd(context: SiteMcpContext): Site {
  let current = context.cwd
  for (let depth = 0; depth < MAX_PARENT_WALK && current.length > 0; depth += 1) {
    const match = context.store.findSiteByPath(current)
    if (match) {
      return match
    }
    const parent = current.slice(0, Math.max(0, lastSeparatorIndex(current)))
    if (parent === current || parent.length === 0) {
      break
    }
    current = parent
  }
  throw new SiteMcpToolError(
    `No site is configured for the current directory (${context.cwd}). Pass site= with a site name or path.`,
    { cwd: context.cwd }
  )
}

// Both separators, because a Windows renderer can hand main a path with either.
function lastSeparatorIndex(value: string): number {
  return Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
}

function resolveSiteByName(context: SiteMcpContext, selector: string): Site {
  const needle = selector.toLowerCase()
  const comparablePath = normalizeRuntimePathForComparison(selector)
  const sites = context.store.listSites()
  const exact = sites.filter((site) => site.displayName.toLowerCase() === needle)
  const partial = sites.filter(
    (site) =>
      site.displayName.toLowerCase().includes(needle) ||
      normalizeRuntimePathForComparison(site.path).includes(comparablePath)
  )
  // An exact name match never degrades to a substring match — two sites named 'acme' should
  // report an ambiguity, not silently widen the search and pick a third.
  const candidates = exact.length > 0 ? exact : partial
  const [only] = candidates
  if (only && candidates.length === 1) {
    return only
  }
  if (candidates.length === 0) {
    throw new SiteMcpToolError(`No site matches '${selector}'.`)
  }
  throw new SiteMcpToolError(
    `'${selector}' matches ${candidates.length} sites; be more specific.`,
    {
      matches: candidates.slice(0, 10).map((site) => ({ name: site.displayName, path: site.path }))
    }
  )
}
