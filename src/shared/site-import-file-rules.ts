// Per-site rules for what a file import copies, and the large items the pre-copy check flags.
//
// Paths are POSIX and relative to the server's webroot (`wp-content/ai1wm-backups`), the same
// frame the import's zip step walks, so one rule reads the same on every environment.

/** `skip` leaves it on the server; `keep` imports it without asking again. */
export type SiteImportFileRuleAction = 'skip' | 'keep'

export type SiteImportFileRule = {
  path: string
  action: SiteImportFileRuleAction
}

/** A file or top-level folder the check found over its size threshold. */
export type SiteImportLargeEntry = {
  path: string
  kind: 'file' | 'folder'
  bytes: number
}

/** Shown in Muster while an import waits on the user's choice. */
export type SiteImportLargeFilesPrompt = {
  promptId: string
  runId: string
  siteId: string
  siteName: string
  environment: string
  entries: SiteImportLargeEntry[]
}

export type SiteImportLargeFilesAnswer = {
  skip: string[]
  /** Saves the choice as rules, so later imports neither copy nor ask about these again. */
  remember: boolean
}

export const LARGE_IMPORT_FILE_BYTES = 100 * 1024 * 1024
export const LARGE_IMPORT_FOLDER_BYTES = 500 * 1024 * 1024
export const MAX_IMPORT_FILE_RULES = 200
const MAX_RULE_PATH_LENGTH = 1024

export function formatImportSize(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

/** A clean relative path, or null when it is empty, escapes the webroot, or holds control characters. */
export function normalizeImportRulePath(raw: string): string | null {
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (raw.length > MAX_RULE_PATH_LENGTH || /[\u0000-\u001f\u007f]/.test(raw)) {
    return null
  }
  const segments = raw
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
  if (segments.length === 0 || segments.includes('..')) {
    return null
  }
  return segments.join('/')
}

export function isSiteImportFileRuleArray(value: unknown): value is SiteImportFileRule[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_IMPORT_FILE_RULES &&
    value.every(
      (rule) =>
        typeof rule === 'object' &&
        rule !== null &&
        typeof (rule as SiteImportFileRule).path === 'string' &&
        normalizeImportRulePath((rule as SiteImportFileRule).path) ===
          (rule as SiteImportFileRule).path &&
        ((rule as SiteImportFileRule).action === 'skip' ||
          (rule as SiteImportFileRule).action === 'keep')
    )
  )
}

/** True when `path` is `rulePath` or sits inside it. */
export function importPathCovers(rulePath: string, path: string): boolean {
  return path === rulePath || path.startsWith(`${rulePath}/`)
}

/** Adds or replaces rules by path; a later rule for the same path wins. */
export function mergeImportFileRules(
  current: readonly SiteImportFileRule[],
  added: readonly SiteImportFileRule[]
): SiteImportFileRule[] {
  const byPath = new Map(current.map((rule) => [rule.path, rule]))
  for (const rule of added) {
    byPath.delete(rule.path)
    byPath.set(rule.path, rule)
  }
  return [...byPath.values()].slice(-MAX_IMPORT_FILE_RULES)
}
