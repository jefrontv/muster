// Argument validation, stack detection and transport persistence for the siteStacks channels.
//
// Split out of site-stacks.ts so that file stays the handler table. Everything here is either
// untrusted-input validation (the renderer can send anything across the bridge) or the small
// decisions that differ per stack.

import path from 'node:path'
import { SITE_LOCAL_STACKS, type Site, type SiteLocalStack } from '../../shared/site-types'
import type { Store } from '../persistence'
import type { LocalStackOutcome } from '../sites/local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import '../sites/agent-local-site-control'
import { detectSiteStack } from '../sites/local-stack-detection'
import {
  createLocalWpHost,
  isLocalWpSupported,
  LOCALWP_UNSUPPORTED_PLATFORM
} from '../sites/localwp-host'
import type { LocalWpMigrationRequest } from '../sites/localwp-migration-plan'
import { requireSite } from './sites-result'

const MAX_FIELD_LENGTH = 256

// Re-exported for the handlers that already import it from here; the detector itself moved to
// sites/, because the setup planner needs it too and must not reach into an IPC module for it.
export { detectSiteStack }

/** Persists the transport a start resolved to, leaving the fields the stack did not report alone. */
export function persistResolvedTransport(
  store: Store,
  site: Site,
  outcome: LocalStackOutcome
): void {
  const updates: Partial<Site> = {}
  if (outcome.socketPath) {
    if (outcome.socketPath !== site.dbSocket) {
      updates.dbSocket = outcome.socketPath
    }
  } else if (outcome.port || outcome.user) {
    if (site.dbSocket) {
      updates.dbSocket = ''
    }
    if (outcome.port && outcome.port !== site.dbPort) {
      updates.dbPort = outcome.port
    }
    if (outcome.user && outcome.user !== site.dbUser) {
      updates.dbUser = outcome.user
    }
  }
  if (Object.keys(updates).length > 0) {
    store.updateSite(site.id, updates)
  }
}

/** The stack a migration targets. Absent means LocalWP, which is what every existing caller means. */
export function readTargetStack(args: unknown): SiteLocalStack {
  const value = readField(args, 'stack')
  if (value === undefined || value === null) {
    return 'localwp'
  }
  if (!SITE_LOCAL_STACKS.some((stack) => stack === value)) {
    throw new TypeError(`Unknown local stack: ${String(value)}`)
  }
  return value as SiteLocalStack
}

export function buildMigrationRequest(
  store: Store,
  args: unknown,
  stack: SiteLocalStack = 'localwp'
): LocalWpMigrationRequest {
  // LocalWP's platform gate is its own; agent-local reports unsupported through its provider so the
  // renderer gets a structured result instead of a thrown string.
  if (stack === 'localwp' && !isLocalWpSupported(createLocalWpHost())) {
    throw new Error(LOCALWP_UNSUPPORTED_PLATFORM)
  }
  const site = requireSite(store, requireId(readField(args, 'siteId')))
  // LocalWP creates the WordPress install, so it needs admin credentials to seed it. agent-local
  // adopts an install that already has its own users and never sees them — requiring them there
  // would only be a form the user has to fill in for nothing.
  const adminRequired = stack === 'localwp'
  return {
    sitePath: site.path,
    siteName: site.displayName || path.basename(site.path),
    domain: requireField(readField(args, 'domain'), 'domain'),
    adminEmail: adminRequired
      ? requireField(readField(args, 'adminEmail'), 'adminEmail')
      : optionalField(readField(args, 'adminEmail')),
    adminPassword: adminRequired
      ? requireField(readField(args, 'adminPassword'), 'adminPassword')
      : optionalField(readField(args, 'adminPassword')),
    force: readField(args, 'force') === true
  }
}

function optionalField(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_FIELD_LENGTH ? value : ''
}

export function readField(args: unknown, key: string): unknown {
  if (typeof args !== 'object' || args === null) {
    throw new TypeError('Expected an arguments object')
  }
  return (args as Record<string, unknown>)[key]
}

export function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError('siteId must be a non-empty string')
  }
  return value
}

function requireField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value
}
