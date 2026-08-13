// One interface per local WordPress stack, and the registry that picks between them.
//
// Why an interface rather than a `switch (site.localStack)` at each call site: the stack is
// consulted from eight modules (import pipeline, run config, six IPC handlers, cert handlers), and
// a third implementation turns each of those into a three-way branch that has to be kept in sync.
// It also gives `mamp` — already in the enum, still unimplemented — somewhere to land.
//
// The LocalWP provider below is a pure delegation to the existing functions: no LocalWP behaviour
// changes, and its own tests keep exercising those modules directly.

import type { SiteLocalStack } from '../../shared/site-types'
import type {
  LocalWpControlOutcome,
  LocalWpControlState,
  LocalWpStackDetection
} from '../../shared/site-stack-types'
import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'
import { getLocalWpCertStatus, trustLocalWpCert } from './localwp-cert-trust'
import { ensureLocalWpHttpsCert } from './localwp-cert-ensure'
import { currentSocketIfRunning, detectLocalWpStack } from './localwp-detection'
import {
  createLocalWpHost,
  isLocalWpSupported,
  LOCALWP_DATABASE_PASSWORD,
  LOCALWP_DATABASE_USER
} from './localwp-host'
import { ensureSiteRunning, stopSite } from './localwp-site-control'

/** The subset of a Site every provider needs. Deliberately not the whole record. */
export type LocalStackSiteRef = {
  path: string
  localStack: SiteLocalStack
  /** Muster's stored docroot offset, when it already knows one. */
  localWpRoot?: string
}

/**
 * How to reach a site's database right now. An empty `socketPath` selects the TCP branch in
 * buildLocalMysqlConnectionOptions, so it must never be filled with a placeholder.
 */
export type LocalStackCredentials = {
  socketPath: string
  port: number | null
  user: string
  password: string
  /** The schema the stack owns for this site; empty when wp-config.php is authoritative. */
  database: string
}

/** LocalWpControlOutcome widened with what a TCP stack has to report back. */
export type LocalStackOutcome = LocalWpControlOutcome & {
  port?: number | null
  user?: string
  password?: string
  /** The schema the stack owns, when it names it rather than wp-config.php. */
  database?: string
  /** The stack's own docroot, when it knows better than Muster's stored offset. */
  wpDir?: string
}

export type LocalStackProvider = {
  id: SiteLocalStack
  /** Installed and reachable. False must never throw — it gates a UI affordance. */
  isAvailable: () => Promise<boolean>
  detect: (sitePath: string) => Promise<LocalWpStackDetection>
  ensureRunning: (
    site: LocalStackSiteRef,
    onStatus?: (message: string) => void
  ) => Promise<LocalStackOutcome>
  stop: (site: LocalStackSiteRef) => Promise<LocalStackOutcome>
  /** Live transport and credentials; null when this stack does not manage the site. */
  credentials: (site: LocalStackSiteRef) => Promise<LocalStackCredentials | null>
  certStatus: (domain: string) => Promise<LocalWpCertStatus>
  certTrust: (domain: string) => Promise<LocalWpCertTrustResult>
  /**
   * Start the stack if needed, mint the cert when Local has not written one, then trust it.
   * Optional: stacks that issue a cert inside `certTrust` (agent-local) can omit this.
   */
  certEnsure?: (domain: string, site: LocalStackSiteRef) => Promise<LocalWpCertTrustResult>
  /**
   * Stand off :80/:443 for `seconds` so another stack can bind them. Optional, because only a stack
   * that takes the privileged ports has anything to give up — LocalWP binds them itself and has no
   * way to hand them back on request.
   *
   * Resolves true when this stack is no longer holding the ports, which includes "it was never
   * running". Never throws: a failed handover degrades to the ports staying where they are.
   */
  releasePrivilegedPorts?: (seconds: number) => Promise<boolean>
}

export function localStackSkip(state: LocalWpControlState, message: string): LocalStackOutcome {
  return { ok: true, socketPath: '', state, message }
}

const localWpProvider: LocalStackProvider = {
  id: 'localwp',
  isAvailable: async () => isLocalWpSupported(createLocalWpHost()),
  detect: (sitePath) => detectLocalWpStack(createLocalWpHost(), sitePath),
  ensureRunning: (site, onStatus) => ensureSiteRunning(site.path, { onStatus }),
  stop: (site) => stopSite(site.path),
  credentials: async (site) => {
    // Probe, never start: building a run config must not have the side effect of launching Local.
    // The import pipeline starts the site explicitly, and a stopped site keeps its stored socket so
    // the failure surfaces at the connection step with LocalWP's own message.
    const socketPath = await currentSocketIfRunning(createLocalWpHost(), site.path)
    if (!socketPath) {
      return null
    }
    return {
      socketPath,
      port: null,
      user: LOCALWP_DATABASE_USER,
      password: LOCALWP_DATABASE_PASSWORD,
      database: ''
    }
  },
  certStatus: getLocalWpCertStatus,
  certTrust: trustLocalWpCert,
  certEnsure: (domain, site) => ensureLocalWpHttpsCert(domain, site.path)
}

/**
 * `plain` and `mamp` share this: the site's stored dbHost/dbPort/dbSocket are already the whole
 * truth, so there is nothing to start and no credentials to discover.
 */
function createUnmanagedProvider(id: SiteLocalStack): LocalStackProvider {
  const unmanaged = `No managed local stack for this site (${id}).`
  return {
    id,
    isAvailable: async () => true,
    detect: (sitePath) => detectLocalWpStack(createLocalWpHost(), sitePath),
    ensureRunning: async () => localStackSkip('not-managed', unmanaged),
    stop: async () => localStackSkip('not-managed', unmanaged),
    credentials: async () => null,
    certStatus: getLocalWpCertStatus,
    certTrust: trustLocalWpCert
  }
}

const registry = new Map<SiteLocalStack, LocalStackProvider>([
  ['localwp', localWpProvider],
  ['plain', createUnmanagedProvider('plain')],
  ['mamp', createUnmanagedProvider('mamp')]
])

/**
 * Late registration rather than a static map: the agent-local provider imports this module for its
 * types, so a direct import here would be a cycle. Its module registers itself on load.
 */
export function registerLocalStackProvider(provider: LocalStackProvider): void {
  registry.set(provider.id, provider)
}

export function providerFor(stack: SiteLocalStack): LocalStackProvider {
  return registry.get(stack) ?? createUnmanagedProvider(stack)
}

export function localStackProviders(): LocalStackProvider[] {
  return [...registry.values()]
}
