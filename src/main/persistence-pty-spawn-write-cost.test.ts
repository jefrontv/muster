// Regression gate for the durability-journal work: a pty spawn must not pay a
// full-state write to become crash-durable. Before the journal, persistPtyBinding
// called the sync full-state flush, so every spawn serialized the entire profile
// on the main thread (issue #217 fix, at O(state) cost).

import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Store } from './persistence'
import type { Repo, WorktreeMeta } from '../shared/types'

vi.mock('electron', () => ({
  app: {
    getPath: () => mkdtempSync(join(tmpdir(), 'orca-spawn-cost-app-')),
    getName: () => 'orca'
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))

describe('pty spawn durable write cost', () => {
  it('stays proportional to the binding, not the whole profile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-spawn-cost-'))
    const dataFile = join(dir, 'orca-data.json')
    const store = new Store({ dataFile })

    // A profile large enough that an O(state) write is unmistakable.
    for (let r = 0; r < 40; r++) {
      store.addRepo({
        id: `repo-${r}`,
        name: `repo-${r}`,
        path: `/tmp/repo-${r}`,
        defaultBranch: 'main'
      } as unknown as Repo)
      for (let w = 0; w < 10; w++) {
        store.setWorktreeMeta(`repo-${r}::/wt-${w}`, {
          displayName: `workspace ${r}-${w}`,
          comment: 'some comment text that occupies space in the persisted blob'
        } as unknown as WorktreeMeta)
      }
    }
    store.flush()
    const fullStateBytes = statSync(dataFile).size

    const journalFile = join(dir, 'orca-data-journal.ndjson')
    const before = existsSync(journalFile) ? statSync(journalFile).size : 0

    store.persistPtyBinding({
      worktreeId: 'repo-0::/wt-0',
      tabId: 'tab-1',
      leafId: '00000000-0000-4000-8000-000000000001',
      ptyId: 'pty-1'
    })

    const durableBytesPerSpawn = statSync(journalFile).size - before

    // Observed ~200 bytes vs ~221 KB of state; /50 leaves wide headroom while
    // still failing loudly if a full-state flush returns to this path.
    expect(durableBytesPerSpawn).toBeLessThan(fullStateBytes / 50)

    rmSync(dir, { recursive: true, force: true })
  })
})
