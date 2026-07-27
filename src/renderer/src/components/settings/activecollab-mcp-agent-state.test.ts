import { describe, expect, it } from 'vitest'
import type {
  ActiveCollabMcpAgentStatus,
  ActiveCollabMcpBinary
} from '../../../../shared/activecollab-mcp-types'
import {
  activeCollabMcpAgentStateKind,
  describeActiveCollabMcpAgent
} from './activecollab-mcp-agent-state'

const FOUND: ActiveCollabMcpBinary = {
  found: true,
  path: '/Users/tester/.local/bin/activecollab-mcp',
  version: '1.8.1',
  source: 'pipx',
  installHint: ''
}

const MISSING: ActiveCollabMcpBinary = {
  found: false,
  path: null,
  version: null,
  source: null,
  installHint: 'pipx install activecollab-mcp'
}

function agent(overrides: Partial<ActiveCollabMcpAgentStatus> = {}): ActiveCollabMcpAgentStatus {
  return {
    id: 'claude-code',
    label: 'Claude Code',
    configPath: '/Users/tester/.claude.json',
    present: true,
    configured: true,
    current: true,
    requiresRunningServer: false,
    ...overrides
  }
}

describe('activeCollabMcpAgentStateKind', () => {
  it('separates the four states instead of collapsing them into configured/not', () => {
    expect(activeCollabMcpAgentStateKind(agent({ present: false, configured: false }))).toBe(
      'missing-agent'
    )
    expect(activeCollabMcpAgentStateKind(agent({ configured: false, current: false }))).toBe(
      'unconfigured'
    )
    expect(activeCollabMcpAgentStateKind(agent({ current: false }))).toBe('stale')
    expect(activeCollabMcpAgentStateKind(agent())).toBe('current')
  })
})

describe('describeActiveCollabMcpAgent', () => {
  it('keeps a stale entry actionable rather than reporting it as done', () => {
    const state = describeActiveCollabMcpAgent(agent({ current: false }), FOUND)

    expect(state.statusLabel).toBe('Muster entry out of date')
    expect(state.tone).toBe('attention')
    expect(state.actionLabel).toBe('Update entry')
    expect(state.blockedReason).toBeNull()
  })

  it('words an absent entry as "not configured by Muster" and warns about a rival key', () => {
    const state = describeActiveCollabMcpAgent(agent({ configured: false, current: false }), FOUND)

    expect(state.statusLabel).toBe('Not configured by Muster')
    expect(state.detail).toContain('under a different key')
    expect(state.detail).toContain('do not end up with two')
  })

  it('blocks the action for a binary-backed agent when the binary is missing', () => {
    const state = describeActiveCollabMcpAgent(
      agent({ configured: false, current: false }),
      MISSING
    )

    expect(state.blockedReason).toBe(
      'activecollab-mcp is not installed, so this agent would be pointed at nothing.'
    )
  })

  it('leaves an HTTP agent actionable without a binary and explains the transport', () => {
    const state = describeActiveCollabMcpAgent(
      agent({ id: 'cursor', configured: false, current: false, requiresRunningServer: true }),
      MISSING
    )

    expect(state.blockedReason).toBeNull()
    expect(state.transportNote).toContain('needs no local binary')
  })
})
