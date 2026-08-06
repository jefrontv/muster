import { describe, expect, it } from 'vitest'
import { stripInheritedClaudeSessionMarkers } from './claude-session-marker-env'

describe('stripInheritedClaudeSessionMarkers', () => {
  it('drops every Claude session marker and keeps the rest', () => {
    const stripped = stripInheritedClaudeSessionMarkers({
      CLAUDECODE: '1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'abc',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      PATH: '/usr/bin',
      HOME: '/Users/someone'
    })
    expect(stripped).toEqual({ PATH: '/usr/bin', HOME: '/Users/someone' })
  })

  it('copies rather than mutates the source env', () => {
    const source: NodeJS.ProcessEnv = { CLAUDECODE: '1' }
    stripInheritedClaudeSessionMarkers(source)
    expect(source.CLAUDECODE).toBe('1')
  })
})
