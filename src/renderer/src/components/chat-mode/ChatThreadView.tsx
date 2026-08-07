// Hosts the native-chat surface for one chat thread. Ensures the headless
// stream-json session is running (launching or resuming as needed), captures the
// session identity onto the thread when hooks report it, and renders
// NativeChatView against the live pane with the stream transport.

import { Loader2, RotateCcw } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { launchChatThreadSession } from '@/lib/chat-thread-session-launch'
import { dispatchChatThreadSessionOption } from '@/lib/chat-thread-session-option-relaunch'
import { useAppStore } from '@/store'
import NativeChatView, { type NativeChatTransport } from '@/components/native-chat/NativeChatView'
import type { NativeChatPermissionBehavior } from '@/components/native-chat/native-chat-view-types'

type LaunchState = 'starting' | 'running' | 'exited' | 'failed'

export function ChatThreadView({
  thread,
  workspace
}: {
  thread: ChatThread
  /** Null for standalone chats. */
  workspace: ChatWorkspace | null
}): React.JSX.Element {
  const session = useAppStore((s) => s.chatThreadSessions[thread.id])
  const setChatThreadSession = useAppStore((s) => s.setChatThreadSession)
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const streamingText = useAppStore((s) => s.chatThreadStreamingText[thread.id]?.text ?? null)
  const [launchState, setLaunchState] = useState<LaunchState>(session ? 'running' : 'starting')
  const [error, setError] = useState<string | null>(null)
  const launchingRef = useRef(false)
  // Why: hook callbacks outlive a thread switch; write to the thread they launched for.
  const threadIdRef = useRef(thread.id)
  threadIdRef.current = thread.id

  useEffect(() => {
    if (session || launchingRef.current) {
      return
    }
    if (launchState !== 'starting') {
      // The stream died while showing: the global exit handler dropped the
      // session record, so land on the ended state instead of auto-relaunching.
      if (launchState === 'running') {
        setLaunchState('exited')
      }
      return
    }
    launchingRef.current = true
    setError(null)
    const launchedForThreadId = thread.id
    void launchChatThreadSession({ thread, workspace })
      .then((result) => {
        if (result) {
          setChatThreadSession(launchedForThreadId, result)
          if (threadIdRef.current === launchedForThreadId) {
            setLaunchState('running')
          }
        } else if (threadIdRef.current === launchedForThreadId) {
          setLaunchState('failed')
          setError(
            translate(
              'auto.components.chat.thread.noLaunchPlan',
              'Could not build a launch command for this agent.'
            )
          )
        }
      })
      .catch((launchError: unknown) => {
        if (threadIdRef.current === launchedForThreadId) {
          setLaunchState('failed')
          setError(launchError instanceof Error ? launchError.message : String(launchError))
        }
      })
      .finally(() => {
        launchingRef.current = false
      })
  }, [session, launchState, thread, workspace, setChatThreadSession])

  // Session identity arrives via main's hook scanner into agentStatusByPaneKey;
  // persist it so the thread survives app restarts and stream death.
  const providerSession = useAppStore((s) =>
    session ? s.agentStatusByPaneKey[session.paneKey]?.providerSession : undefined
  )
  // First prompt becomes the title while the thread still has the placeholder name.
  const reportedPrompt = useAppStore((s) =>
    session ? s.agentStatusByPaneKey[session.paneKey]?.prompt : undefined
  )
  useEffect(() => {
    const prompt = reportedPrompt?.trim()
    if (!prompt || thread.title !== 'New chat') {
      return
    }
    const title = prompt.length > 48 ? `${prompt.slice(0, 47).trimEnd()}…` : prompt
    void updateChatThread(thread.id, { title })
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

  const sendMessage = useCallback(
    (text: string) => window.api.chatThreadStream.send(thread.id, text),
    [thread.id]
  )
  const dispatchOption = useCallback(
    (command: string) => dispatchChatThreadSessionOption({ threadId: thread.id, command }),
    [thread.id]
  )
  const interrupt = useCallback(() => window.api.chatThreadStream.interrupt(thread.id), [thread.id])
  const permissionRequests = useAppStore((s) => s.chatThreadPermissionRequests[thread.id])
  const respondPermission = useCallback(
    (requestId: string, behavior: NativeChatPermissionBehavior) => {
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
      store.respondChatThreadPermission(
        thread.id,
        requestId,
        behavior === 'deny' ? 'deny' : 'allow'
      )
    },
    [thread.id]
  )
  const transport = useMemo<NativeChatTransport>(
    () => ({
      send: sendMessage,
      streamingText,
      dispatchOption,
      interrupt,
      ...(permissionRequests && permissionRequests.length > 0 ? { permissionRequests } : {}),
      respondPermission
    }),
    [sendMessage, streamingText, dispatchOption, interrupt, permissionRequests, respondPermission]
  )

  // Draft-first landing: the hero stores the thread's opening prompt, delivered
  // here exactly once as soon as the stream session is up.
  const firstMessage = useAppStore((s) => s.chatThreadFirstMessage[thread.id])
  const firstMessageSentRef = useRef(false)
  useEffect(() => {
    if (!session || !firstMessage || firstMessageSentRef.current) {
      return
    }
    firstMessageSentRef.current = true
    const store = useAppStore.getState()
    // Echo the prompt immediately; NativeChatView prunes the launch-prompt echo
    // once the real transcript user turn lands.
    store.seedNativeChatLaunchPrompt({
      tabId: session.tabId,
      agent: thread.agent,
      text: firstMessage,
      createdAt: Date.now()
    })
    store.clearChatThreadFirstMessage(thread.id)
    void window.api.chatThreadStream.send(thread.id, firstMessage).catch(() => undefined)
  }, [session, firstMessage, thread.id, thread.agent])

  if (session) {
    return (
      <div className="flex h-full min-h-0 flex-col duration-200 ease-in animate-in fade-in slide-in-from-bottom-2">
        <NativeChatView
          terminalTabId={session.tabId}
          paneKey={session.paneKey}
          launchAgent={thread.agent}
          transport={transport}
          fallbackProviderSession={
            thread.claudeSessionId !== null
              ? { id: thread.claudeSessionId, transcriptPath: thread.transcriptPath }
              : null
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {launchState === 'starting' ? (
        <>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {translate('auto.components.chat.thread.starting', 'Starting Claude…')}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">
            {launchState === 'failed'
              ? translate('auto.components.chat.thread.failed', 'The session could not start')
              : translate('auto.components.chat.thread.ended', 'This session ended')}
          </p>
          {error ? <p className="max-w-md text-xs text-destructive">{error}</p> : null}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setLaunchState('starting')}
          >
            <RotateCcw className="size-3.5" />
            {thread.claudeSessionId
              ? translate('auto.components.chat.thread.resume', 'Resume chat')
              : translate('auto.components.chat.thread.retry', 'Try again')}
          </Button>
        </>
      )}
    </div>
  )
}
