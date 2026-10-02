// Where `wp eval-file` payloads live on the host and how WP-CLI names them. A DDEV container cannot
// see the host's temp folder, so its files go inside the project, which is mounted (or synced) in.

import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { SiteLocalStack } from '../../shared/site-types'
import { resolveDdevWpCli, toDdevContainerPath } from './local-wp-cli-command'

const DDEV_EVAL_DIRECTORY = '.muster-eval'

export function evalFileNames(): { phpName: string; jsonName: string } {
  const id = randomUUID()
  return { phpName: `muster-eval-${id}.php`, jsonName: `muster-eval-${id}.json` }
}

/** Host paths we write, and the paths WP-CLI is given (container paths for DDEV). */
export type LocalEvalFiles = {
  phpPath: string
  jsonPath: string
  cliPhpPath: string
  cliJsonPath: string
  /** Removed after the run when it is ours and empty; null for the shared system temp folder. */
  ownedDir: string | null
}

export function localEvalFiles(localStack: SiteLocalStack, wpDir: string): LocalEvalFiles {
  const { phpName, jsonName } = evalFileNames()
  if (localStack !== 'ddev') {
    const phpPath = path.join(tmpdir(), phpName)
    const jsonPath = path.join(tmpdir(), jsonName)
    return {
      phpPath,
      jsonPath,
      cliPhpPath: phpPath,
      cliJsonPath: jsonPath,
      ownedDir: null
    }
  }
  const { projectRoot } = resolveDdevWpCli(wpDir)
  const hostDir = path.join(projectRoot, '.ddev', DDEV_EVAL_DIRECTORY)
  const phpPath = path.join(hostDir, phpName)
  const jsonPath = path.join(hostDir, jsonName)
  return {
    phpPath,
    jsonPath,
    cliPhpPath: toDdevContainerPath(projectRoot, phpPath),
    cliJsonPath: toDdevContainerPath(projectRoot, jsonPath),
    ownedDir: hostDir
  }
}
