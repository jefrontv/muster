// One action for "let my agents use ActiveCollab": install the server, add it to every agent on
// this computer, write the credential file. Onboarding and Settings both use this, so they agree.
//
// Why the Extension Hub runner and not the older per-agent installer: the hub already installs the
// server without a terminal and registers every agent it finds (six, where the old card knew three).
// The old flow asked for three ordered actions and only enabled the first, which users read as
// broken buttons.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  visibleExtensionHarnesses,
  type ExtensionHarnessState
} from '../../../../shared/extension-state-types'
import { publishExtensionInventory, useExtensionInventory } from '@/hooks/useExtensionInventory'
import { useExtensionRun } from '@/hooks/useExtensionRun'
import type { ExtensionMissingTool } from '../../../../shared/extension-required-tools'
import {
  useActiveCollabMcpStatus,
  type ActiveCollabMcpController
} from './use-activecollab-mcp-status'

export const ACTIVECOLLAB_EXTENSION_ID = 'activecollab-mcp'

export type ActiveCollabAgentAccess = {
  checked: boolean
  loadError: string | null
  binaryFound: boolean
  credentialsSeeded: boolean
  /** Agents on this machine, with whether each already has the server. */
  harnesses: ExtensionHarnessState[]
  pendingCount: number
  ready: boolean
  working: boolean
  error: string | null
  /** Set when the install stopped because pipx (or another program it needs) is missing. */
  missingTool: ExtensionMissingTool | null
  /** The run's output, for a Details disclosure when it fails. */
  output: string
  giveAccess: () => Promise<void>
  removeFrom: (harnessId: ExtensionHarnessState['id']) => Promise<void>
  refresh: () => Promise<void>
  /** The underlying status, for the credential file row Settings keeps. */
  mcp: ActiveCollabMcpController
}

function isPending(harness: ExtensionHarnessState): boolean {
  return harness.present && !(harness.configured && harness.current)
}

export function useActiveCollabAgentAccess(): ActiveCollabAgentAccess {
  const mcp = useActiveCollabMcpStatus()
  const inventory = useExtensionInventory()
  const run = useExtensionRun(ACTIVECOLLAB_EXTENSION_ID)
  const [wiring, setWiring] = useState(false)
  const [wireError, setWireError] = useState<string | null>(null)
  const finishingRef = useRef(false)

  const item = inventory.inventory?.entries.find(
    ({ entry }) => entry.id === ACTIVECOLLAB_EXTENSION_ID
  )
  const harnesses = visibleExtensionHarnesses(item?.state.harnesses ?? [])
  const pending = harnesses.filter(isPending)
  const binaryFound = mcp.status?.binary.found === true || item?.state.installed === true
  const credentialsSeeded = mcp.status?.credentialsSeeded === true

  const refresh = useCallback(async () => {
    await Promise.all([mcp.refresh(), inventory.refresh(false)])
  }, [mcp, inventory])

  const seedIfMissing = useCallback(async () => {
    if (mcp.status && !mcp.status.credentialsSeeded) {
      await mcp.seedCredentials()
    }
  }, [mcp])

  // The hub run installs and registers in main; what is left here is the credential file.
  useEffect(() => {
    if (run.phase !== 'succeeded' || finishingRef.current) {
      return
    }
    finishingRef.current = true
    void (async () => {
      await seedIfMissing()
      await refresh()
      run.reset()
      finishingRef.current = false
    })()
  }, [run, run.phase, refresh, seedIfMissing])

  const giveAccess = useCallback(async () => {
    setWireError(null)
    if (!binaryFound) {
      await run.start('install')
      return
    }
    // Server already installed: only the agents that lack it, then the credential file.
    setWiring(true)
    try {
      for (const harness of pending) {
        const result = await window.api.extensions.installHarness({
          id: ACTIVECOLLAB_EXTENSION_ID,
          harnessId: harness.id
        })
        if (!result.ok) {
          setWireError(result.error)
          return
        }
        publishExtensionInventory(result.value)
      }
      await seedIfMissing()
      await refresh()
    } finally {
      setWiring(false)
    }
  }, [binaryFound, pending, refresh, run, seedIfMissing])

  const removeFrom = useCallback(async (harnessId: ExtensionHarnessState['id']) => {
    const result = await window.api.extensions.uninstallHarness({
      id: ACTIVECOLLAB_EXTENSION_ID,
      harnessId
    })
    if (result.ok) {
      publishExtensionInventory(result.value)
    } else {
      setWireError(result.error)
    }
  }, [])

  return {
    checked: mcp.checked && (inventory.inventory !== null || inventory.error !== null),
    loadError: mcp.loadError ?? inventory.error,
    binaryFound,
    credentialsSeeded,
    harnesses,
    pendingCount: pending.length,
    ready: binaryFound && credentialsSeeded && pending.length === 0,
    working: run.phase === 'running' || wiring || finishingRef.current,
    error: wireError ?? (run.phase === 'failed' && !run.missingTool ? run.error : null),
    missingTool: run.phase === 'failed' ? run.missingTool : null,
    output: run.output,
    giveAccess,
    removeFrom,
    refresh,
    mcp
  }
}
