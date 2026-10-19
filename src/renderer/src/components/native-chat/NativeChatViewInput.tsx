// Bottom input region of NativeChatView: live question/approval card or the
// composer.

import type React from 'react'
import type { RefObject } from 'react'
import { NativeChatComposer, type NativeChatComposerHandle } from './NativeChatComposer'
import { NativeChatInteractiveCard } from './NativeChatInteractiveCard'
import type { NativeChatInteractiveSend } from './use-native-chat-interactive-send'
import type { NativeChatSession } from '../../../../shared/native-chat-types'

export function NativeChatViewInput({
  paneKey,
  terminalTabId,
  targetPtyId,
  agent,
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
  runtimeEnvironmentId
}: {
  paneKey: string
  terminalTabId: string
  targetPtyId: string | null
  agent: NativeChatSession['agent']
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
}): React.JSX.Element {
  return (
    <div className="shrink-0">
      <NativeChatInteractiveCard
        paneKey={paneKey}
        send={interactiveSend}
        canSend={canSend}
        onShowingQuestionChange={setQuestionActive}
        answerInputRef={questionAnswerInputRef}
      />
      {questionActive ? null : (
        <NativeChatComposer
          ref={composerRef}
          terminalTabId={terminalTabId}
          paneKey={paneKey}
          targetPtyId={targetPtyId}
          agent={agent}
          canSend={canSend}
          isWorking={isWorking}
          onStop={stopAgent}
          onOptimisticSend={onOptimisticSend}
          onOptimisticSendCanceled={onOptimisticSendCanceled}
          onSlashCommand={onSlashCommand}
          onSwitchToTerminal={onSwitchToTerminal}
          readTerminalScreen={readTerminalScreen}
          contextUsageEnabled={runtimeEnvironmentId === null}
        />
      )}
    </div>
  )
}
