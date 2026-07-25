// Node version pinning for theme builds, ported from ocsites' node_version.py.
//
// `engines.node` is a semver range but `nvm use` takes a version, so the range is reduced to its
// first numeric run: '>=20' -> '20', '^18.12.0' -> '18.12.0'.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const NUMERIC_VERSION_PATTERN = /\d+(?:\.\d+)*/

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

/** Pinned Node version from raw package.json text. Null when absent, non-string, or unparseable. */
export function readNodeVersionFromPackageJson(contents: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    return null
  }
  const requested = asRecord(asRecord(parsed)?.engines)?.node
  if (typeof requested !== 'string') {
    return null
  }
  return NUMERIC_VERSION_PATTERN.exec(requested)?.[0] ?? null
}

/**
 * Pinned Node version from `<directory>/package.json`. `directory` is the build root — for
 * ocsites-managed sites that is the WordPress root, which is where the theme's build scripts live.
 */
export async function resolvePinnedNodeVersion(directory: string): Promise<string | null> {
  let contents: string
  try {
    contents = await readFile(path.join(directory, 'package.json'), 'utf8')
  } catch {
    return null
  }
  return readNodeVersionFromPackageJson(contents)
}
