// The Extension Hub catalog: what skills, MCP servers and supporting software Muster offers, and
// how it learns whether a newer version exists.
//
// The catalog is data we publish outside the app, so every shape here is a CLOSED union validated
// on parse. A remote catalog can pick between install methods Muster already implements; it can
// never introduce a new one.
//
// What that does NOT buy, and must not be mistaken for: the install, update, uninstall and setup
// fields are free-form shell commands. Validation bounds their length and rejects a malformed
// entry; it cannot tell a safe command from a hostile one. Whoever can publish the catalog can run
// code on every machine that fetches it.
//
// That is acceptable for exactly one reason: the catalog is published to the same GitHub release as
// the app binary, so anyone able to change it could already ship arbitrary code inside Muster
// itself. The trust boundary is the release, not the schema. Pointing the fetch at a URL the user
// or a third party controls would therefore be a genuine escalation, which is why an arbitrary
// catalog URL is out of scope rather than merely unimplemented.
//
// Types and schema live together on purpose: a field added to one and forgotten in the other is
// exactly the drift that lets an unvalidated string reach a command line.

import { z } from 'zod'

export const EXTENSION_CATALOG_SCHEMA_VERSION = 1

/** Skills fill the Skills tab; mcp and app fill Tools. */
export const EXTENSION_KINDS = ['skill', 'mcp', 'app'] as const
export type ExtensionKind = (typeof EXTENSION_KINDS)[number]

export const EXTENSION_HARNESS_IDS = ['claude-code', 'codex', 'cursor', 'grok', 'omp', 'pi'] as const
export type ExtensionHarnessId = (typeof EXTENSION_HARNESS_IDS)[number]

export const EXTENSION_PLATFORMS = ['darwin', 'linux', 'win32'] as const
export type ExtensionPlatform = (typeof EXTENSION_PLATFORMS)[number]

/**
 * A stdio transport names a BINARY, not a path. Each harness adapter decides whether to write the
 * bare name (Claude Code searches PATH) or the resolved absolute path (Codex does not), which is
 * the one difference that silently breaks an install if it is got wrong.
 */
export type ExtensionMcpTransport =
  | { kind: 'stdio'; binary: string; args: string[]; env: Record<string, string> }
  | { kind: 'http'; url: string }

/**
 * Transport is per harness, not per server: the ActiveCollab MCP is spawned over stdio by Claude
 * Code and Codex but reached over loopback HTTP by Cursor. One transport for the whole entry would
 * have written Cursor an entry it cannot use.
 */
export type ExtensionMcpServerSpec = {
  key: string
  harnesses: { id: ExtensionHarnessId; transport: ExtensionMcpTransport }[]
}

/**
 * How the software behind an entry gets onto the machine. Muster shows it, the user runs it.
 *
 * Both commands are optional because the two halves are genuinely independent: Agent Local updates
 * itself with `agent-local update` but has no in-app first-install route, so it offers an update
 * command and no install command. A spec with neither is rejected at parse time.
 */
export type ExtensionCommandSpec = {
  /** Run when nothing is installed. Absent means first install is the user's own errand. */
  install?: string
  /** Run when something older is installed. Defaults to `install`. */
  update?: string
  /** Removes the program from the machine. Absent means Muster offers no way to remove it. */
  uninstall?: string
  /**
   * A one-off configuration pass, offered as its own button once the program is installed.
   *
   * Separate from `install` because the two fail for different reasons and are worth retrying
   * independently: Agent Local's setup trusts a certificate and edits /etc/hosts, so it can fail on
   * a machine where the install went fine, and rerunning the whole install to retry it is absurd.
   */
  setup?: string
  /** Executable to probe for installed-state. Defaults to the server binary or the entry id. */
  binary?: string
  /** Argv that prints a version, e.g. ['--version']. Absent means "presence only". */
  versionArgs?: string[]
}

/**
 * `config-write` carries an optional `provision` because an MCP server is usually two separate
 * things: a binary that has to exist, and a config entry pointing at it. The ActiveCollab card
 * already models exactly this split, and collapsing them would make Muster write an entry for a
 * server that cannot spawn.
 */
export type ExtensionInstallSpec =
  | { method: 'config-write'; server: ExtensionMcpServerSpec; provision?: ExtensionCommandSpec }
  | { method: 'command'; command: ExtensionCommandSpec }
  /** Ships in the app bundle and is installed by the existing skill installer. */
  | { method: 'bundled-skill'; skill: string }

/**
 * A value the user supplies, written into the MCP entry's environment.
 *
 * Declared by the catalog rather than hardcoded per entry so a new server that wants an API key
 * needs a catalog edit and no app release. The value itself never travels in the catalog: it is the
 * user's, it lives in their settings, and Muster only knows the NAME of the variable to write.
 */
export type ExtensionSettingSpec = {
  /** Environment variable written into every stdio entry for this server. */
  key: string
  label: string
  /** One short line under the field. Not a paragraph; the detail dialog already has one. */
  help?: string
  /** Masked in the UI. Does not make the stored value a secret — see the note in the dialog. */
  secret?: boolean
}

export type ExtensionLatestSpec =
  | { source: 'pinned' }
  | { source: 'pypi'; package: string }
  | { source: 'npm'; package: string }
  | { source: 'git-tag'; remote: string }
  | { source: 'github-release'; repo: string }
  | { source: 'agent-local-daemon' }
  | { source: 'bundled' }

/** Some entries are private. The probe is advisory: it greys a row, it never blocks an install. */
export type ExtensionAccessSpec = { kind: 'git-ssh'; remote: string }

export type ExtensionAutoUpdateSpec = {
  supported: boolean
  /** Shown on the disabled toggle. Required when unsupported, or the UI cannot explain itself. */
  reason?: string
}

export type ExtensionEntry = {
  id: string
  kind: ExtensionKind
  name: string
  description: string
  /** A paragraph for the detail dialog, when one line cannot say what the thing is for. */
  about?: string
  keywords: string[]
  /** The floor `latest` degrades to when every probe fails. Also the pinned source's answer. */
  version: string
  install: ExtensionInstallSpec
  latest: ExtensionLatestSpec
  /** Absent means every platform. */
  platforms?: ExtensionPlatform[]
  homepage?: string
  /** Optional values the user fills in, written into the harness entries Muster authors. */
  settings?: ExtensionSettingSpec[]
  access?: ExtensionAccessSpec
  autoUpdate?: ExtensionAutoUpdateSpec
  /** Hides a row this build is too old to drive correctly. */
  minAppVersion?: string
}

export type ExtensionCatalog = {
  schemaVersion: typeof EXTENSION_CATALOG_SCHEMA_VERSION
  updatedAt: string
  entries: ExtensionEntry[]
}

const IdSchema = z
  .string()
  .min(1)
  .max(64)
  // Why: ids reach filesystem cache keys and settings record keys, so keep them boring.
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be lowercase kebab-case')

const TransportSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stdio'),
    binary: z.string().min(1).max(128),
    args: z.array(z.string().max(256)).max(32).default([]),
    env: z.record(z.string().max(64), z.string().max(1024)).default({})
  }),
  z.object({ kind: z.literal('http'), url: z.url() })
])

const McpServerSchema = z.object({
  key: z.string().min(1).max(64),
  harnesses: z
    .array(z.object({ id: z.enum(EXTENSION_HARNESS_IDS), transport: TransportSchema }))
    .min(1)
    .max(EXTENSION_HARNESS_IDS.length)
}) as z.ZodType<ExtensionMcpServerSpec>

const CommandSchema = z
  .object({
    install: z.string().min(1).max(512).optional(),
    update: z.string().min(1).max(512).optional(),
    uninstall: z.string().min(1).max(512).optional(),
    setup: z.string().min(1).max(512).optional(),
    binary: z.string().min(1).max(128).optional(),
    versionArgs: z.array(z.string().max(64)).max(8).optional()
  })
  // Why: a spec with neither command describes no action at all, and would render a button that
  // cannot do anything.
  .refine(
    (value) => value.install !== undefined || value.update !== undefined,
    'a command spec needs an install or an update command'
  )

const InstallSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('config-write'),
    server: McpServerSchema,
    provision: CommandSchema.optional()
  }),
  z.object({ method: z.literal('command'), command: CommandSchema }),
  z.object({ method: z.literal('bundled-skill'), skill: z.string().min(1).max(128) })
]) as z.ZodType<ExtensionInstallSpec>

const LatestSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('pinned') }),
  z.object({ source: z.literal('pypi'), package: z.string().min(1).max(128) }),
  z.object({ source: z.literal('npm'), package: z.string().min(1).max(214) }),
  z.object({ source: z.literal('git-tag'), remote: z.string().min(1).max(512) }),
  z.object({
    source: z.literal('github-release'),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be owner/name')
  }),
  z.object({ source: z.literal('agent-local-daemon') }),
  z.object({ source: z.literal('bundled') })
]) as z.ZodType<ExtensionLatestSpec>

export const ExtensionEntrySchema = z.object({
  id: IdSchema,
  kind: z.enum(EXTENSION_KINDS),
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(280),
  about: z.string().min(1).max(900).optional(),
  keywords: z.array(z.string().max(32)).max(24).default([]),
  version: z.string().min(1).max(64),
  install: InstallSchema,
  latest: LatestSchema,
  platforms: z.array(z.enum(EXTENSION_PLATFORMS)).min(1).optional(),
  homepage: z.url().optional(),
  settings: z
    .array(
      z.object({
        // Why the shape is enforced: this string becomes an environment variable name in a file
        // Muster writes, so anything that is not one is a bug we refuse rather than escape.
        key: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'key must be SCREAMING_SNAKE_CASE'),
        label: z.string().min(1).max(64),
        help: z.string().max(160).optional(),
        secret: z.boolean().optional()
      })
    )
    .min(1)
    .max(8)
    .optional(),
  access: z.object({ kind: z.literal('git-ssh'), remote: z.string().min(1).max(512) }).optional(),
  autoUpdate: z
    .object({ supported: z.boolean(), reason: z.string().max(200).optional() })
    .optional(),
  minAppVersion: z.string().max(32).optional()
}) as z.ZodType<ExtensionEntry>

export const ExtensionCatalogSchema = z.object({
  schemaVersion: z.literal(EXTENSION_CATALOG_SCHEMA_VERSION),
  updatedAt: z.string().min(1).max(64),
  // Why bounded: this parses bytes fetched off the network before anything else looks at them.
  entries: z.array(ExtensionEntrySchema).max(200)
}) as z.ZodType<ExtensionCatalog>

/** Null rather than a throw: every caller's answer to bad bytes is "use the previous catalog". */
export function parseExtensionCatalog(value: unknown): ExtensionCatalog | null {
  const parsed = ExtensionCatalogSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const seen = new Set<string>()
  for (const entry of parsed.data.entries) {
    if (seen.has(entry.id)) {
      return null
    }
    seen.add(entry.id)
    // Why: two rows for one harness would race each other's splice, and the last write would
    // silently decide which transport the user ends up with.
    if (entry.install.method === 'config-write') {
      const harnesses = entry.install.server.harnesses.map((harness) => harness.id)
      if (new Set(harnesses).size !== harnesses.length) {
        return null
      }
    }
  }
  return parsed.data
}

export function isExtensionPlatformSupported(
  entry: ExtensionEntry,
  platform: NodeJS.Platform
): boolean {
  return (
    entry.platforms === undefined ||
    (entry.platforms as readonly string[]).includes(platform as string)
  )
}

/**
 * Auto-update is opt-in per entry, with no implicit default.
 *
 * It is tempting to say a `config-write` entry is automatically safe because Muster authors those
 * bytes itself. That is true of the WIRING and false of the update: what goes out of date is the
 * program the entry points at, and moving that forward means running the provision command. So
 * every real auto-update runs a command, and a command may only run unattended if we have checked
 * that it needs no TTY. `npm install -g` is the standing example of one that might.
 *
 * A bundled skill is excluded outright: the app updater already moves it, and a switch that does
 * nothing is worse than no switch.
 */
export function supportsExtensionAutoUpdate(entry: ExtensionEntry): boolean {
  if (entry.install.method === 'bundled-skill') {
    return false
  }
  return entry.autoUpdate?.supported === true
}
