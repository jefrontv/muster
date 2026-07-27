// Status + actions for the ActiveCollab MCP install card.
//
// The `checked` flag flips even when the read fails, mirroring
// use-integration-provider-status-refresh: a broken status call must show an error, never an
// endless spinner.

import { useCallback, useEffect, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import {
  ACTIVECOLLAB_MCP_SERVER_KEY,
  type ActiveCollabMcpAgentId,
  type ActiveCollabMcpStatus
} from '../../../../shared/activecollab-mcp-types'

export type ActiveCollabMcpActionScope = ActiveCollabMcpAgentId | 'credentials'

export type ActiveCollabMcpNotice = {
  scope: ActiveCollabMcpActionScope
  tone: 'success' | 'error' | 'info'
  message: string
}

export type ActiveCollabMcpController = {
  status: ActiveCollabMcpStatus | null
  checked: boolean
  loadError: string | null
  busy: ActiveCollabMcpActionScope | null
  notice: ActiveCollabMcpNotice | null
  refresh: () => Promise<void>
  install: (agentId: ActiveCollabMcpAgentId) => Promise<void>
  seedCredentials: () => Promise<void>
}

export function useActiveCollabMcpStatus(): ActiveCollabMcpController {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<ActiveCollabMcpStatus | null>(null)
  const [checked, setChecked] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ActiveCollabMcpActionScope | null>(null)
  const [notice, setNotice] = useState<ActiveCollabMcpNotice | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.activecollabMcp.status()
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setStatus(result.value)
        setLoadError(null)
      } else {
        setLoadError(result.error)
      }
    } catch (error) {
      if (mountedRef.current) {
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (mountedRef.current) {
        setChecked(true)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    if (!checked) {
      void refresh()
    }
  }, [checked, refresh])

  const run = useCallback(
    async (
      scope: ActiveCollabMcpActionScope,
      action: () => Promise<ActiveCollabMcpNotice>
    ): Promise<void> => {
      setBusy(scope)
      setNotice(null)
      try {
        const outcome = await action()
        if (mountedRef.current) {
          setNotice(outcome)
        }
      } catch (error) {
        if (mountedRef.current) {
          setNotice({
            scope,
            tone: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      } finally {
        if (mountedRef.current) {
          setBusy(null)
        }
      }
    },
    [mountedRef]
  )

  const install = useCallback(
    async (agentId: ActiveCollabMcpAgentId): Promise<void> => {
      await run(agentId, async (): Promise<ActiveCollabMcpNotice> => {
        const result = await window.api.activecollabMcp.install({ agentIds: [agentId] })
        if (!result.ok) {
          return { scope: agentId, tone: 'error', message: result.error }
        }
        // The write already happened, partial failure included, so the card re-reads either way.
        await refresh()
        const written = result.value.results.find((entry) => entry.id === agentId)
        if (!written || !written.ok) {
          return {
            scope: agentId,
            tone: 'error',
            message:
              written?.error ??
              translate(
                'auto.components.settings.activecollab.mcp.install_failed',
                'The agent config was not written.'
              )
          }
        }
        return {
          scope: agentId,
          tone: 'success',
          message: translate(
            'auto.components.settings.activecollab.mcp.install_ok',
            'Wrote the "{{value0}}" entry to {{value1}}.',
            { value0: ACTIVECOLLAB_MCP_SERVER_KEY, value1: written.configPath }
          )
        }
      })
    },
    [refresh, run]
  )

  const seedCredentials = useCallback(async (): Promise<void> => {
    await run('credentials', async (): Promise<ActiveCollabMcpNotice> => {
      const result = await window.api.activecollabMcp.seedCredentials()
      if (!result.ok) {
        return { scope: 'credentials', tone: 'error', message: result.error }
      }
      if (!result.value.seeded) {
        // Not a failure: with no ActiveCollab token in Muster there is nothing to hand the agent.
        return { scope: 'credentials', tone: 'info', message: result.value.reason }
      }
      await refresh()
      return {
        scope: 'credentials',
        tone: 'success',
        message: translate(
          'auto.components.settings.activecollab.mcp.seed_ok',
          'Wrote credentials for {{value0}} to {{value1}}.',
          { value0: result.value.issuedFor, value1: result.value.path }
        )
      }
    })
  }, [refresh, run])

  return { status, checked, loadError, busy, notice, refresh, install, seedCredentials }
}
