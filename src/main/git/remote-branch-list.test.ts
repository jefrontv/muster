import { describe, expect, it } from 'vitest'
import { parseLsRemoteHeads } from './remote-branch-list'

describe('parseLsRemoteHeads', () => {
  it('reads heads and the HEAD symref', () => {
    const out = [
      'ref: refs/heads/main\tHEAD',
      'aaa\tHEAD',
      'bbb\trefs/heads/staging',
      'ccc\trefs/heads/main',
      'ddd\trefs/heads/feature/x'
    ].join('\n')
    expect(parseLsRemoteHeads(out)).toEqual({
      branches: ['feature/x', 'main', 'staging'],
      defaultBranch: 'main'
    })
  })

  it('handles an empty remote', () => {
    expect(parseLsRemoteHeads('')).toEqual({ branches: [], defaultBranch: null })
  })
})
