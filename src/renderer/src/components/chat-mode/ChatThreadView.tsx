// Hosts the native-chat surface for one chat thread. The conversation always
// renders from the stored transcript; a Claude process starts only when the user
// sends (or focuses the composer), and session state shows as one line above
// the composer instead of replacing the transcript.

import type React from 'react'
import { useEffect, useRef } from 'react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import {
  deriveChatThreadTitle,
  isChatWorkspaceBriefTitle,
  unwrapChatWorkspaceUserTurn
} from '../../../../shared/chat-workspace-site-info'
import { chatThreadPaneIdentity } from '@/lib/chat-thread-pane-identity'
import { ensureChatThreadSession } from '@/lib/chat-thread-session-ensure'
import { useAppStore } from '@/store'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { seedTaskAttachmentsForTab } from '@/components/native-chat/use-native-chat-task-attachments'
import { ChatThreadErrorBanner } from './ChatThreadErrorBanner'
import { ChatThreadTaskStrip } from './ChatThreadTaskStrip'
import {
  ChatThreadEndedNotice,
  ChatThreadFolderMissingNotice,
  ChatThreadStartingNotice
} from './ChatThreadNotice'
import { useMissingFolder } from './use-missing-folder'
import { useChatThreadTransport } from './use-chat-thread-transport'

function ChatThreadSessionNotice({
  thread,
  workspace
}: {
  thread: ChatThread
  workspace: ChatWorkspace | null
}): React.JSX.Element | null {
  const hasSession = useAppStore((s) => s.chatThreadSessions[thread.id] !== undefined)
  const launching = useAppStore((s) => s.chatThreadLaunching[thread.id] === true)
  const ended = useAppStore((s) => s.chatThreadSessionEnds[thread.id] ?? null)
  // Checked on open, not before every launch, so the notice shows before anything spawns.
  const watchedMissing = useMissingFolder(workspace?.directories[0] ?? null)
  const missingFolder = watchedMissing ?? ended?.missingFolder ?? null
  const resume = (): void => void ensureChatThreadSession(thread.id)
  if (missingFolder) {
    return (
      <ChatThreadFolderMissingNotice
        folder={missingFolder}
        workspace={workspace}
        onResolved={() => useAppStore.getState().setChatThreadSessionEnd(thread.id, null)}
      />
    )
  }
  if (launching) {
    return <ChatThreadStartingNotice />
  }
  if (ended && !hasSession) {
    return (
      <ChatThreadEndedNotice
        failed={ended.failed}
        message={ended.message}
        canResume={thread.claudeSessionId !== null}
        onResume={resume}
      />
    )
  }
  return null
}

export function ChatThreadView({
  thread,
  workspace
}: {
  thread: ChatThread
  /** Null for standalone chats. */
  workspace: ChatWorkspace | null
}): React.JSX.Element {
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const lastError = useAppStore((s) => s.chatThreadLastError[thread.id] ?? null)
  // Stable for the app run: the view mounts before a process exists and every launch reuses it.
  const identity = chatThreadPaneIdentity(thread.id)
  const { transport, send } = useChatThreadTransport({ thread, workspace })

  // Session identity arrives via main's hook scanner into agentStatusByPaneKey;
  // persist it so the thread survives app restarts and stream death.
  const providerSession = useAppStore(
    (s) => s.agentStatusByPaneKey[identity.paneKey]?.providerSession
  )
  // First prompt becomes the title while the thread still has the placeholder name.
  const reportedPrompt = useAppStore((s) => s.agentStatusByPaneKey[identity.paneKey]?.prompt)
  useEffect(() => {
    const prompt = unwrapChatWorkspaceUserTurn(reportedPrompt?.trim() ?? '')
    if (!prompt) {
      return
    }
    if (thread.title !== 'New chat' && !isChatWorkspaceBriefTitle(thread.title)) {
      return
    }
    const derived = deriveChatThreadTitle(prompt)
    void updateChatThread(thread.id, { title: derived, autoTitle: derived })
  }, [reportedPrompt, thread.id, thread.title, updateChatThread])
  useEffect(() => {
    if (!providerSession?.id || providerSession.id === thread.claudeSessionId) {
      return
    }
    void updateChatThread(thread.id, {
      claudeSessionId: providerSession.id,
      ...(providerSession.transcriptPath ? { transcriptPath: providerSession.transcriptPath } : {}),
      lastActivityAt: Date.now()
    })
  }, [providerSession, thread.claudeSessionId, thread.id, updateChatThread])

  // A task-linked thread lands with the task already on the composer, so the user's own first
  // message carries the AC# reference. Must run during render, not in an effect: the composer
  // claims the seed in its useState initializer while this render's children mount.
  const linkedTask = thread.activeCollabTask
  const seededTaskRef = useRef('')
  if (linkedTask && seededTaskRef.current !== identity.tabId) {
    seededTaskRef.current = identity.tabId
    seedTaskAttachmentsForTab(identity.tabId, [
      { taskId: linkedTask.taskId, projectId: linkedTask.projectId, name: thread.title }
    ])
  }

  // Draft-first landing: the hero stores the thread's opening prompt, delivered
  // here exactly once; the send itself starts the process if none is up yet.
  const firstMessage = useAppStore((s) => s.chatThreadFirstMessage[thread.id])
  const firstMessageSentRef = useRef(false)
  useEffect(() => {
    if (!firstMessage || firstMessageSentRef.current) {
      return
    }
    firstMessageSentRef.current = true
    const store = useAppStore.getState()
    // Echo the prompt immediately; NativeChatView prunes the launch-prompt echo
    // once the real transcript user turn lands.
    store.seedNativeChatLaunchPrompt({
      tabId: identity.tabId,
      agent: thread.agent,
      text: firstMessage,
      createdAt: Date.now()
    })
    store.clearChatThreadFirstMessage(thread.id)
    void send(firstMessage).catch(() => undefined)
  }, [firstMessage, identity.tabId, thread.id, thread.agent, send])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {thread.activeCollabTask ? (
        <ChatThreadTaskStrip
          projectId={thread.activeCollabTask.projectId}
          taskId={thread.activeCollabTask.taskId}
        />
      ) : null}
      <ChatThreadErrorBanner threadId={thread.id} message={lastError} />
      <NativeChatView
        terminalTabId={identity.tabId}
        paneKey={identity.paneKey}
        draftScopeKey={`chat-thread:${thread.id}`}
        launchAgent={thread.agent}
        transport={transport}
        fallbackProviderSession={
          thread.claudeSessionId !== null
            ? { id: thread.claudeSessionId, transcriptPath: thread.transcriptPath }
            : null
        }
        activeCollabProjectId={
          workspace?.activeCollabProjects?.[0]?.id ?? workspace?.activeCollabProject?.id ?? null
        }
        composerNotice={<ChatThreadSessionNotice thread={thread} workspace={workspace} />}
      />
    </div>
  )
}
