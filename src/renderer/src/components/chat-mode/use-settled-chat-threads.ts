// Long-quiet idle threads land in the sidebar's Settled shelf; anything that
// still needs a human (approval, working, unread) stays in the main list.

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  hasUnseenCompletion,
  isChatThreadSettled,
  resolveChatThreadStatus
} from './chat-thread-status'

export function useSettledThreadIds(): Set<string> {
  const ids = useAppStore(
    useShallow((s) => {
      const now = Date.now()
      return s.chatThreads
        .filter((t) => {
          if (t.archived === true) {
            return false
          }
          const session = s.chatThreadSessions[t.id]
          const status = resolveChatThreadStatus({
            agentState: session ? s.agentStatusByPaneKey[session.paneKey]?.state : undefined,
            hasPendingApproval: (s.chatThreadPermissionRequests[t.id]?.length ?? 0) > 0,
            hasUnseenCompletion: hasUnseenCompletion(t),
            hasFullAccess:
              s.settings?.nativeChatPermissionMode === 'full' ||
              s.chatThreadFullAccess[t.id] === true
          })
          return isChatThreadSettled({ status, lastActivityAt: t.lastActivityAt, now })
        })
        .map((t) => t.id)
    })
  )
  return useMemo(() => new Set(ids), [ids])
}
