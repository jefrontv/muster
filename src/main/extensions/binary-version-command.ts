// Reads a version by asking the program, for the installs that record it nowhere on disk.
//
// `probeBinary` covers pipx and npm by reading metadata, which is free and safe. A compiled binary
// has neither: Agent Local installed by Homebrew or by its own script is one file with no manifest
// beside it, so every such entry read as "Version unknown" no matter what `agent-local version`
// would have said. The catalog has carried `versionArgs` for exactly this since the start; nothing
// ran it.
//
// Running a program to ask its version is the cost `probeBinary` was written to avoid, and the
// reason it avoided it holds: the inventory rescans on window focus. So this is cached against the
// executable's own identity — path, size and mtime — which changes precisely when an update lands.
// A rescan after an install re-reads; a rescan because someone alt-tabbed does not.

import { statSync } from 'node:fs'
import { streamCommand } from '../lib/stream-command'

const VERSION_TIMEOUT_MS = 3_000
const MAX_VERSION_BYTES = 16 * 1024

export type BinaryVersionCommandEnv = {
  run: (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>
  /** Identity of the file on disk, or null when it cannot be read. Drives the cache key. */
  fingerprint: (path: string) => string | null
}

export function createDefaultBinaryVersionCommandEnv(): BinaryVersionCommandEnv {
  return {
    run: async (command, args) => {
      const result = await streamCommand(command, [...args], {
        timeoutMs: VERSION_TIMEOUT_MS,
        maxBytes: MAX_VERSION_BYTES
      })
      return { stdout: result.stdout, stderr: result.stderr }
    },
    fingerprint: (path) => {
      try {
        const stat = statSync(path)
        return `${stat.size}:${stat.mtimeMs}`
      } catch {
        return null
      }
    }
  }
}

/**
 * The first dotted number in the output, `v` prefix dropped.
 *
 * Deliberately loose. `agent-local version` answers `agent-local 0.34.1` over three lines, npm-style
 * tools answer a bare `1.2.3`, and others prefix a name or suffix a commit; a strict full-line match
 * would fail on all but one of those. Anchored on a word boundary so a path like `/opt/v2/bin` in a
 * banner line cannot be mistaken for a version.
 */
export function parseVersionOutput(output: string): string | null {
  const match = /\bv?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)/.exec(output)
  return match?.[1] ?? null
}

const cache = new Map<string, string | null>()

/** Test seam. The cache is process-wide, so a test that did not clear it would leak into the next. */
export function clearBinaryVersionCache(): void {
  cache.clear()
}

/**
 * Null when there is nothing to ask, when the program does not answer, or when its answer carries no
 * version. Every one of those means "could not check", and the caller already renders that honestly.
 */
export async function readVersionByCommand(
  path: string,
  versionArgs: readonly string[] | undefined,
  env: BinaryVersionCommandEnv = createDefaultBinaryVersionCommandEnv()
): Promise<string | null> {
  if (!versionArgs || versionArgs.length === 0) {
    return null
  }
  const fingerprint = env.fingerprint(path)
  const key = `${path}\u0000${versionArgs.join(' ')}\u0000${fingerprint ?? 'unknown'}`
  if (fingerprint !== null && cache.has(key)) {
    return cache.get(key) ?? null
  }
  let version: string | null = null
  try {
    const result = await env.run(path, versionArgs)
    // stderr as well as stdout: plenty of tools print their version banner to stderr, and a probe
    // that only reads stdout reports those as unversioned.
    version = parseVersionOutput(result.stdout) ?? parseVersionOutput(result.stderr)
  } catch {
    version = null
  }
  if (fingerprint !== null) {
    cache.set(key, version)
  }
  return version
}
