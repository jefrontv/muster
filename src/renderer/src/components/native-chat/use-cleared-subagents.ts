// Idle agents left over from an earlier pass, which the tab folds away.
// Agents that finish during the current pass stay listed until the next one starts.

import { useState } from 'react'
import type { AgentStatusState, AgentSubagentSnapshot } from '../../../../shared/agent-status-types'

const NONE: ReadonlySet<string> = new Set()

function idleIds(subagents: readonly AgentSubagentSnapshot[] | undefined): ReadonlySet<string> {
  const ids = subagents?.filter((agent) => agent.state === 'idle').map((agent) => agent.id)
  return ids && ids.length > 0 ? new Set(ids) : NONE
}

export function useClearedSubagents(
  paneState: AgentStatusState | undefined,
  subagents: readonly AgentSubagentSnapshot[] | undefined
): ReadonlySet<string> {
  // Mounting mid-pass can't tell old idles from new ones; clear them all to keep the pass tidy.
  const [cleared, setCleared] = useState(() =>
    paneState !== undefined && paneState !== 'done' ? idleIds(subagents) : NONE
  )
  const [seenState, setSeenState] = useState(paneState)
  // Adjusted during render, so the fold starts in the same frame as the new pass.
  if (paneState !== seenState) {
    setSeenState(paneState)
    if (seenState === 'done' && paneState === 'working') {
      setCleared(idleIds(subagents))
    }
  }
  // A cleared agent that wakes up again belongs to this pass.
  const revived = subagents?.some((agent) => agent.state !== 'idle' && cleared.has(agent.id))
  if (revived) {
    setCleared(
      new Set(
        [...cleared].filter((id) => !subagents?.some((a) => a.id === id && a.state !== 'idle'))
      )
    )
  }
  return cleared
}
