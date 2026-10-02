// The timeline's rows plus the user's toggles (work logs, plans, changes cards),
// and the live status label the working row shows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { stripNoiseMessages } from './native-chat-noise'
import {
  buildNativeChatTimelineRows,
  type NativeChatTimelineRow
} from './native-chat-timeline-rows'
import { nativeChatPlanActiveLabel } from './native-chat-turn-plan'
import { useNativeChatSurface } from './native-chat-surface-context'
import type { NativeChatRowToggle } from './NativeChatTimelineRowView'

type ToggleKind = Parameters<NativeChatRowToggle>[0]

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  return next
}

export function useNativeChatTimeline(input: {
  rawMessages: readonly NativeChatMessage[]
  isWorking: boolean
  lastError: string | null
}): {
  messages: NativeChatMessage[]
  rows: NativeChatTimelineRow[]
  toggle: NativeChatRowToggle
  workingStepLabel: string | null
} {
  const { surface, cwd } = useNativeChatSurface()
  // Harness noise (task-notifications, system reminders, envelopes) never renders.
  const messages = useMemo(
    () => orderNativeChatMessages(stripNoiseMessages([...input.rawMessages])),
    [input.rawMessages]
  )
  const [toggles, setToggles] = useState<Record<ToggleKind, ReadonlySet<string>>>({
    work: new Set(),
    plan: new Set(),
    changes: new Set()
  })
  const toggle = useCallback<NativeChatRowToggle>(
    (kind, key) => setToggles((prev) => ({ ...prev, [kind]: toggled(prev[kind], key) })),
    []
  )
  const rows = useMemo(
    () =>
      buildNativeChatTimelineRows({
        messages,
        isWorking: input.isWorking,
        surface,
        t: translate,
        cwd,
        toggles: { workLogs: toggles.work, plans: toggles.plan, changedFiles: toggles.changes },
        lastError: input.lastError
      }),
    [messages, input.isWorking, input.lastError, surface, cwd, toggles]
  )

  // The plan's active step, else the newest call still out, names what is happening now.
  const workingStepLabel = useMemo(() => {
    if (!input.isWorking) {
      return null
    }
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]!
      if (row.kind === 'turn-plan') {
        return nativeChatPlanActiveLabel(row.plan)
      }
      if (row.kind === 'work-log' && row.live && row.work.liveLabel) {
        return row.work.liveLabel
      }
    }
    return null
  }, [rows, input.isWorking])

  // An interrupt that lands while mounted leaves its work log open (hiding the
  // evidence of what was stopped reads as loss); interrupted history stays folded.
  const seenInterruptedRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const interrupted = rows.flatMap((row) =>
      row.kind === 'work-log' && row.interrupted && !row.live ? [row.turnId] : []
    )
    const seen = seenInterruptedRef.current
    if (seen === null) {
      seenInterruptedRef.current = new Set(interrupted)
      return
    }
    const fresh = interrupted.filter((turnId) => !seen.has(turnId))
    if (fresh.length > 0) {
      fresh.forEach((turnId) => seen.add(turnId))
      setToggles((prev) => ({ ...prev, work: new Set([...prev.work, ...fresh]) }))
    }
  }, [rows])

  return { messages, rows, toggle, workingStepLabel }
}
