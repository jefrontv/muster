// The composer seat under the engine-drawn transcript: the existing chat
// composer (pickers, attachments, menus, approvals) in the seat's chat look.
// The engine draws the user's turn itself, so there is no optimistic echo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { ChatThread } from '../../../../shared/chat-mode-types'
import { chatThreadPaneIdentity } from '@/lib/chat-thread-pane-identity'
import {
  NativeChatComposer,
  type NativeChatComposerHandle
} from '@/components/native-chat/NativeChatComposer'
import { NativeChatQueueStrip } from '@/components/native-chat/NativeChatQueueStrip'
import { NativeChatSubagentTab } from '@/components/native-chat/NativeChatSubagentTab'
import { NativeChatStreamAskCard } from '@/components/native-chat/NativeChatStreamAskCard'
import { pickNativeChatTakeover } from '@/components/native-chat/native-chat-takeover-precedence'
import { NativeChatSurfaceProvider } from '@/components/native-chat/native-chat-surface-context'
import { useNativeChatSurfaceValue } from '@/components/native-chat/use-native-chat-surface-value'
import type { NativeChatTransport } from '@/components/native-chat/native-chat-view-types'
import { useChatEngineMeta } from '@/components/chat-thread/use-chat-engine-thread'
import {
  ChatComposerAccessMenu,
  ChatWebAccessToggle
} from '@/components/chat-conversation/ChatComposerLeadControls'
import { ChatComposerQuoteStrip } from '@/components/chat-conversation/ChatComposerQuoteStrip'
import { quoteMessage } from '@/components/chat-conversation/chat-composer-quote'

const noOptimisticEcho = (): undefined => undefined
const noop = (): void => undefined

export function ChatThreadComposerSeat(props: {
  thread: ChatThread
  transport: NativeChatTransport
  workingDirectory: string | null
  activeCollabProjectId: number | null
  /** Session state line (starting, ended, missing folder) above the composer. */
  notice?: React.ReactNode
  /** A reply quoted from the transcript; it leads the next message. */
  quote?: string | null
  onClearQuote?: () => void
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
  const { fullAccess, setFullAccess } = transport
  const { quote = null, onClearQuote } = props
  const transportSend = transport.send
  const send = useCallback<typeof transportSend>(
    async (text, imagePaths, mode) => {
      if (!quote) {
        return transportSend(text, imagePaths, mode)
      }
      const outcome = await transportSend(quoteMessage(quote, text), imagePaths, mode)
      if (outcome !== 'failed') {
        onClearQuote?.()
      }
      return outcome
    },
    [quote, onClearQuote, transportSend]
  )
  useEffect(() => {
    if (quote) {
      composerRef.current?.focus()
    }
  }, [quote])
  const seatSurface = useMemo(
    () => ({
      ...surface,
      composerLeadSlot: (
        <>
          {setFullAccess ? (
            <ChatComposerAccessMenu
              threadId={thread.id}
              fullAccess={fullAccess === true}
              onSetFullAccess={setFullAccess}
            />
          ) : null}
          <ChatWebAccessToggle threadId={thread.id} />
        </>
      )
    }),
    [surface, thread.id, fullAccess, setFullAccess]
  )
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
        {!askActive && takeover.composerRequest === null ? (
          <NativeChatSubagentTab paneKey={identity.paneKey} />
        ) : null}
        {quote && onClearQuote && !askActive && takeover.composerRequest === null ? (
          <ChatComposerQuoteStrip quote={quote} onClear={onClearQuote} />
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
            transportSend={send}
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
            activeCollabProjectId={props.activeCollabProjectId}
          />
        )}
      </div>
    </NativeChatSurfaceProvider>
  )
}
