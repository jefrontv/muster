// Hosts the native-chat surface for one chat thread. Ensures the hidden PTY session is
// running (launching or resuming as needed), captures the session identity onto the
// thread when hooks report it, and renders NativeChatView against the live pane.

import { Loader2, RotateCcw } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { launchChatThreadSession } from '@/lib/chat-thread-session-launch'
import { useAppStore } from '@/store'
import NativeChatView from '@/components/native-chat/NativeChatView'

type LaunchState = 'starting' | 'running' | 'exited' | 'failed'

export function ChatThreadView({
  thread,
  workspace
}: {
  thread: ChatThread
  workspace: ChatWorkspace
}): React.JSX.Element {
  const session = useAppStore((s) => s.chatThreadSessions[thread.id])
  const setChatThreadSession = useAppStore((s) => s.setChatThreadSession)
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const [launchState, setLaunchState] = useState<LaunchState>(session ? 'running' : 'starting')
  const [error, setError] = useState<string | null>(null)
  const [resumeNonce, setResumeNonce] = useState(0)
  const launchingRef = useRef(false)
  // Why: hook callbacks outlive a thread switch; write to the thread they launched for.
  const threadIdRef = useRef(thread.id)
  threadIdRef.current = thread.id

  useEffect(() => {
    if (session || launchingRef.current) {
      return
    }
    launchingRef.current = true
    setLaunchState('starting')
    setError(null)
    const launchedForThreadId = thread.id
    void launchChatThreadSession({
      thread,
      workspace,
      onExit: () => {
        useAppStore.getState().setChatThreadSession(launchedForThreadId, null)
        if (threadIdRef.current === launchedForThreadId) {
          setLaunchState('exited')
        }
      }
    })
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
    // Why: resumeNonce re-arms the launch after an exit; session presence resets the cycle.
  }, [session, thread, workspace, resumeNonce, setChatThreadSession, updateChatThread])

  // Session identity arrives via main's hook scanner into agentStatusByPaneKey;
  // persist it so the thread survives app restarts and PTY death.
  const providerSession = useAppStore((s) =>
    session ? s.agentStatusByPaneKey[session.paneKey]?.providerSession : undefined
  )
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

  if (session) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <NativeChatView
          terminalTabId={session.tabId}
          paneKey={session.paneKey}
          targetPtyId={session.ptyId}
          launchAgent={thread.agent}
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
            onClick={() => setResumeNonce((n) => n + 1)}
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
