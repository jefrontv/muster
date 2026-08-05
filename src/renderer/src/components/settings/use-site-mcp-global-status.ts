// Status + actions for the muster-sites MCP install card, mirroring use-activecollab-mcp-status.
//
// The `checked` flag flips even when the read fails: a broken status call must show an error,
// never an endless spinner.

import { useCallback, useEffect, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { SiteMcpGlobalStatus, SiteMcpHarnessId } from '../../../../shared/site-mcp-types'

export type SiteMcpGlobalNotice = {
  scope: SiteMcpHarnessId
  tone: 'success' | 'error'
  message: string
}

export type SiteMcpGlobalController = {
  status: SiteMcpGlobalStatus | null
  checked: boolean
  loadError: string | null
  busy: SiteMcpHarnessId | null
  notice: SiteMcpGlobalNotice | null
  refresh: () => Promise<void>
  install: (harnessId: SiteMcpHarnessId) => Promise<void>
}

export function useSiteMcpGlobalStatus(): SiteMcpGlobalController {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<SiteMcpGlobalStatus | null>(null)
  const [checked, setChecked] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<SiteMcpHarnessId | null>(null)
  const [notice, setNotice] = useState<SiteMcpGlobalNotice | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.siteMcp.globalStatus()
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

  const install = useCallback(
    async (harnessId: SiteMcpHarnessId): Promise<void> => {
      setBusy(harnessId)
      setNotice(null)
      try {
        const result = await window.api.siteMcp.globalInstall({ harnessId })
        // The write already happened on success, so the card re-reads either way.
        await refresh()
        if (!mountedRef.current) {
          return
        }
        setNotice(
          result.ok
            ? {
                scope: harnessId,
                tone: 'success',
                message: translate(
                  'auto.components.settings.siteMcp.install_ok',
                  'Wrote the "muster-sites" entry to {{value0}}.',
                  { value0: result.value.configPath }
                )
              }
            : { scope: harnessId, tone: 'error', message: result.error }
        )
      } catch (error) {
        if (mountedRef.current) {
          setNotice({
            scope: harnessId,
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
    [mountedRef, refresh]
  )

  return { status, checked, loadError, busy, notice, refresh, install }
}
