// A project whose folder was deleted keeps its record (it may be on an unplugged drive), but the
// sidebar and search must not offer it. Only local repos can be checked from here.

import { existsSync } from 'node:fs'
import type { Repo } from '../../shared/types'

function isLocalRepo(repo: Repo): boolean {
  return !repo.connectionId && (!repo.executionHostId || repo.executionHostId === 'local')
}

export function withPathMissing(repos: readonly Repo[]): Repo[] {
  return repos.map((repo) =>
    isLocalRepo(repo) && !existsSync(repo.path) ? { ...repo, pathMissing: true } : repo
  )
}
