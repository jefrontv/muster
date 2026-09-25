// Bounds for site and environment fields, shared by every write path (settings IPC and the site
// MCP tools) so an agent cannot store what the settings screen would refuse.

export const SITE_MAX_PATH_LENGTH = 4_096
export const SITE_MAX_NAME_LENGTH = 256
export const SITE_MAX_NOTES_LENGTH = 16_384
export const SITE_MAX_TIMEOUT_SECONDS = 86_400
export const SITE_MAX_DB_PORT = 65_535
export const SITE_DEFAULT_SEARCH_REPLACE_TIMEOUT_SECONDS = 600

export const SITE_STRING_FIELD_LIMITS = {
  displayName: SITE_MAX_NAME_LENGTH,
  localWpRoot: SITE_MAX_PATH_LENGTH,
  localDomain: SITE_MAX_NAME_LENGTH,
  dbUser: SITE_MAX_NAME_LENGTH,
  dbSocket: SITE_MAX_PATH_LENGTH,
  phpVersion: SITE_MAX_NAME_LENGTH,
  activeEnvironment: SITE_MAX_NAME_LENGTH,
  notes: SITE_MAX_NOTES_LENGTH
} as const

export const ENVIRONMENT_STRING_FIELD_LIMITS = {
  hostname: SITE_MAX_NAME_LENGTH,
  sshPort: SITE_MAX_NAME_LENGTH,
  username: SITE_MAX_NAME_LENGTH,
  rootPath: SITE_MAX_PATH_LENGTH,
  liveDomain: SITE_MAX_NAME_LENGTH,
  deployCommand: SITE_MAX_PATH_LENGTH,
  themeDistPath: SITE_MAX_PATH_LENGTH
} as const
