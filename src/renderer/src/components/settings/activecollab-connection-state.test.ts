import { describe, expect, it } from 'vitest'
import type { ActiveCollabConnectionStatus } from '../../../../shared/activecollab-types'
import { deriveActiveCollabConnectionState } from './activecollab-connection-state'

const CONFIGURED: ActiveCollabConnectionStatus = {
  configured: true,
  connection: {
    instanceUrl: 'https://projects.example.com',
    userId: 42,
    userName: 'Ada Lovelace',
    userEmail: 'ada@example.com'
  },
  reason: ''
}

const NOT_CONFIGURED: ActiveCollabConnectionStatus = {
  configured: false,
  connection: null,
  reason: 'No ActiveCollab token is stored on this runtime.'
}

describe('deriveActiveCollabConnectionState', () => {
  it('reports connected when the current-context status is configured', () => {
    expect(
      deriveActiveCollabConnectionState({
        status: CONFIGURED,
        statusChecked: true,
        statusContextKey: 'runtime:local#0',
        providerRuntimeContextKey: 'runtime:local#0'
      })
    ).toEqual({ contextMatches: true, checking: false, connected: true })
  })

  it('reports not connected when the status is unconfigured', () => {
    expect(
      deriveActiveCollabConnectionState({
        status: NOT_CONFIGURED,
        statusChecked: true,
        statusContextKey: 'runtime:local#0',
        providerRuntimeContextKey: 'runtime:local#0'
      })
    ).toEqual({ contextMatches: true, checking: false, connected: false })
  })

  it('treats a stale-context configured status as checking, not connected', () => {
    expect(
      deriveActiveCollabConnectionState({
        status: CONFIGURED,
        statusChecked: true,
        statusContextKey: 'runtime:old#0',
        providerRuntimeContextKey: 'runtime:local#0'
      })
    ).toEqual({ contextMatches: false, checking: true, connected: false })
  })

  it('keeps checking until the first status read settles', () => {
    expect(
      deriveActiveCollabConnectionState({
        status: NOT_CONFIGURED,
        statusChecked: false,
        statusContextKey: 'runtime:local#0',
        providerRuntimeContextKey: 'runtime:local#0'
      })
    ).toEqual({ contextMatches: true, checking: true, connected: false })
  })
})
