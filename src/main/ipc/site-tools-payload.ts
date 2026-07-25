// Hand-written bounded guards for the site-tool IPC payloads, following the house pattern in
// sites-payload-validation.ts (zod is not used at this boundary).
//
// Everything here is length- and count-capped before it reaches a remote shell or the filesystem.
// The WP-CLI argument list is the sharpest edge: it is forwarded to a command line, so the count and
// per-argument length are bounded here and the *content* is judged by checkWpCliSafety.

import type { RemoteFileSearchKind } from '../../shared/site-tool-types'
import { isSiteEnvironmentName } from './sites-payload-validation'

const MAX_ARGUMENT_LENGTH = 512
const MAX_PATH_ENTRIES = 100
const MAX_WP_CLI_ARGS = 30

export type SiteToolArgs = Record<string, unknown>

export function readToolArgs(args: unknown): SiteToolArgs {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new TypeError('Expected an arguments object')
  }
  return { ...args }
}

export function requireSiteId(args: SiteToolArgs): string {
  const siteId = args.siteId
  if (typeof siteId !== 'string' || siteId.length === 0 || siteId.length > MAX_ARGUMENT_LENGTH) {
    throw new TypeError('siteId must be a non-empty string')
  }
  return siteId
}

/** Null means "resolve from the branch", which is the guarded path. */
export function readEnvironment(args: SiteToolArgs): string | null {
  const environment = args.environment
  if (environment === undefined || environment === null) {
    return null
  }
  if (!isSiteEnvironmentName(environment)) {
    throw new TypeError('environment must be a non-empty string')
  }
  return environment
}

export function readFlag(args: SiteToolArgs, key: string, fallback: boolean): boolean {
  const value = args[key]
  if (value === undefined) {
    return fallback
  }
  if (typeof value !== 'boolean') {
    throw new TypeError(`${key} must be a boolean`)
  }
  return value
}

export function readPositiveInteger(
  args: SiteToolArgs,
  key: string,
  fallback: number,
  max: number
): number {
  const value = args[key]
  if (value === undefined) {
    return fallback
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
    throw new TypeError(`${key} must be an integer between 1 and ${max}`)
  }
  return value
}

export function requireText(args: SiteToolArgs, key: string): string {
  const value = args[key]
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_ARGUMENT_LENGTH
  ) {
    throw new TypeError(`${key} must be a non-empty string`)
  }
  return value
}

export function requireStringList(args: SiteToolArgs, key: string, maxEntries: number): string[] {
  const value = args[key]
  if (!Array.isArray(value) || value.length === 0 || value.length > maxEntries) {
    throw new TypeError(`${key} must be an array of 1-${maxEntries} strings`)
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > MAX_ARGUMENT_LENGTH) {
      throw new TypeError(
        `${key} entries must be non-empty strings under ${MAX_ARGUMENT_LENGTH} characters`
      )
    }
  }
  return [...value]
}

export function requireRemotePaths(args: SiteToolArgs): string[] {
  return requireStringList(args, 'paths', MAX_PATH_ENTRIES)
}

export function requireWpCliArgs(args: SiteToolArgs): string[] {
  return requireStringList(args, 'args', MAX_WP_CLI_ARGS)
}

export function readWpCliLocation(args: SiteToolArgs): 'local' | 'remote' {
  const location = args.location
  if (location !== 'local' && location !== 'remote') {
    throw new TypeError("location must be 'local' or 'remote'")
  }
  return location
}

export function readSearchKind(args: SiteToolArgs): RemoteFileSearchKind {
  const kind = args.kind
  if (kind === undefined) {
    return 'file'
  }
  if (kind !== 'file' && kind !== 'dir' && kind !== 'any') {
    throw new TypeError("kind must be 'file', 'dir' or 'any'")
  }
  return kind
}
