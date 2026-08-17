// Context-window usage for the composer donut: reads the latest assistant
// usage from the local transcript, refreshed when the in-flight turn settles.

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { AgentType } from '../../../../shared/agent-status-types'
import { claudeContextWindowForModel } from '../../../../shared/claude-context-window'

export type NativeChatContextUsage = {
  usedTokens: number
  /** Model-sized window fallback; a CLI-reported window should win over this. */
  windowTokens: number
}

export function useNativeChatContextUsage({
  paneKey,
  agent,
  isWorking,
  enabled
}: {
  paneKey: string
  agent: AgentType
  /** A false edge (turn settled) is the refresh trigger. */
  isWorking: boolean
  /** False for runtime-owned panes — the transcript is not on the local disk. */
  enabled: boolean
}): NativeChatContextUsage | null {
  const [usage, setUsage] = useState<NativeChatContextUsage | null>(null)
  // The hook-reported provider session names the transcript authoritatively.
  // Defensive access: composer tests mount against partial store mocks.
  const providerSession = useAppStore((s) => s.agentStatusByPaneKey?.[paneKey]?.providerSession)
  const sessionId = providerSession?.id ?? null
  const transcriptPath = providerSession?.transcriptPath ?? null

  useEffect(() => {
    if (!enabled || agent !== 'claude' || !sessionId || isWorking) {
      return
    }
    // The web client's bridged nativeChat api may predate this method.
    if (typeof window.api.nativeChat.readContextUsage !== 'function') {
      return
    }
    let cancelled = false
    void window.api.nativeChat
      .readContextUsage(agent, sessionId, transcriptPath ?? undefined)
      .then((read) => {
        if (!cancelled) {
          setUsage(
            read
              ? {
                  usedTokens: read.usedTokens,
                  // Learned (CLI-reported once, any thread) beats the static map.
                  windowTokens: read.windowTokens ?? claudeContextWindowForModel(read.model)
                }
              : null
          )
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, agent, sessionId, transcriptPath, isWorking])

  // A session swap invalidates the previous reading immediately.
  useEffect(() => {
    setUsage(null)
  }, [sessionId])

  return usage
}
