// The settable surface of a site, as agents see it.
//
// ocsites kept one flat preset; Muster splits the same data across Site (local) and
// SiteEnvironment (remote). This table is the single mapping between the two, used by both
// get_deployment_config (read) and set_deployment_fields (write) so the two can never drift.
//
// Wire keys stay ocsites' snake_case so existing agent prompts keep working, and camelCase is
// accepted as an alias because Muster's own docs use the TypeScript property names.
//
// Passwords are absent by construction: SiteEnvironment has no password property, so there is no
// key an agent could write. PASSWORD_FIELD_KEYS exists only to turn "unknown key" into an explicit
// refusal, which is a far better signal to a model than a generic validation error.

import {
  SITE_DEPLOY_TOGGLES,
  SITE_IMPORT_TOGGLES,
  SITE_LOCAL_STACKS,
  type Site,
  type SiteEnvironment,
  type SiteToggleKey
} from '../../../shared/site-types'
import {
  ENVIRONMENT_STRING_FIELD_LIMITS,
  SITE_DEFAULT_SEARCH_REPLACE_TIMEOUT_SECONDS,
  SITE_MAX_DB_PORT,
  SITE_MAX_PATH_LENGTH,
  SITE_MAX_TIMEOUT_SECONDS,
  SITE_STRING_FIELD_LIMITS
} from '../../../shared/site-field-limits'
import { SiteMcpToolError } from './site-mcp-arguments'

/** The settings screen's own bounds: a copy here is how agent writes drifted from it. */
const FIELD_LENGTH_LIMITS: Readonly<Record<string, number>> = {
  ...SITE_STRING_FIELD_LIMITS,
  ...ENVIRONMENT_STRING_FIELD_LIMITS
}

export type SiteMcpFieldTarget = 'site' | 'environment'

export type SiteMcpField = {
  /** ocsites wire key. */
  key: string
  target: SiteMcpFieldTarget
  property: keyof Site | keyof SiteEnvironment
  description: string
  kind: 'string' | 'number' | 'enum' | 'boolean'
  choices?: readonly string[]
}

export const SITE_MCP_FIELDS: readonly SiteMcpField[] = [
  {
    key: 'hostname',
    target: 'environment',
    property: 'hostname',
    description: 'SSH hostname',
    kind: 'string'
  },
  {
    key: 'ssh_port',
    target: 'environment',
    property: 'sshPort',
    description: 'SSH port (blank uses 22)',
    kind: 'string'
  },
  {
    key: 'username',
    target: 'environment',
    property: 'username',
    description: 'SSH username',
    kind: 'string'
  },
  {
    key: 'use_ssh_key',
    target: 'environment',
    property: 'sshUseAgent',
    description: 'Authenticate with your SSH agent/keys instead of a stored password',
    kind: 'boolean'
  },
  {
    key: 'root_path',
    target: 'environment',
    property: 'rootPath',
    description: 'Remote WP root path',
    kind: 'string'
  },
  {
    key: 'live_domain',
    target: 'environment',
    property: 'liveDomain',
    description: 'Live domain',
    kind: 'string'
  },
  {
    key: 'live_domain_protocol',
    target: 'environment',
    property: 'liveDomainProtocol',
    description: 'Live domain protocol',
    kind: 'enum',
    choices: ['http', 'https']
  },
  {
    key: 'deploy_command',
    target: 'environment',
    property: 'deployCommand',
    description: 'Theme build command',
    kind: 'string'
  },
  {
    key: 'theme_dist_path',
    target: 'environment',
    property: 'themeDistPath',
    description: 'Theme dist path',
    kind: 'string'
  },
  {
    key: 'display_name',
    target: 'site',
    property: 'displayName',
    description: 'Site display name',
    kind: 'string'
  },
  {
    key: 'local_domain',
    target: 'site',
    property: 'localDomain',
    description: 'Local domain',
    kind: 'string'
  },
  {
    key: 'local_wp_root',
    target: 'site',
    property: 'localWpRoot',
    description: 'WP root subpath (LocalWP)',
    kind: 'string'
  },
  {
    key: 'local_stack',
    target: 'site',
    property: 'localStack',
    description: 'Local stack',
    kind: 'enum',
    // The app's own list: a copy here left agents unable to pick agent-local (muster#30).
    choices: SITE_LOCAL_STACKS
  },
  {
    key: 'db_user',
    target: 'site',
    property: 'dbUser',
    description: 'Local DB user',
    kind: 'string'
  },
  {
    key: 'db_socket',
    target: 'site',
    property: 'dbSocket',
    description: 'MySQL socket (LocalWP)',
    kind: 'string'
  },
  {
    key: 'db_port',
    target: 'site',
    property: 'dbPort',
    description: 'Local MySQL TCP port',
    kind: 'number'
  },
  {
    key: 'php_version',
    target: 'site',
    property: 'phpVersion',
    description: 'PHP version',
    kind: 'string'
  },
  { key: 'notes', target: 'site', property: 'notes', description: 'Notes', kind: 'string' },
  {
    key: 'search_replace_timeout_seconds',
    target: 'site',
    property: 'searchReplaceTimeoutSeconds',
    description: `wp search-replace timeout in seconds, 0-${SITE_MAX_TIMEOUT_SECONDS} (0 disables; blank restores ${SITE_DEFAULT_SEARCH_REPLACE_TIMEOUT_SECONDS})`,
    kind: 'number'
  }
]

/** Not settable and not readable. Named only so the refusal is explicit rather than "unknown key". */
export const PASSWORD_FIELD_KEYS: readonly string[] = [
  'password',
  'db_password',
  'ssh_password',
  'passwords',
  'secret'
]

// Map, not Record: the lookup key is agent-supplied, and a plain object would resolve
// 'constructor' or 'toString' to an inherited value and accept them as valid keys.
const FIELDS_BY_KEY = new Map(SITE_MCP_FIELDS.map((field) => [field.key, field]))

const TOGGLES_BY_KEY = new Map<string, SiteToggleKey>(
  [...SITE_IMPORT_TOGGLES, ...SITE_DEPLOY_TOGGLES].map((toggle) => [
    canonicalKey(toggle.key),
    toggle.key
  ])
)

/** camelCase → snake_case, so `rootPath` and `root_path` name the same field. */
export function canonicalKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export function resolveToggleKey(key: string): SiteToggleKey | null {
  return TOGGLES_BY_KEY.get(canonicalKey(key)) ?? null
}

export function readFieldValues(
  site: Site,
  environment: SiteEnvironment | null
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of SITE_MCP_FIELDS) {
    if (field.target === 'site') {
      values[field.key] = site[field.property as keyof Site]
      continue
    }
    const value = environment ? environment[field.property as keyof SiteEnvironment] : ''
    // An environment saved before a boolean field existed reads as false, never undefined.
    values[field.key] = field.kind === 'boolean' ? value === true : value
  }
  return values
}

export type SiteMcpFieldPatches = {
  sitePatch: Partial<Site>
  environmentPatch: Partial<SiteEnvironment>
}

/**
 * Validate every key before applying any of them — ocsites' all-or-nothing contract, so a typo in
 * one field cannot half-apply a config change the agent believes was rejected.
 */
export function buildFieldPatches(fields: Record<string, unknown>): SiteMcpFieldPatches {
  const refused = Object.keys(fields).filter((key) =>
    PASSWORD_FIELD_KEYS.includes(canonicalKey(key))
  )
  if (refused.length > 0) {
    throw new SiteMcpToolError(
      `Refusing to set password fields over MCP: ${refused.sort().join(', ')}. Set these in Muster's site settings so they are encrypted with the OS keychain.`,
      { refused_keys: refused.sort() }
    )
  }
  const resolved: { field: SiteMcpField; raw: unknown }[] = []
  const unknown: string[] = []
  for (const [key, raw] of Object.entries(fields)) {
    const field = FIELDS_BY_KEY.get(canonicalKey(key))
    if (field) {
      resolved.push({ field, raw })
    } else {
      unknown.push(key)
    }
  }
  if (unknown.length > 0) {
    throw new SiteMcpToolError(`Unknown field keys: ${unknown.sort().join(', ')}`, {
      valid_keys: SITE_MCP_FIELDS.map((field) => field.key)
    })
  }

  const patches: SiteMcpFieldPatches = { sitePatch: {}, environmentPatch: {} }
  for (const { field, raw } of resolved) {
    const target = field.target === 'site' ? patches.sitePatch : patches.environmentPatch
    Reflect.set(target, field.property, coerceFieldValue(field, raw))
  }
  return patches
}

function coerceNumber(field: SiteMcpField, raw: unknown): number | null {
  const isPort = field.key === 'db_port'
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return isPort ? null : SITE_DEFAULT_SEARCH_REPLACE_TIMEOUT_SECONDS
  }
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  const [min, max] = isPort ? [1, SITE_MAX_DB_PORT] : [0, SITE_MAX_TIMEOUT_SECONDS]
  // Refused, not clamped: a clamped 0 reached mysql as the port, and 99999 silently became 65535.
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new SiteMcpToolError(`'${field.key}' must be a whole number from ${min} to ${max}.`)
  }
  return parsed
}

function coerceBoolean(field: SiteMcpField, raw: unknown): boolean {
  if (raw === true || raw === 'true') {
    return true
  }
  if (raw === false || raw === 'false' || raw === null || raw === undefined) {
    return false
  }
  throw new SiteMcpToolError(`'${field.key}' must be true or false.`)
}

function coerceFieldValue(field: SiteMcpField, raw: unknown): string | number | boolean | null {
  if (field.kind === 'number') {
    return coerceNumber(field, raw)
  }
  if (field.kind === 'boolean') {
    return coerceBoolean(field, raw)
  }
  if (raw !== null && raw !== undefined && typeof raw !== 'string' && typeof raw !== 'number') {
    // String({}) stored "[object Object]" and String(true) stored "true".
    throw new SiteMcpToolError(`'${field.key}' must be a string.`)
  }
  const text = raw === null || raw === undefined ? '' : String(raw).trim()
  const limit = FIELD_LENGTH_LIMITS[String(field.property)] ?? SITE_MAX_PATH_LENGTH
  if (text.length > limit) {
    throw new SiteMcpToolError(`'${field.key}' exceeds ${limit} characters.`)
  }
  if (field.kind === 'enum' && field.choices && !field.choices.includes(text)) {
    throw new SiteMcpToolError(`'${field.key}' must be one of: ${field.choices.join(', ')}`)
  }
  // The import's rm and tree-swap steps run inside this subpath; it must stay inside the checkout.
  if (
    field.key === 'local_wp_root' &&
    (text.startsWith('/') || text.split(/[\\/]/).includes('..'))
  ) {
    throw new SiteMcpToolError("'local_wp_root' must be a relative path inside the site folder.")
  }
  return text
}
