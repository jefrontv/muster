// Making an existing wp-config.php defer to DDEV inside its container.
//
// DDEV's settings file defines every constant as `defined(X) || define(X, …)` and DDEV's own
// wp-config.php includes it only when DB_USER is not yet defined. A site's own wp-config.php that
// defines DB_* first therefore wins, and the container connects to the old database. The patch
// loads DDEV's file first (only when IS_DDEV_PROJECT is set) and makes the site's own DB and URL
// constants conditional, so outside DDEV the file behaves exactly as before.

import { execFile } from 'node:child_process'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DDEV_SETTINGS_FILE = 'wp-config-ddev.php'
export const DDEV_WP_CONFIG_BACKUP_SUFFIX = '.muster-backup'

const DEFERRED_CONSTANTS = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'WP_HOME', 'WP_SITEURL']

/** The same guard DDEV writes into its own wp-config.php. */
export const DDEV_INCLUDE_BLOCK = [
  '// Settings managed by DDEV load first inside its container; elsewhere this does nothing.',
  "$ddev_settings = __DIR__ . '/wp-config-ddev.php';",
  "if ( getenv( 'IS_DDEV_PROJECT' ) == 'true' && is_readable( $ddev_settings ) ) {",
  '\trequire_once( $ddev_settings );',
  '}'
].join('\n')

export type DdevWpConfigPatch = { contents: string; deferred: string[]; includeAdded: boolean }

/** Pure: idempotent, and touches only literal `define( 'NAME', …` calls not already guarded. */
export function patchWpConfigForDdev(contents: string): DdevWpConfigPatch {
  let next = contents
  const deferred: string[] = []
  for (const name of DEFERRED_CONSTANTS) {
    const pattern = new RegExp(
      `(^|[;{}\\n])([ \\t]*)(?<!\\|\\|\\s*)define\\(\\s*(['"])${name}\\3\\s*,`,
      'g'
    )
    next = next.replace(pattern, (_match, lead: string, indent: string, quote: string) => {
      deferred.push(name)
      return `${lead}${indent}defined( ${quote}${name}${quote} ) || define( ${quote}${name}${quote},`
    })
  }
  const includeAdded = !next.includes(DDEV_SETTINGS_FILE)
  if (includeAdded) {
    next = next.replace(
      /^(\s*<\?php)[^\n]*\n?/,
      (open) => `${open.trimEnd()}\n\n${DDEV_INCLUDE_BLOCK}\n\n`
    )
  }
  return { contents: next, deferred: [...new Set(deferred)], includeAdded }
}

export type DdevWpConfigOutcome =
  | { action: 'missing' | 'already' }
  | { action: 'patched'; deferred: string[]; backupPath: string }
  | { action: 'tracked'; message: string }

function isTrackedByGit(repoRoot: string, filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repoRoot, 'ls-files', '--error-unmatch', '--', path.relative(repoRoot, filePath)],
      { timeout: 10_000 },
      (error) => resolve(error === null)
    )
  })
}

/**
 * Applies the patch to `<docroot>/wp-config.php`. A missing file is left for `ddev config` to
 * create; a committed one is never edited, because the change would land in every teammate's site.
 */
export async function prepareWpConfigForDdev(
  docroot: string,
  repoRoot: string,
  deps: { isTracked?: (repoRoot: string, filePath: string) => Promise<boolean> } = {}
): Promise<DdevWpConfigOutcome> {
  const wpConfigPath = path.join(docroot, 'wp-config.php')
  let contents: string
  try {
    contents = await readFile(wpConfigPath, 'utf8')
  } catch {
    return { action: 'missing' }
  }
  const patch = patchWpConfigForDdev(contents)
  if (patch.contents === contents) {
    return { action: 'already' }
  }
  if (await (deps.isTracked ?? isTrackedByGit)(repoRoot, wpConfigPath)) {
    return {
      action: 'tracked',
      message:
        'wp-config.php is committed to git, so Muster will not edit it. Add this right after `<?php`, ' +
        `then make the DB_* defines conditional (\`defined( 'DB_NAME' ) || define( … )\`):\n\n${DDEV_INCLUDE_BLOCK}`
    }
  }
  const backupPath = `${wpConfigPath}${DDEV_WP_CONFIG_BACKUP_SUFFIX}`
  await copyFile(wpConfigPath, backupPath)
  await writeFile(wpConfigPath, patch.contents, 'utf8')
  return { action: 'patched', deferred: patch.deferred, backupPath }
}

const DDEV_GENERATED_MARKER = /^[ \t]*\*?[ \t]*#ddev-generated[^\n]*\n/m

/**
 * Pure. DDEV's own wp-config.php sets no prefix and its settings file falls back to `wp_`, so an
 * imported database with another prefix reads as "not installed". The marker goes too: DDEV
 * regenerates a file that still carries it, which would drop the prefix on the next start.
 */
export function setWpConfigTablePrefix(contents: string, prefix: string): string {
  const assignment = `$table_prefix = '${prefix}';`
  const existing = /\$table_prefix\s*=\s*['"][^'"]*['"]\s*;/
  let next = existing.test(contents)
    ? contents.replace(existing, assignment)
    : contents.replace(/^(\s*<\?php[^\n]*\n)/, `$1${assignment}\n`)
  next = next.replace(DDEV_GENERATED_MARKER, '')
  return next
}

/** Writes the server's prefix into `<docroot>/wp-config.php`; a no-op when it already matches. */
export async function syncWpConfigTablePrefix(
  docroot: string,
  prefix: string
): Promise<'updated' | 'unchanged' | 'missing'> {
  if (!/^\w+$/.test(prefix)) {
    return 'unchanged'
  }
  const wpConfigPath = path.join(docroot, 'wp-config.php')
  let contents: string
  try {
    contents = await readFile(wpConfigPath, 'utf8')
  } catch {
    return 'missing'
  }
  const next = setWpConfigTablePrefix(contents, prefix)
  if (next === contents) {
    return 'unchanged'
  }
  await writeFile(wpConfigPath, next, 'utf8')
  return 'updated'
}
