// Settings export/import: turn GlobalSettings into a portable file and back.
//
// Two rules drive the whole module.
//
// 1. Secrets never leave. `persistence.ts` encrypts `opencodeSessionCookie` and `httpProxyUrl`
//    through safeStorage precisely so they are not sitting in a readable file; writing them into
//    an export the user then emails to a colleague would undo that. They are dropped, not blanked
//    with a placeholder, so an import can never resurrect a fake value over a real one.
//
// 2. Import never blind-spreads. A settings object reaches every subsystem in the app, so an
//    unrecognised key or a string where a number belongs is rejected with a reason rather than
//    merged and discovered later as a crash three panes away.
//
// The recognised-key set is derived from `getDefaultSettings()` rather than hand-listed: a key with
// a default is a key this build understands, and the default's runtime shape is what an imported
// value has to match. Optional keys with no default are listed explicitly below.

import { getDefaultSettings } from './constants'
import type { GlobalSettings } from './types'

export const SETTINGS_EXPORT_KIND = 'muster-settings-export'
export const SETTINGS_EXPORT_VERSION = 1

/**
 * Never exported. Encrypted at rest by `persistence.ts`; a plaintext copy in a shareable file
 * would defeat that, and re-importing one would overwrite a working credential with a stale one.
 */
export const SETTINGS_EXPORT_SECRET_KEYS: readonly (keyof GlobalSettings)[] = [
  'opencodeSessionCookie',
  'httpProxyUrl'
]

/**
 * Never exported either — not secret, but machine-bound. These name absolute paths, per-host
 * account homes, and this install's runtime ids; carrying them to another machine points the app
 * at directories that do not exist there.
 */
export const SETTINGS_EXPORT_MACHINE_LOCAL_KEYS: readonly (keyof GlobalSettings)[] = [
  'workspaceDir',
  'workspaceDirHistory',
  'floatingTerminalCwd',
  'floatingTerminalTrustedCwds',
  'hostSettingOverrides',
  'codexManagedAccounts',
  'claudeManagedAccounts',
  'activeCodexManagedAccountId',
  'activeCodexManagedAccountIdsByRuntime',
  'activeClaudeManagedAccountId',
  'activeClaudeManagedAccountIdsByRuntime',
  'activeRuntimeEnvironmentId',
  'browserExtensionPaths'
]

/**
 * Exportable keys that `getDefaultSettings()` leaves out because they are optional. Typed against
 * `keyof GlobalSettings` so a rename breaks the build instead of silently dropping a setting.
 */
const OPTIONAL_EXPORTABLE_KEYS: readonly (keyof GlobalSettings)[] = [
  'experimentalCompactWorktreeCards',
  'experimentalSidekick',
  'keybindings',
  'localAgentRuntime',
  'localAgentWslDistro',
  'tabSwitchKeybindingSeed',
  'telemetry',
  'terminalBackgroundOpacity',
  'terminalColorOverrides',
  'terminalCursorOpacity',
  'terminalPaddingX',
  'terminalPaddingY',
  'terminalWordSeparator',
  'codexSessionSourceHome',
  'gitlabProjects'
]

export type SettingsExportFile = {
  kind: typeof SETTINGS_EXPORT_KIND
  version: typeof SETTINGS_EXPORT_VERSION
  exportedAt: string
  appVersion: string
  settings: Partial<GlobalSettings>
}

export type SettingsImportResult =
  | { ok: true; settings: Partial<GlobalSettings>; ignoredKeys: string[] }
  | { ok: false; reason: string }

/** IPC outcomes for the two Settings → Advanced actions. Shared so preload never reaches into main. */
export type SettingsExportOutcome =
  | { ok: true; filePath: string; settingCount: number }
  | { ok: false; cancelled: true }
  | { ok: false; reason: string }

export type SettingsImportOutcome =
  | { ok: true; settings: GlobalSettings; appliedKeys: string[]; ignoredKeys: string[] }
  | { ok: false; cancelled: true }
  | { ok: false; reason: string }

function isExcluded(key: string): boolean {
  return (
    (SETTINGS_EXPORT_SECRET_KEYS as readonly string[]).includes(key) ||
    (SETTINGS_EXPORT_MACHINE_LOCAL_KEYS as readonly string[]).includes(key)
  )
}

/** Keys this build understands and is willing to move between machines. */
export function exportableSettingsKeys(homedir: string): string[] {
  const fromDefaults = Object.keys(getDefaultSettings(homedir))
  const all = [...fromDefaults, ...(OPTIONAL_EXPORTABLE_KEYS as readonly string[])]
  return [...new Set(all)].filter((key) => !isExcluded(key))
}

export function buildSettingsExport(args: {
  settings: GlobalSettings
  homedir: string
  appVersion: string
  now?: Date
}): SettingsExportFile {
  const allowed = exportableSettingsKeys(args.homedir)
  const source = args.settings as Record<string, unknown>
  const settings: Record<string, unknown> = {}
  for (const key of allowed) {
    if (source[key] !== undefined) {
      settings[key] = source[key]
    }
  }
  return {
    kind: SETTINGS_EXPORT_KIND,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: (args.now ?? new Date()).toISOString(),
    appVersion: args.appVersion,
    settings: settings as Partial<GlobalSettings>
  }
}

/** Shape family of a default value, used to reject an imported value of the wrong kind. */
function shapeOf(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

/** Shapes a `T | null` setting can legitimately carry on either side of the comparison. */
const NULLABLE_SHAPES: Record<string, true> = {
  null: true,
  object: true,
  array: true,
  string: true,
  number: true
}

function shapeMatches(imported: unknown, reference: unknown): boolean {
  const referenceShape = shapeOf(reference)
  const importedShape = shapeOf(imported)
  if (importedShape === referenceShape) {
    return true
  }
  // Why: plenty of settings are `T | null` while their default sits on one side of the union
  // (`defaultRepoSelection: null`). Accept null against any object-ish default, and any
  // object-ish value against a null default, rather than inventing a schema.
  return (
    (importedShape === 'null' && NULLABLE_SHAPES[referenceShape] === true) ||
    (referenceShape === 'null' && NULLABLE_SHAPES[importedShape] === true)
  )
}

export function parseSettingsImport(raw: string, homedir: string): SettingsImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'notJson' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'notAnObject' }
  }
  const file = parsed as Record<string, unknown>
  if (file.kind !== SETTINGS_EXPORT_KIND) {
    return { ok: false, reason: 'notASettingsExport' }
  }
  if (file.version !== SETTINGS_EXPORT_VERSION) {
    return { ok: false, reason: 'unsupportedVersion' }
  }
  const incoming = file.settings
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    return { ok: false, reason: 'missingSettings' }
  }

  const reference = getDefaultSettings(homedir) as Record<string, unknown>
  const allowed = new Set(exportableSettingsKeys(homedir))
  const settings: Record<string, unknown> = {}
  const ignoredKeys: string[] = []
  for (const [key, value] of Object.entries(incoming)) {
    if (isExcluded(key)) {
      // A file carrying a secret or a machine-local path was not written by this build's exporter.
      return { ok: false, reason: 'containsExcludedKey' }
    }
    if (!allowed.has(key)) {
      // Why ignore rather than reject: a file from a newer build is still worth importing for the
      // keys this one knows. Unknown keys are reported so the UI can say what was left behind.
      ignoredKeys.push(key)
      continue
    }
    if (key in reference && !shapeMatches(value, reference[key])) {
      return { ok: false, reason: 'invalidValue' }
    }
    settings[key] = value
  }

  if (Object.keys(settings).length === 0) {
    return { ok: false, reason: 'noRecognizedSettings' }
  }
  return { ok: true, settings: settings as Partial<GlobalSettings>, ignoredKeys }
}
