import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ openFiles: [] }) } }))

const { planSaveAllDirtyFiles } = await import('./editor-save-all')

function file(overrides: Partial<OpenFile>): OpenFile {
  return {
    id: overrides.filePath ?? '/repo/a.ts',
    filePath: '/repo/a.ts',
    relativePath: 'a.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: true,
    mode: 'edit',
    ...overrides
  } as OpenFile
}

describe('planSaveAllDirtyFiles', () => {
  it('saves dirty writable files and skips clean, read-only and combined diffs', () => {
    const plan = planSaveAllDirtyFiles([
      file({ id: 'a', filePath: '/repo/a.ts' }),
      file({ id: 'b', filePath: '/repo/b.ts', isDirty: false }),
      file({ id: 'c', filePath: '/repo/c.ts', readOnly: true }),
      file({
        id: 'd',
        filePath: '/repo/d.ts',
        mode: 'diff',
        diffSource: 'combined-uncommitted'
      } as Partial<OpenFile>)
    ])
    expect(plan.save.map((f) => f.id)).toEqual(['a'])
  })

  it('reports untitled files instead of saving them', () => {
    const plan = planSaveAllDirtyFiles([
      file({ id: 'u', filePath: '/repo/Untitled-1', isUntitled: true })
    ])
    expect(plan.save).toEqual([])
    expect(plan.untitled.map((f) => f.id)).toEqual(['u'])
  })

  it('saves a file once when an edit tab and an unstaged diff tab are both dirty', () => {
    const plan = planSaveAllDirtyFiles([
      file({ id: 'diff', mode: 'diff', diffSource: 'unstaged' } as Partial<OpenFile>),
      file({ id: 'edit' })
    ])
    expect(plan.save.map((f) => f.id)).toEqual(['edit'])
  })
})
