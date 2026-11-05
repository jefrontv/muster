import type { RefObject } from 'react'
import type { AskAnswerSelection, AskPrompt } from './native-chat-interactive-prompt'
import { useNativeChatQuestionAnswers } from './use-native-chat-question-answers'
import { NativeChatSeatQuestionCard } from './NativeChatSeatQuestionCard'

export type NativeChatQuestionCardProps = {
  prompt: AskPrompt
  /** Whether the snapshotted answer is still being delivered to the agent. */
  isSubmitting?: boolean
  /** Deliver the chosen answer (per-question option indices + free text). */
  onAnswer: (selections: AskAnswerSelection[]) => void
  /** Dismiss the prompt (sends Escape to the agent). */
  onCancel: () => void
  /** Exposes the free-text row so pane-level Paste can target it while the card replaces the composer. */
  answerInputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

/** An agent's AskUserQuestion prompt, drawn as the seat card that replaces the composer. */
export function NativeChatQuestionCard({
  prompt,
  isSubmitting = false,
  onAnswer,
  onCancel,
  answerInputRef
}: NativeChatQuestionCardProps): React.JSX.Element {
  const answers = useNativeChatQuestionAnswers({ prompt, onAnswer, onCancel })
  return (
    <NativeChatSeatQuestionCard
      answers={answers}
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      answerInputRef={answerInputRef}
    />
  )
}
