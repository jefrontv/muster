// Bottom input region of NativeChatView: live question/approval card, the
// stream-json AskUserQuestion card, or the composer.

import type React from 'react'
import { useState } from 'react'
import type { RefObject } from 'react'
import { NativeChatComposer, type NativeChatComposerHandle } from './NativeChatComposer'
import { NativeChatInteractiveCard } from './NativeChatInteractiveCard'
import { NativeChatStreamAskCard, streamAskPermissionRequest } from './NativeChatStreamAskCard'
import type { NativeChatInteractiveSend } from './use-native-chat-interactive-send'
import type { NativeChatTransport } from './native-chat-view-types'
import type { NativeChatSession } from '../../../../shared/native-chat-types'

export function NativeChatViewInput({
  paneKey,
  draftScopeKey,
  terminalTabId,
  targetPtyId,
  agent,
  transport,
  interactiveSend,
  canSend,
  isWorking,
  questionActive,
  setQuestionActive,
  questionAnswerInputRef,
  composerRef,
  stopAgent,
  onOptimisticSend,
  onOptimisticSendCanceled,
  onSlashCommand,
  onSwitchToTerminal,
  readTerminalScreen,
  runtimeEnvironmentId,
  activeCollabProjectId
}: {
  paneKey: string
  draftScopeKey: string | null
  terminalTabId: string
  targetPtyId: string | null
  agent: NativeChatSession['agent']
  transport: NativeChatTransport | null
  interactiveSend: NativeChatInteractiveSend
  canSend: boolean
  isWorking: boolean
  questionActive: boolean
  setQuestionActive: (showing: boolean) => void
  questionAnswerInputRef: RefObject<HTMLInputElement | null>
  composerRef: RefObject<NativeChatComposerHandle | null>
  stopAgent: () => void
  onOptimisticSend: (text: string, imagePaths?: string[]) => string | undefined
  onOptimisticSendCanceled: (pendingId: string) => void
  onSlashCommand: (command: string) => void
  onSwitchToTerminal?: () => void
  readTerminalScreen?: () => string | null
  runtimeEnvironmentId: string | null
  activeCollabProjectId: number | null
}): React.JSX.Element {
  const streamAsk = streamAskPermissionRequest(transport?.permissionRequests?.[0])
  const [streamAskActive, setStreamAskActive] = useState(false)
  return (
    <>
      <NativeChatInteractiveCard
        paneKey={paneKey}
        send={interactiveSend}
        canSend={canSend}
        onShowingQuestionChange={setQuestionActive}
        answerInputRef={questionAnswerInputRef}
        suppressApproval={transport !== null}
        suppressQuestion={transport !== null}
      />
      {transport?.respondPermission ? (
        <NativeChatStreamAskCard
          paneKey={paneKey}
          liveRequest={streamAsk}
          onRespond={transport.respondPermission}
          onActiveChange={setStreamAskActive}
          answerInputRef={questionAnswerInputRef}
        />
      ) : null}
      {questionActive || streamAskActive ? null : (
        <NativeChatComposer
          ref={composerRef}
          terminalTabId={terminalTabId}
          paneKey={paneKey}
          {...(draftScopeKey ? { draftScopeKey } : {})}
          targetPtyId={targetPtyId}
          agent={agent}
          transportSend={transport?.send}
          transportDispatchOption={transport?.dispatchOption}
          transportInterrupt={transport?.interrupt}
          canSend={canSend}
          isWorking={isWorking}
          onStop={stopAgent}
          onOptimisticSend={onOptimisticSend}
          onOptimisticSendCanceled={onOptimisticSendCanceled}
          onSlashCommand={onSlashCommand}
          onSwitchToTerminal={onSwitchToTerminal}
          readTerminalScreen={readTerminalScreen}
          permissionRequest={transport?.permissionRequests?.[0] ?? null}
          permissionRequestCount={transport?.permissionRequests?.length ?? 0}
          onRespondPermission={transport?.respondPermission}
          contextUsageEnabled={runtimeEnvironmentId === null}
          contextMaxTokens={transport?.contextWindowTokens}
          fullAccess={transport?.fullAccess}
          onSetFullAccess={transport?.setFullAccess}
          activeCollabProjectId={activeCollabProjectId}
        />
      )}
    </>
  )
}
