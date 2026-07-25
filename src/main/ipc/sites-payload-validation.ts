// Hand-written bounded guards for renderer→main site payloads, following the house pattern in
// dashboard-payload-validation.ts (zod is not used at this boundary). Every field is length-capped
// so a compromised renderer cannot push a multi-megabyte string into orca-data.json, and unknown
// keys are rejected outright rather than merged into a persisted record.

import type { SiteEnvironment, SiteLocalStack } from '../../shared/site-types'

const MAX_PATH_LENGTH = 4_096
const MAX_NAME_LENGTH = 256
const MAX_NOTES_LENGTH = 16_384
const MAX_TIMEOUT_SECONDS = 86_400
const MAX_DB_PORT = 65_535

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
  return value === 'plain' || value === 'mamp' || value === 'localwp'
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
