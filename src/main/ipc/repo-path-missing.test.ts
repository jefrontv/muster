import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Repo } from '../../shared/types'
import { withPathMissing } from './repo-path-missing'

function repo(overrides: Partial<Repo>): Repo {
  return {
    id: 'r',
    path: '/nope',
    displayName: 'r',
    badgeColor: '',
    addedAt: 0,
    ...overrides
  } as Repo
}

describe('withPathMissing', () => {
  it('flags a local repo whose folder is gone and leaves present and remote ones alone', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'repo-present-'))
    try {
      const [present, gone, remote] = withPathMissing([
        repo({ id: 'present', path: dir }),
        repo({ id: 'gone', path: path.join(dir, 'deleted') }),
        repo({ id: 'remote', path: '/srv/site', connectionId: 'ssh-1' })
      ])
      expect(present.pathMissing).toBeUndefined()
      expect(gone.pathMissing).toBe(true)
      expect(remote.pathMissing).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
