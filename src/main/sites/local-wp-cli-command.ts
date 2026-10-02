// Which process a local WP-CLI call spawns: the Mac's own `wp`, or `ddev wp` inside the web
// container. DDEV's wp-config only reaches its database from inside Docker (DB_HOST is a container
// name), so a host `wp` against a DDEV site fails or, worse, hits another stack's database.

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SiteLocalStack } from '../../shared/site-types'
import { probeBinary } from '../extensions/binary-probe'

export type LocalWpCliSpawn = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

const WP_BINARY = 'wp'
/** Where DDEV mounts the project root inside the web container. */
export const DDEV_CONTAINER_APPROOT = '/var/www/html'

/** Finds the DDEV project root (folder holding .ddev/config.yaml) at or above wpDir; null if none. */
export function findDdevProjectRoot(wpDir: string): string | null {
  let current = path.resolve(wpDir)
  for (;;) {
    if (existsSync(path.join(current, '.ddev', 'config.yaml'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

/** Host path under projectRoot -> /var/www/html/<relative, posix>. Throws on a path outside the project. */
export function toDdevContainerPath(projectRoot: string, hostPath: string): string {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(hostPath))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${hostPath} is outside the DDEV project at ${projectRoot}.`)
  }
  const segments = relative.split(path.sep).filter(Boolean)
  return path.posix.join(DDEV_CONTAINER_APPROOT, ...segments)
}

/** Resolves the DDEV project root and binary, with the message a user can act on when either is missing. */
export function resolveDdevWpCli(wpDir: string): { projectRoot: string; ddevBinary: string } {
  const ddevBinary = probeBinary('ddev').path
  if (!ddevBinary) {
    throw new Error('DDEV is not installed, so `ddev wp` cannot run for this site.')
  }
  const projectRoot = findDdevProjectRoot(wpDir)
  if (!projectRoot) {
    throw new Error(`No DDEV project (.ddev/config.yaml) found at or above ${wpDir}.`)
  }
  return { projectRoot, ddevBinary }
}

/**
 * localStack 'ddev': `ddev wp …` from the project root (it adds --path=$DDEV_DOCROOT itself).
 * Any other stack: the host `wp` in wpDir, with whatever env the caller already built.
 */
export function buildLocalWpCliSpawn(input: {
  localStack: SiteLocalStack
  wpDir: string
  args: readonly string[]
  env: NodeJS.ProcessEnv
}): LocalWpCliSpawn {
  if (input.localStack !== 'ddev') {
    return { command: WP_BINARY, args: [...input.args], cwd: input.wpDir, env: input.env }
  }
  const { projectRoot, ddevBinary } = resolveDdevWpCli(input.wpDir)
  return { command: ddevBinary, args: [WP_BINARY, ...input.args], cwd: projectRoot, env: input.env }
}

/** The plain-language failure for a `ddev wp` that could not be spawned. */
export function ddevWpCliSpawnError(projectRoot: string, detail: string): string {
  return `DDEV's \`ddev wp\` could not be run in ${projectRoot}: ${detail}. Is Docker running and the project started?`
}
