import { describe, expect, it } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  deriveNativeChatTurnChangedFiles,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  type NativeChatChangedFile
} from './native-chat-turn-changed-files'

function msg(id: string, blocks: NativeChatBlock[]): NativeChatMessage {
  return { id, role: 'assistant', blocks, timestamp: null, source: 'transcript' }
}

const edit = (path: string, oldText: string, newText: string): NativeChatBlock => ({
  type: 'tool-call',
  name: 'Edit',
  input: { file_path: path, old_string: oldText, new_string: newText }
})

const write = (path: string, content: string): NativeChatBlock => ({
  type: 'tool-call',
  name: 'Write',
  input: { file_path: path, content }
})

const file = (path: string, additions: number, deletions: number): NativeChatChangedFile => ({
  path,
  additions,
  deletions
})

describe('deriveNativeChatTurnChangedFiles', () => {
  it('is null for a turn that changed nothing', () => {
    expect(deriveNativeChatTurnChangedFiles([msg('a1', [{ type: 'text', text: 'hi' }])])).toBeNull()
  })

  it('counts additions and deletions per file', () => {
    const changed = deriveNativeChatTurnChangedFiles([
      msg('a1', [edit('src/a.ts', 'one\ntwo', 'one\ntwo\nthree')])
    ])
    expect(changed?.files).toEqual([{ path: 'src/a.ts', additions: 3, deletions: 2 }])
  })

  it('sums repeat edits to the same file into one row', () => {
    const changed = deriveNativeChatTurnChangedFiles([
      msg('a1', [edit('src/a.ts', 'x', 'y')]),
      msg('a2', [edit('src/a.ts', 'p', 'q')])
    ])
    expect(changed?.files).toHaveLength(1)
    expect(changed?.files[0]).toEqual({ path: 'src/a.ts', additions: 2, deletions: 2 })
  })

  it('treats a new-file write as additions only', () => {
    const changed = deriveNativeChatTurnChangedFiles([msg('a1', [write('src/new.ts', 'a\nb\nc')])])
    expect(changed?.files[0]).toEqual({ path: 'src/new.ts', additions: 3, deletions: 0 })
  })

  it('ignores tools that do not edit files', () => {
    const read: NativeChatBlock = { type: 'tool-call', name: 'Read', input: { file_path: 'x.ts' } }
    expect(deriveNativeChatTurnChangedFiles([msg('a1', [read])])).toBeNull()
  })

  it('totals across every file', () => {
    const changed = deriveNativeChatTurnChangedFiles([
      msg('a1', [edit('a.ts', 'x', 'y\nz'), edit('b.ts', 'p\nq', 'r')])
    ])
    expect(changed?.totalAdditions).toBe(3)
    expect(changed?.totalDeletions).toBe(3)
  })

  it('counts a trailing newline as a terminator, not an extra line', () => {
    const changed = deriveNativeChatTurnChangedFiles([msg('a1', [write('a.ts', 'one\ntwo\n')])])
    expect(changed?.files[0]?.additions).toBe(2)
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
