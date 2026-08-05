import { describe, expect, it } from 'vitest'

import { formatCliError } from './format'
import { RuntimeClientError, RuntimeRpcFailureError } from './runtime-client'

describe('CLI error recovery', () => {
  it('prints did-you-mean next steps for an unknown-command error carrying data', () => {
    const error = new RuntimeClientError('invalid_argument', 'Unknown command: worktree remov', {
      suggestions: ['worktree rm'],
      nextSteps: ['Did you mean: orca worktree rm']
    })

    const output = formatCliError(error)

    expect(output).toContain('Unknown command: worktree remov')
    expect(output).toContain('Next step: Did you mean: orca worktree rm')
  })

  it('prints did-you-mean next steps from RPC failure recovery data', () => {
    const error = new RuntimeRpcFailureError({
      id: 'req_rpc_recovery',
      ok: false,
      error: {
        code: 'invalid_argument',
        message: 'Unknown runtime argument',
        data: { nextSteps: ['Use the runtime-specific option'] }
      },
      _meta: { runtimeId: 'runtime_local' }
    })

    const output = formatCliError(error)

    expect(output).toContain('Unknown runtime argument')
    expect(output).toContain('Next step: Use the runtime-specific option')
  })

  it('returns the bare message when an RPC error has no recovery data', () => {
    const error = new RuntimeRpcFailureError({
      id: 'req_rpc_fallback',
      ok: false,
      error: { code: 'invalid_argument', message: 'Invalid runtime argument' },
      _meta: { runtimeId: 'runtime_local' }
    })

    expect(formatCliError(error)).toBe('Invalid runtime argument')
  })
})
