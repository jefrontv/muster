import { describe, expect, it } from 'vitest'
import type { NativeChatToolResultBlock } from '../../../../shared/native-chat-types'
import { describeToolActivity } from '../../../../shared/native-chat-tool-activity'
import {
  deriveNativeChatTurnChangedFiles,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  type NativeChatChangedFile
} from './native-chat-turn-changed-files'

const patched = (additions: number, deletions: number): NativeChatToolResultBlock => ({
  type: 'tool-result',
  output: 'ok',
  detail: { patch: [], additions, deletions }
})

const edit = (path: string, result?: NativeChatToolResultBlock) =>
  describeToolActivity(
    {
      type: 'tool-call',
      name: 'Edit',
      input: { file_path: path, old_string: 'a', new_string: 'b' }
    },
    result,
    'code'
  )

const file = (path: string, additions: number, deletions: number): NativeChatChangedFile => ({
  path,
  additions,
  deletions
})

describe('deriveNativeChatTurnChangedFiles', () => {
  it('is null for a turn that changed nothing', () => {
    const read = describeToolActivity(
      { type: 'tool-call', name: 'Read', input: { file_path: 'x.ts' } },
      undefined,
      'code'
    )
    expect(deriveNativeChatTurnChangedFiles([read])).toBeNull()
  })

  it('uses the structured patch counts, summing repeat edits to one file', () => {
    const changed = deriveNativeChatTurnChangedFiles([
      edit('src/a.ts', patched(1, 1)),
      edit('src/a.ts', patched(4, 2)),
      edit('src/b.ts', patched(3, 0))
    ])
    expect(changed?.files).toEqual([file('src/a.ts', 5, 3), file('src/b.ts', 3, 0)])
    expect(changed?.totalAdditions).toBe(8)
    expect(changed?.totalDeletions).toBe(3)
  })

  it('skips failed edits, which changed nothing', () => {
    const failed: NativeChatToolResultBlock = { type: 'tool-result', output: 'no', isError: true }
    expect(deriveNativeChatTurnChangedFiles([edit('a.ts', failed)])).toBeNull()
  })
})

describe('shouldAutoExpandChangedFiles', () => {
  const small = { files: [file('a.ts', 3, 1)], totalAdditions: 3, totalDeletions: 1 }

  it('opens a small change on the turn the user just watched', () => {
    expect(shouldAutoExpandChangedFiles({ changed: small, isLatestTurn: true })).toBe(true)
  })

  it('stays shut on older turns however small', () => {
    expect(shouldAutoExpandChangedFiles({ changed: small, isLatestTurn: false })).toBe(false)
  })

  it('stays shut when too many files changed', () => {
    const many = {
      files: Array.from({ length: 6 }, (_, i) => file(`f${i}.ts`, 1, 0)),
      totalAdditions: 6,
      totalDeletions: 0
    }
    expect(shouldAutoExpandChangedFiles({ changed: many, isLatestTurn: true })).toBe(false)
  })

  it('stays shut when too many lines changed', () => {
    const big = { files: [file('a.ts', 150, 100)], totalAdditions: 150, totalDeletions: 100 }
    expect(shouldAutoExpandChangedFiles({ changed: big, isLatestTurn: true })).toBe(false)
  })
})

describe('selectChangedFilePreview', () => {
  it('returns everything when it already fits', () => {
    const files = [file('a.ts', 1, 0), file('b.ts', 1, 0)]
    expect(selectChangedFilePreview(files)).toEqual(files)
  })

  it('spreads the preview across distinct top-level folders', () => {
    // Three neighbours from src/ would hide that the change also touched docs
    // and config; the preview is meant to hint at breadth.
    const files = [
      file('src/one.ts', 1, 0),
      file('src/two.ts', 1, 0),
      file('src/three.ts', 1, 0),
      file('docs/readme.md', 1, 0),
      file('config/app.json', 1, 0)
    ]
    expect(selectChangedFilePreview(files).map((f) => f.path)).toEqual([
      'src/one.ts',
      'docs/readme.md',
      'config/app.json'
    ])
  })

  it('tops up in order when there are not enough distinct folders', () => {
    const files = [
      file('src/one.ts', 1, 0),
      file('src/two.ts', 1, 0),
      file('src/three.ts', 1, 0),
      file('src/four.ts', 1, 0)
    ]
    expect(selectChangedFilePreview(files).map((f) => f.path)).toEqual([
      'src/one.ts',
      'src/two.ts',
      'src/three.ts'
    ])
  })
})
