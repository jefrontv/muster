// Joins the catalog to this machine: for every entry, what is installed, what is published, and
// therefore whether there is anything to do.
//
// Each probe is injected rather than imported for effect, so the join can be tested without a
// filesystem, a network, a git binary or an Agent Local daemon — and so one slow probe cannot
// quietly become a startup dependency.
//
// Versions are compared only when BOTH sides are known. An entry whose installed or published
// version could not be read reports 'unknown', never 'current': claiming something is up to date
// because we failed to check is the one wrong answer that hides work from the user.

import {
  isExtensionPlatformSupported,
  supportsExtensionAutoUpdate,
  type ExtensionAccessSpec,
  type ExtensionCatalog,
  type ExtensionEntry,
  type ExtensionLatestSpec,
  type ExtensionMcpServerSpec
} from '../../shared/extension-catalog-types'
import type {
  ExtensionHarnessState,
  ExtensionInventory,
  ExtensionInventoryEntry,
  ExtensionState,
  ExtensionStatus
} from '../../shared/extension-state-types'
import type { ExtensionAutoUpdatePreferences } from '../../shared/extension-preferences'
import type { ExtensionAccessResult } from './extension-access'
import type { BinaryProbeResult } from './binary-probe'
import { homebrewFormulaFromPath } from '../../shared/homebrew-owned-binary'
import { isOutdated } from './version-probe'

export type ExtensionInventoryEnv = {
  platform: NodeJS.Platform
  probeBinary: (binary: string) => BinaryProbeResult
  /** The entry is passed so the caller can splice in the user's own values before comparing. */
  readHarnessStates: (
    server: ExtensionMcpServerSpec,
    binaryPath: string | null,
    entry: ExtensionEntry
  ) => ExtensionHarnessState[]
  probeLatest: (spec: ExtensionLatestSpec) => Promise<string | null>
  probeAccess: (spec: ExtensionAccessSpec) => Promise<ExtensionAccessResult>
  /** Null when the name is not in this build's skill bundle. */
  skillStatus: (skill: string) => Promise<{ installed: boolean; outdated: boolean } | null>
  /** Agent Local answers for its own installed and published version. */
  readAgentLocal: () => Promise<{ version: string | null; latest: string | null }>
  /** Last resort for a compiled binary: ask the program. Cached against the file it ran. */
  readVersionByCommand: (
    path: string,
    versionArgs: readonly string[] | undefined
  ) => Promise<string | null>
  autoUpdate: ExtensionAutoUpdatePreferences
}

function autoUpdateEnabled(
  entry: ExtensionEntry,
  preferences: ExtensionAutoUpdatePreferences
): boolean {
  if (!supportsExtensionAutoUpdate(entry)) {
    return false
  }
  // Why the master switch is only a default: turning it on should set the policy for what you
  // install next, not silently opt in every tool you already had reasons to pin.
  return preferences.entries[entry.id] ?? preferences.master
}

function versionStatus(
  installed: boolean,
  installedVersion: string | null,
  latestVersion: string | null
): ExtensionStatus {
  if (!installed) {
    return 'not-installed'
  }
  if (installedVersion === null || latestVersion === null) {
    return 'unknown'
  }
  return isOutdated(installedVersion, latestVersion) ? 'outdated' : 'current'
}

function unavailable(
  entry: ExtensionEntry,
  status: ExtensionStatus,
  detail: string
): ExtensionState {
  return {
    id: entry.id,
    installed: false,
    installedVersion: null,
    latestVersion: null,
    status,
    detail,
    binaryPath: null,
    harnesses: [],
    autoUpdateSupported: false,
    autoUpdateEnabled: false,
    ...(status === 'no-access' ? { accessGranted: false } : {})
  }
}

/** The pinned catalog version is the floor: a probe that could not answer never lowers it. */
async function resolveLatest(
  entry: ExtensionEntry,
  env: ExtensionInventoryEnv
): Promise<string | null> {
  if (entry.latest.source === 'bundled') {
    return null
  }
  if (entry.latest.source === 'agent-local-daemon') {
    return (await env.readAgentLocal()).latest ?? entry.version
  }
  return (await env.probeLatest(entry.latest)) ?? entry.version
}

async function inspectSkill(
  entry: ExtensionEntry & { install: { method: 'bundled-skill'; skill: string } },
  env: ExtensionInventoryEnv
): Promise<Pick<ExtensionState, 'installed' | 'status' | 'detail'>> {
  const skill = await env.skillStatus(entry.install.skill)
  if (skill === null) {
    return {
      installed: false,
      status: 'not-installed',
      detail: 'This build does not ship that skill.'
    }
  }
  if (!skill.installed) {
    return { installed: false, status: 'not-installed' }
  }
  return { installed: true, status: skill.outdated ? 'outdated' : 'current' }
}

async function buildState(
  entry: ExtensionEntry,
  env: ExtensionInventoryEnv
): Promise<ExtensionState> {
  if (!isExtensionPlatformSupported(entry, env.platform)) {
    return unavailable(entry, 'unsupported-platform', `${entry.name} does not run on this system.`)
  }

  const accessGranted = entry.access ? await env.probeAccess(entry.access) : undefined
  if (accessGranted === false) {
    return unavailable(entry, 'no-access', 'You do not have access to this repository.')
  }

  const base = {
    id: entry.id,
    autoUpdateSupported: supportsExtensionAutoUpdate(entry),
    autoUpdateEnabled: autoUpdateEnabled(entry, env.autoUpdate),
    ...(accessGranted === undefined ? {} : { accessGranted })
  }

  if (entry.install.method === 'bundled-skill') {
    const skill = await inspectSkill(entry as never, env)
    return { ...base, ...skill, installedVersion: null, latestVersion: null, binaryPath: null, harnesses: [] }
  }

  const command = entry.install.method === 'command' ? entry.install.command : entry.install.provision
  const binaryName = command?.binary ?? entry.id
  const binary = command ? env.probeBinary(binaryName) : null
  const agentLocalVersion =
    entry.latest.source === 'agent-local-daemon' ? (await env.readAgentLocal()).version : null
  // Three sources, cheapest first. The command is last because it spawns a process, and it is
  // reached at all because a compiled binary records its version nowhere a probe can read: an
  // Agent Local install whose daemon is stopped, or whose daemon is too old to report its own
  // version over /status, has no other honest answer.
  const installedVersion =
    agentLocalVersion ??
    binary?.version ??
    (binary?.found && binary.path
      ? await env.readVersionByCommand(binary.path, command?.versionArgs)
      : null)
  const latestVersion = await resolveLatest(entry, env)

  const homebrewFormula = binary?.found
    ? (homebrewFormulaFromPath(binary.realPath) ?? undefined)
    : undefined

  const harnesses =
    entry.install.method === 'config-write'
      ? env.readHarnessStates(entry.install.server, binary?.path ?? null, entry)
      : []
  const wired = harnesses.some((harness) => harness.configured)
  // Why wiring counts as installed even when the managed binary is missing: the user already has
  // this server working, just pointed somewhere Muster did not put it — a local checkout, a
  // hand-written entry. Calling that "not installed" contradicts what they can see in their agent,
  // and it hid the very rows they would use to hand it over to Muster.
  const externallyManaged = wired && binary !== null && !binary.found
  // A daemon that answers with its version is installed even when the PATH probe misses the binary.
  const installed = (binary ? binary.found || wired : wired) || agentLocalVersion !== null

  return {
    ...base,
    installed,
    installedVersion,
    latestVersion,
    status: externallyManaged
      ? 'unknown'
      : versionStatus(installed, installedVersion, latestVersion),
    ...(externallyManaged ? { externallyManaged: true } : {}),
    detail: externallyManaged
      ? 'Set up outside Muster. Installing replaces those entries with the managed copy.'
      : undefined,
    binaryPath: binary?.path ?? null,
    // Read from the resolved target, not the invoked shim: a Homebrew shim and a curl install both
    // sit in a bin directory, and only the Cellar path they point at tells the two apart.
    ...(homebrewFormula ? { homebrewFormula } : {}),
    harnesses
  }
}

export async function inventoryExtensions(
  catalog: ExtensionCatalog,
  env: ExtensionInventoryEnv
): Promise<ExtensionInventoryEntry[]> {
  // Why serial per entry but parallel across entries: each entry's probes are independent, and the
  // slowest of them (a registry round trip) should not queue behind an unrelated one.
  return Promise.all(
    catalog.entries.map(async (entry) => ({ entry, state: await buildState(entry, env) }))
  )
}

export function emptyExtensionInventory(scannedAt: number): ExtensionInventory {
  return {
    schemaVersion: 1,
    entries: [],
    catalogOrigin: 'bundled',
    catalogUpdatedAt: '1970-01-01',
    scannedAt
  }
}
