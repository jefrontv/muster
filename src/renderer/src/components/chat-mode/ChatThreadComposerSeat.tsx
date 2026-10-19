// The composer seat under the engine-drawn transcript: the existing chat
// composer (pickers, attachments, menus, approvals) in the seat's chat look.
// The engine draws the user's turn itself, so there is no optimistic echo.

import { useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { ChatThread } from '../../../../shared/chat-mode-types'
import { chatThreadPaneIdentity } from '@/lib/chat-thread-pane-identity'
import {
  NativeChatComposer,
  type NativeChatComposerHandle
} from '@/components/native-chat/NativeChatComposer'
import { NativeChatQueueStrip } from '@/components/native-chat/NativeChatQueueStrip'
import { NativeChatStreamAskCard } from '@/components/native-chat/NativeChatStreamAskCard'
import { pickNativeChatTakeover } from '@/components/native-chat/native-chat-takeover-precedence'
import { NativeChatSurfaceProvider } from '@/components/native-chat/native-chat-surface-context'
import { useNativeChatSurfaceValue } from '@/components/native-chat/use-native-chat-surface-value'
import type { NativeChatTransport } from '@/components/native-chat/native-chat-view-types'
import { useChatEngineMeta } from '@/components/chat-thread/use-chat-engine-thread'

const noOptimisticEcho = (): undefined => undefined
const noop = (): void => undefined

export function ChatThreadComposerSeat(props: {
  thread: ChatThread
  transport: NativeChatTransport
  workingDirectory: string | null
  activeCollabProjectId: number | null
  /** Session state line (starting, ended, missing folder) above the composer. */
  notice?: React.ReactNode
}): React.JSX.Element {
  const { thread, transport } = props
  const identity = chatThreadPaneIdentity(thread.id)
  const status = useChatEngineMeta(thread.id)?.status
  const isWorking = status === 'working' || status === 'starting'
  const composerRef = useRef<NativeChatComposerHandle>(null)
  const answerInputRef = useRef<HTMLTextAreaElement>(null)
  const [askActive, setAskActive] = useState(false)
  const surface = useNativeChatSurfaceValue({
    surface: thread.showTechnicalDetails === true ? 'code' : 'chat',
    chatThread: true,
    workingDirectory: props.workingDirectory,
    fileLinkContext: null,
    reportedModel: thread.reportedModel ?? null
  })
  const seatSurface = useMemo(() => ({ ...surface, seat: true }), [surface])
  const takeover = pickNativeChatTakeover(transport.permissionRequests)
  // Plan review outranks a latched question; the question keeps its state underneath.
  const planActive = takeover.plan !== null
  return (
    <NativeChatSurfaceProvider value={seatSurface}>
      <div
        className="flex flex-col gap-1.5"
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLTextAreaElement) {
            transport.prewarm?.()
          }
        }}
      >
        {props.notice}
        {transport.respondPermission ? (
          <div className={planActive ? 'hidden' : 'contents'}>
            <NativeChatStreamAskCard
              paneKey={identity.paneKey}
              liveRequest={takeover.question}
              onRespond={transport.respondPermission}
              onActiveChange={setAskActive}
              answerInputRef={answerInputRef}
            />
          </div>
        ) : null}
        {/* The queue tab belongs to the composer card, so it waits out every takeover. */}
        {transport.messageQueue && !askActive && takeover.composerRequest === null ? (
          <NativeChatQueueStrip
            queue={transport.messageQueue}
            composerHasDraft={() => composerRef.current?.hasDraft() ?? false}
            restoreToComposer={(text, imagePaths) =>
              composerRef.current?.restoreDraft(text, imagePaths)
            }
          />
        ) : null}
        {askActive && !planActive ? null : (
          <NativeChatComposer
            ref={composerRef}
            terminalTabId={identity.tabId}
            paneKey={identity.paneKey}
            draftScopeKey={`chat-thread:${thread.id}`}
            targetPtyId={null}
            agent={thread.agent}
            transportSend={transport.send}
            transportDispatchOption={transport.dispatchOption}
            transportInterrupt={transport.interrupt}
            canSend
            isWorking={isWorking}
            onStop={noop}
            onOptimisticSend={noOptimisticEcho}
            onOptimisticSendCanceled={noop}
            onSlashCommand={noop}
            permissionRequest={takeover.composerRequest}
            permissionRequestCount={takeover.composerRequestCount}
            onRespondPermission={transport.respondPermission}
            contextUsageEnabled
            contextMaxTokens={transport.contextWindowTokens}
            fullAccess={transport.fullAccess}
            onSetFullAccess={transport.setFullAccess}
            activeCollabProjectId={props.activeCollabProjectId}
          />
        )}
      </div>
    </NativeChatSurfaceProvider>
  )
}
