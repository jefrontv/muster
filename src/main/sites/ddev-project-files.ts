// What a DDEV project says about itself on disk: `.ddev/config.yaml` with its overrides, and the
// global settings a URL is built from. Read-only, and none of it needs Docker.

import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { DdevHost } from './ddev-host'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

export type DdevProjectConfig = {
  /** The folder holding `.ddev/`. */
  root: string
  name: string
  type: string
  /** Relative to `root`, '' when the root is the docroot. */
  docroot: string
  phpVersion: string
  /** Set when the project pins its host database port. */
  hostDbPort: number | null
}

/**
 * The folder holding `.ddev/config.yaml`, at or above `startPath`, stopping at the home folder.
 * A repo root sits above the docroot (`site/` vs `site/app/public`), so both shapes resolve.
 */
export async function locateDdevProjectRoot(
  host: Pick<DdevHost, 'pathExists' | 'homeDir'>,
  startPath: string
): Promise<string | null> {
  let current = path.resolve(startPath)
  const stopAt = path.resolve(host.homeDir)
  for (;;) {
    if (await host.pathExists(path.join(current, '.ddev', 'config.yaml'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current || current === stopAt) {
      return null
    }
    current = parent
  }
}

/**
 * `config.yaml` with `config.*.yaml` merged over it in name order, as DDEV does, so a worktree's
 * gitignored `config.local.yaml` name override is the name we report.
 */
export async function readDdevProjectConfig(
  host: Pick<DdevHost, 'readText'> & { listDdevDirectory?: (dir: string) => Promise<string[]> },
  root: string
): Promise<DdevProjectConfig | null> {
  const base = await host.readText(path.join(root, '.ddev', 'config.yaml'))
  if (base === null) {
    return null
  }
  const list = host.listDdevDirectory ?? listDirectory
  const overrides = (await list(path.join(root, '.ddev')))
    .filter((entry) => /^config\..+\.ya?ml$/.test(entry))
    .sort()
  let merged: Record<string, unknown> = {}
  for (const text of [
    base,
    ...(await Promise.all(overrides.map((entry) => host.readText(path.join(root, '.ddev', entry)))))
  ]) {
    if (!text) {
      continue
    }
    try {
      merged = { ...merged, ...asRecord(parseYaml(text)) }
    } catch {
      // An unparseable override is DDEV's to report on start; the base still describes the project.
    }
  }
  const hostDbPort = Number.parseInt(readString(merged, 'host_db_port'), 10)
  return {
    root,
    // DDEV names an unnamed project after its folder.
    name: readString(merged, 'name') || path.basename(root),
    type: readString(merged, 'type'),
    docroot: readString(merged, 'docroot'),
    phpVersion: readString(merged, 'php_version'),
    hostDbPort: Number.isFinite(hostDbPort) ? hostDbPort : null
  }
}

async function listDirectory(directory: string): Promise<string[]> {
  try {
    return await readdir(directory)
  } catch {
    return []
  }
}

/** The global settings Muster reads (never writes): the TLD and router ports a URL is built from. */
export type DdevGlobalConfig = { projectTld: string; routerHttpsPort: string }

export async function readDdevGlobalConfig(
  host: Pick<DdevHost, 'readText' | 'homeDir'>
): Promise<DdevGlobalConfig> {
  const text = await host.readText(path.join(host.homeDir, '.ddev', 'global_config.yaml'))
  let record: Record<string, unknown> = {}
  try {
    record = text ? asRecord(parseYaml(text)) : {}
  } catch {
    record = {}
  }
  return {
    projectTld: readString(record, 'project_tld') || 'ddev.site',
    routerHttpsPort: readString(record, 'router_https_port') || '443'
  }
}
