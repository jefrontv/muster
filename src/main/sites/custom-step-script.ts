// Locating and moving a custom step's script file.
//
// Shared by the runner (reads it to upload or execute) and the MCP library tools (embed on promote,
// write on install) so one containment rule governs every path that reaches a shell.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { isSafeCustomStepScriptPath } from '../../shared/site-types'

/**
 * Absolute path inside `root`, or null when the path is unsafe or escapes.
 *
 * Two checks: the shared guard rejects the obvious escapes on the raw string, and the resolved
 * result is re-tested against the root so an oddly-normalised path cannot land outside either.
 * Returns null rather than throwing because callers raise different error types.
 */
export function resolveScriptWithin(root: string, scriptPath: string): string | null {
  if (!isSafeCustomStepScriptPath(scriptPath)) {
    return null
  }
  const base = resolve(root)
  const absolute = resolve(base, scriptPath)
  if (absolute !== base && !absolute.startsWith(`${base}${sep}`)) {
    return null
  }
  return absolute
}

/** Reads a step's script, or null when it is not there. */
export async function readScriptWithin(root: string, scriptPath: string): Promise<string | null> {
  const absolute = resolveScriptWithin(root, scriptPath)
  if (!absolute) {
    return null
  }
  try {
    return await readFile(absolute, 'utf8')
  } catch {
    return null
  }
}

export type ScriptWriteOutcome = 'written' | 'identical' | 'conflict' | 'unsafe'

/**
 * Writes a script into a checkout, creating parent directories.
 *
 * Never clobbers: an existing file with different contents is a conflict the caller must report,
 * because silently overwriting someone's script during a library install is unrecoverable.
 */
export async function writeScriptWithin(
  root: string,
  scriptPath: string,
  contents: string
): Promise<ScriptWriteOutcome> {
  const absolute = resolveScriptWithin(root, scriptPath)
  if (!absolute) {
    return 'unsafe'
  }
  const existing = await readFile(absolute, 'utf8').catch(() => null)
  if (existing !== null) {
    return existing === contents ? 'identical' : 'conflict'
  }
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, contents, 'utf8')
  return 'written'
}
