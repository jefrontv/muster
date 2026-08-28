// Hand-written bounded guards for renderer→main site payloads, following the house pattern in
// dashboard-payload-validation.ts (zod is not used at this boundary). Every field is length-capped
// so a compromised renderer cannot push a multi-megabyte string into orca-data.json, and unknown
// keys are rejected outright rather than merged into a persisted record.

import { isSafeCustomStepScriptPath, SITE_LOCAL_STACKS } from '../../shared/site-types'
import type { SiteCustomStep, SiteEnvironment, SiteLocalStack } from '../../shared/site-types'

const MAX_PATH_LENGTH = 4_096
const MAX_NAME_LENGTH = 256
const MAX_NOTES_LENGTH = 16_384
const MAX_TIMEOUT_SECONDS = 86_400
const MAX_DB_PORT = 65_535
const MAX_COMMAND_LENGTH = 8_192
const MAX_CUSTOM_STEPS = 64
/** Scripts are whole files, so they need far more room than a one-line command. */
const MAX_SCRIPT_CONTENTS_LENGTH = 65_536
const CUSTOM_STEP_KEYS = new Set([
  'id',
  'name',
  'description',
  'group',
  'runsOn',
  'command',
  'scriptPath',
  'scriptContents',
  'position',
  'order',
  'enabled',
  'origin'
])

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

export function isSitePath(value: unknown): value is string {
  return (
    isBoundedString(value, MAX_PATH_LENGTH) &&
    value.trim().length > 0 &&
    (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'))
  )
}

export function isSiteEnvironmentName(value: unknown): value is string {
  return isBoundedString(value, MAX_NAME_LENGTH) && value.trim().length > 0
}

export function isSiteSecretKind(value: unknown): value is 'ssh' | 'db' {
  return value === 'ssh' || value === 'db'
}

function isLocalStack(value: unknown): value is SiteLocalStack {
  return SITE_LOCAL_STACKS.some((stack) => stack === value)
}

const SITE_STRING_FIELDS = {
  displayName: MAX_NAME_LENGTH,
  localWpRoot: MAX_PATH_LENGTH,
  localDomain: MAX_NAME_LENGTH,
  dbUser: MAX_NAME_LENGTH,
  dbSocket: MAX_PATH_LENGTH,
  phpVersion: MAX_NAME_LENGTH,
  activeEnvironment: MAX_NAME_LENGTH,
  notes: MAX_NOTES_LENGTH
} as const

const ENVIRONMENT_STRING_FIELDS = {
  hostname: MAX_NAME_LENGTH,
  sshPort: MAX_NAME_LENGTH,
  username: MAX_NAME_LENGTH,
  rootPath: MAX_PATH_LENGTH,
  liveDomain: MAX_NAME_LENGTH,
  deployCommand: MAX_PATH_LENGTH,
  themeDistPath: MAX_PATH_LENGTH
} as const

const ENVIRONMENT_BOOLEAN_FIELDS = [
  'exportDatabase',
  'exportFiles',
  'wpSearchReplace',
  'wpUploadRewrite',
  'gitPullOnServer',
  'clearServerCache',
  'deployThemes'
] as const

/**
 * A partial Site update. `id`, `path`, `repoId`, and `environments` are deliberately not
 * updatable here — identity moves and environment mutation have their own channels so the
 * secret files that are keyed on them stay consistent.
 */
export function isSitePatch(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key in SITE_STRING_FIELDS) {
      if (!isBoundedString(entry, SITE_STRING_FIELDS[key as keyof typeof SITE_STRING_FIELDS])) {
        return false
      }
      continue
    }
    if (key === 'localStack') {
      if (!isLocalStack(entry)) {
        return false
      }
      continue
    }
    if (key === 'dbPort') {
      if (
        entry !== null &&
        !(typeof entry === 'number' && Number.isInteger(entry) && entry > 0 && entry <= MAX_DB_PORT)
      ) {
        return false
      }
      continue
    }
    if (key === 'searchReplaceTimeoutSeconds') {
      if (
        typeof entry !== 'number' ||
        !Number.isInteger(entry) ||
        entry < 0 ||
        entry > MAX_TIMEOUT_SECONDS
      ) {
        return false
      }
      continue
    }
    if (key === 'customSteps') {
      if (!isSiteCustomStepArray(entry)) {
        return false
      }
      continue
    }
    return false
  }
  return true
}

export function isSiteEnvironmentPatch(value: unknown): value is Partial<SiteEnvironment> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key in ENVIRONMENT_STRING_FIELDS) {
      if (
        !isBoundedString(
          entry,
          ENVIRONMENT_STRING_FIELDS[key as keyof typeof ENVIRONMENT_STRING_FIELDS]
        )
      ) {
        return false
      }
      continue
    }
    if (key === 'liveDomainProtocol') {
      if (entry !== 'http' && entry !== 'https') {
        return false
      }
      continue
    }
    if ((ENVIRONMENT_BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      if (typeof entry !== 'boolean') {
        return false
      }
      continue
    }
    return false
  }
  return true
}

/**
 * A custom step array, as sent by the renderer editor or the MCP tools. Bounded like every other
 * persisted string, and unknown keys are rejected so a malformed record cannot reach the runner
 * that will hand `command` to a shell.
 */
export function isSiteCustomStepArray(value: unknown): value is SiteCustomStep[] {
  if (!Array.isArray(value) || value.length > MAX_CUSTOM_STEPS) {
    return false
  }
  return value.every((entry) => isSiteCustomStep(entry))
}

function isSiteCustomStep(value: unknown): value is SiteCustomStep {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const step = value as Record<string, unknown>
  for (const key of Object.keys(step)) {
    if (!CUSTOM_STEP_KEYS.has(key)) {
      return false
    }
  }
  if (!isBoundedString(step.id, MAX_NAME_LENGTH) || step.id.trim().length === 0) {
    return false
  }
  if (!isBoundedString(step.name, MAX_NAME_LENGTH) || step.name.trim().length === 0) {
    return false
  }
  if (step.description !== undefined && !isBoundedString(step.description, MAX_NOTES_LENGTH)) {
    return false
  }
  if (step.group !== 'import' && step.group !== 'deploy') {
    return false
  }
  if (step.runsOn !== 'remote' && step.runsOn !== 'local') {
    return false
  }
  if (step.position !== 'before' && step.position !== 'after') {
    return false
  }
  if (!isBoundedString(step.command, MAX_COMMAND_LENGTH)) {
    return false
  }
  if (step.scriptPath !== undefined && !isSafeCustomStepScriptPath(step.scriptPath)) {
    return false
  }
  if (
    step.scriptContents !== undefined &&
    !isBoundedString(step.scriptContents, MAX_SCRIPT_CONTENTS_LENGTH)
  ) {
    return false
  }
  // Exactly one source of work. Neither would run an empty shell string and "succeed", reading as
  // a step that silently does nothing; both would leave which one wins up to the runner.
  const hasCommand = step.command.trim().length > 0
  const hasScript = typeof step.scriptPath === 'string' && step.scriptPath.trim().length > 0
  if (hasCommand === hasScript) {
    return false
  }
  if (typeof step.order !== 'number' || !Number.isInteger(step.order) || step.order < 0) {
    return false
  }
  if (typeof step.enabled !== 'boolean') {
    return false
  }
  return step.origin === undefined || isCustomStepOrigin(step.origin)
}

function isCustomStepOrigin(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const origin = value as Record<string, unknown>
  if (origin.kind === 'copied') {
    return isBoundedString(origin.fromSiteId, MAX_NAME_LENGTH)
  }
  if (origin.kind === 'library') {
    return isBoundedString(origin.libraryId, MAX_NAME_LENGTH)
  }
  return false
}
