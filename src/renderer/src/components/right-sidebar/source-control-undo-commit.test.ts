import { describe, expect, it } from 'vitest'
import {
  resolveRestoredCommitMessage,
  resolveUndoCommitConfirmation
} from './source-control-undo-commit'

describe('resolveUndoCommitConfirmation', () => {
  it('skips the confirm for a local-only commit', () => {
    expect(resolveUndoCommitConfirmation({ hasUpstream: true, ahead: 1, behind: 0 })).toBeNull()
    expect(resolveUndoCommitConfirmation({ hasUpstream: false, ahead: 0, behind: 0 })).toBeNull()
    expect(resolveUndoCommitConfirmation(undefined)).toBeNull()
  })

  it('confirms when the remote already has the commit', () => {
    const confirmation = resolveUndoCommitConfirmation({
      hasUpstream: true,
      upstreamName: 'origin/staging',
      ahead: 0,
      behind: 0
    })
    expect(confirmation?.description).toContain('origin/staging')
    expect(confirmation?.description).toContain('Force Push')
  })
})

describe('resolveRestoredCommitMessage', () => {
  it('restores the undone message into an empty box', () => {
    expect(resolveRestoredCommitMessage('  ', 'fix: thing')).toBe('fix: thing')
  })

  it('keeps a message the user already typed', () => {
    expect(resolveRestoredCommitMessage('wip', 'fix: thing')).toBe('wip')
  })
})
