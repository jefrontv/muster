// Per-environment edits, applied by whichever process holds the live site.
//
// Why not a whole `environments` map: the MCP process reads the site from disk, which trails the
// GUI's debounced save. A map built from that read put back whatever the GUI had not saved yet, so
// two quick edits to one environment reverted the first. A patch names only what it changes.

import type { SiteEnvironment } from '../../shared/site-types'

export type SiteEnvironmentPatch =
  | { merge: Partial<SiteEnvironment> }
  | { create: SiteEnvironment }
  /** Renames the environment named here to this patch's key, keeping its place and fields. */
  | { rename: string }
  | { remove: true }

/** Keyed by environment name; for `rename`, keyed by the new name. */
export type SiteEnvironmentPatches = Record<string, SiteEnvironmentPatch>

export class SiteEnvironmentPatchError extends Error {}

export function applyEnvironmentPatches(
  current: Readonly<Record<string, SiteEnvironment>>,
  patches: SiteEnvironmentPatches
): Record<string, SiteEnvironment> {
  let next: Record<string, SiteEnvironment> = { ...current }
  for (const [name, patch] of Object.entries(patches)) {
    if ('remove' in patch) {
      delete next[name]
    } else if ('create' in patch) {
      if (Object.hasOwn(next, name)) {
        throw new SiteEnvironmentPatchError(`Environment '${name}' already exists.`)
      }
      next[name] = { ...patch.create }
    } else if ('rename' in patch) {
      if (!Object.hasOwn(next, patch.rename)) {
        throw new SiteEnvironmentPatchError(`Environment '${patch.rename}' no longer exists.`)
      }
      if (patch.rename !== name && Object.hasOwn(next, name)) {
        throw new SiteEnvironmentPatchError(`Environment '${name}' already exists.`)
      }
      // Rebuilt by iteration so the environment keeps its position.
      const renamed: Record<string, SiteEnvironment> = {}
      for (const [key, environment] of Object.entries(next)) {
        renamed[key === patch.rename ? name : key] = environment
      }
      next = renamed
    } else {
      const base = next[name]
      if (!base) {
        // Deleted since the caller read it: merging would resurrect a half-empty environment.
        throw new SiteEnvironmentPatchError(`Environment '${name}' no longer exists.`)
      }
      next[name] = { ...base, ...patch.merge }
    }
  }
  return next
}
