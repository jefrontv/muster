// Muster path → agent-local site. `/resolve` first, then `GET /sites` by path, then leftover slug.

import path from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import {
  createAgentLocalHost,
  requestWithDaemon,
  type AgentLocalHost,
  type AgentLocalResponse
} from './agent-local-host'
import type { LocalStackSiteRef } from './local-stack-provider'

export type AgentLocalSiteMatch = {
  slug: string
  wpDir: string
  workDir: string
  domain: string
  phpVersion: string
  running: boolean
}

export type AgentLocalResolveOptions = { host?: AgentLocalHost }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' ? value : ''
}

/** Trailing-separator-safe containment, so `/sites/app` never matches `/sites/appendix`. */
function isAtOrUnder(candidate: string, ancestor: string): boolean {
  const normalizedCandidate = normalizeRuntimePathForComparison(candidate)
  const normalizedAncestor = normalizeRuntimePathForComparison(ancestor)
  if (normalizedCandidate === normalizedAncestor) {
    return true
  }
  const relative = path.relative(normalizedAncestor, normalizedCandidate)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function toSiteMatch(record: Record<string, unknown>): AgentLocalSiteMatch | null {
  const slug = readString(record, 'slug')
  if (slug.length === 0) {
    return null
  }
  return {
    slug,
    wpDir: readString(record, 'wp_dir'),
    workDir: readString(record, 'work_dir'),
    domain: readString(record, 'domain'),
    phpVersion: readString(record, 'php_version'),
    running: readString(record, 'state') === 'running' || record.running === true
  }
}

function matchFromResolvePayload(data: unknown): AgentLocalSiteMatch | null {
  const record = asRecord(data)
  const nested = asRecord(record?.site)
  const match = (nested ? toSiteMatch(nested) : null) ?? (record ? toSiteMatch(record) : null)
  if (!match || !record) {
    return match
  }
  return record.running === true ? { ...match, running: true } : match
}

function expectedSlug(sitePath: string): string {
  return (sitePath.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? '').toLowerCase()
}

function coversSitePath(entry: AgentLocalSiteMatch, sitePath: string): boolean {
  return (
    (entry.wpDir.length > 0 && isAtOrUnder(entry.wpDir, sitePath)) ||
    (entry.workDir.length > 0 && isAtOrUnder(entry.workDir, sitePath))
  )
}

/**
 * Guard against the daemon's greedy work_dir matching. A site registered with a work_dir that is
 * a PARENT of many checkouts (e.g. /Users/x/Sites itself) makes `GET /resolve` claim every sibling
 * folder, so a blind trust starts/credentials/adopts the wrong site. Trust the answer only when
 * its docroot and the requested path actually nest — either direction; work_dir deliberately does
 * not count for the inside-direction, it is exactly the field that over-matches.
 */
function resolveAnswerNests(match: AgentLocalSiteMatch, sitePath: string): boolean {
  return (
    coversSitePath(match, sitePath) ||
    (match.wpDir.length > 0 && isAtOrUnder(sitePath, match.wpDir))
  )
}

export async function resolveAgentLocalSite(
  site: LocalStackSiteRef,
  options: AgentLocalResolveOptions = {}
): Promise<{ match: AgentLocalSiteMatch | null; response: AgentLocalResponse }> {
  const host = options.host ?? createAgentLocalHost()
  const resolved = await requestWithDaemon(
    host,
    'GET',
    `/resolve?path=${encodeURIComponent(site.path)}`
  )
  const fromResolve = resolved.ok ? matchFromResolvePayload(resolved.data) : null
  if (fromResolve && resolveAnswerNests(fromResolve, site.path)) {
    return { match: fromResolve, response: resolved }
  }

  const response = await requestWithDaemon(host, 'GET', '/sites')
  if (!response.ok || !Array.isArray(response.data)) {
    return { match: null, response: resolved.ok ? resolved : response }
  }
  const listed = response.data
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map(toSiteMatch)
    .filter((entry): entry is AgentLocalSiteMatch => entry !== null)
  const underPath = listed.filter((entry) => coversSitePath(entry, site.path))
  const byPath = underPath.sort((left, right) => right.wpDir.length - left.wpDir.length)[0] ?? null
  if (byPath) {
    return { match: byPath, response }
  }
  const slug = expectedSlug(site.path)
  const bySlug = slug.length > 0 ? (listed.find((entry) => entry.slug === slug) ?? null) : null
  return { match: bySlug, response }
}
