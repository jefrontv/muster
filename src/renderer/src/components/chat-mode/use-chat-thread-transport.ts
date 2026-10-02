// The stream transport a chat thread hands NativeChatView. It exists before any
// CLI process does: a send (or composer focus) starts one on demand, so viewing
// a thread never spawns Claude.

import { useCallback, useMemo, useRef } from 'react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import {
  buildChatWorkspaceAgentBrief,
  deriveChatThreadTitle,
  isChatWorkspaceBriefTitle,
  wrapChatWorkspaceUserTurn
} from '../../../../shared/chat-workspace-site-info'
import { useAppStore } from '@/store'
import { dispatchChatThreadSessionOption } from '@/lib/chat-thread-session-option-relaunch'
import { ensureChatThreadSession } from '@/lib/chat-thread-session-ensure'
import type { NativeChatTransport } from '@/components/native-chat/NativeChatView'
import type { NativeChatPermissionBehavior } from '@/components/native-chat/native-chat-view-types'

export function useChatThreadTransport({
  thread,
  workspace
}: {
  thread: ChatThread
  workspace: ChatWorkspace | null
}): { transport: NativeChatTransport; send: NativeChatTransport['send'] } {
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const streamingText = useAppStore((s) => s.chatThreadStreamingText[thread.id]?.text ?? null)
  const streamingSealed = useAppStore((s) => s.chatThreadStreamingText[thread.id]?.sealed === true)
  const contextWindowTokens = useAppStore(
    (s) => s.chatThreadContextWindow[thread.id] ?? thread.contextWindow
  )
  const fullAccess = useAppStore(
    (s) =>
      s.settings?.nativeChatPermissionMode === 'full' || s.chatThreadFullAccess[thread.id] === true
  )
  const permissionRequests = useAppStore((s) => s.chatThreadPermissionRequests[thread.id])

  // Resume already has the conversation; a new thread injects the brief once.
  const briefInjectedRef = useRef(thread.claudeSessionId !== null)
  const send = useCallback(
    async (text: string, imagePaths?: string[]): Promise<boolean> => {
      if (!(await ensureChatThreadSession(thread.id))) {
        return false
      }
      let payload = text
      if (!briefInjectedRef.current) {
        briefInjectedRef.current = true
        const brief = workspace ? buildChatWorkspaceAgentBrief(workspace) : null
        if (brief) {
          payload = wrapChatWorkspaceUserTurn(brief, text)
        }
      }
      if (thread.title === 'New chat' || isChatWorkspaceBriefTitle(thread.title)) {
        const derived = deriveChatThreadTitle(text)
        void updateChatThread(thread.id, { title: derived, autoTitle: derived })
      }
      useAppStore.getState().touchChatThreadSession(thread.id)
      return window.api.chatThreadStream.send(thread.id, payload, imagePaths)
    },
    [thread.id, thread.title, updateChatThread, workspace]
  )
  const prewarm = useCallback(() => {
    void ensureChatThreadSession(thread.id)
  }, [thread.id])
  const dispatchOption = useCallback<NativeChatTransport['dispatchOption']>(
    (command) =>
      // No process yet: the picker already saved the choice, and the next launch reads it.
      useAppStore.getState().chatThreadSessions[thread.id]
        ? dispatchChatThreadSessionOption({ threadId: thread.id, command })
        : { outcome: 'applied' },
    [thread.id]
  )
  const interrupt = useCallback(
    async () =>
      useAppStore.getState().chatThreadSessions[thread.id]
        ? window.api.chatThreadStream.interrupt(thread.id)
        : false,
    [thread.id]
  )
  const respondPermission = useCallback(
    (requestId: string, behavior: NativeChatPermissionBehavior, message?: string) => {
      const store = useAppStore.getState()
      if (behavior === 'allow-always') {
        // Record the tool so ChatModePage auto-allows its later requests this session.
        const request = store.chatThreadPermissionRequests[thread.id]?.find(
          (r) => r.requestId === requestId
        )
        if (request) {
          store.allowChatThreadToolForSession(thread.id, request.toolName)
        }
      }
      if (behavior === 'allow-all') {
        // Full access: approve this and everything queued; later requests auto-approve.
        store.setChatThreadFullAccess(thread.id, true)
        for (const queued of store.chatThreadPermissionRequests[thread.id] ?? []) {
          if (queued.requestId !== requestId) {
            store.respondChatThreadPermission(thread.id, queued.requestId, 'allow')
          }
        }
      }
      store.respondChatThreadPermission(
        thread.id,
        requestId,
        behavior === 'deny' ? 'deny' : 'allow',
        message
      )
    },
    [thread.id]
  )
  const setFullAccess = useCallback(
    (enabled: boolean) => {
      const store = useAppStore.getState()
      // The composer switch is the permanent choice; the thread flag follows so
      // "off" also ends an approval-dropdown session grant.
      void store.updateSettings({ nativeChatPermissionMode: enabled ? 'full' : 'ask' })
      store.setChatThreadFullAccess(thread.id, enabled)
      if (enabled) {
        for (const request of store.chatThreadPermissionRequests[thread.id] ?? []) {
          store.respondChatThreadPermission(thread.id, request.requestId, 'allow')
        }
      }
    },
    [thread.id]
  )
  const transport = useMemo<NativeChatTransport>(
    () => ({
      send,
      prewarm,
      streamingText,
      streamingSealed,
      dispatchOption,
      interrupt,
      ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
      ...(permissionRequests && permissionRequests.length > 0 ? { permissionRequests } : {}),
      respondPermission,
      fullAccess,
      setFullAccess
    }),
    [
      send,
      prewarm,
      streamingText,
      streamingSealed,
      dispatchOption,
      interrupt,
      contextWindowTokens,
      permissionRequests,
      respondPermission,
      fullAccess,
      setFullAccess
    ]
  )
  return { transport, send }
}
