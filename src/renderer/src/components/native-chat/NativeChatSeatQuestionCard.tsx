// The seated question takeover (DSH QuestionComposer): replaces the composer at
// the text column's width, header and footer fixed while the body scrolls, and
// a pager in the footer instead of a tab strip.

import type React from 'react'
import { useCallback, useState, type RefObject } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NativeChatQuestionAnswers } from './use-native-chat-question-answers'
import {
  CHAT_TAKEOVER_CARD_CLASS,
  CHAT_TAKEOVER_ERROR_CLASS,
  CHAT_TAKEOVER_FRAME_CLASS,
  CHAT_TAKEOVER_ICON_BUTTON_CLASS,
  CHAT_TAKEOVER_OUTLINE_CLASS,
  CHAT_TAKEOVER_PRIMARY_CLASS
} from './chat-seat-takeover-classes'
import { NativeChatSeatAnswerField, NativeChatSeatOptionRow } from './NativeChatSeatQuestionOptions'

export function NativeChatSeatQuestionCard({
  answers,
  isSubmitting,
  onCancel,
  answerInputRef
}: {
  answers: NativeChatQuestionAnswers
  isSubmitting: boolean
  onCancel: () => void
  answerInputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}): React.JSX.Element {
  const { index, total, isLast, question, currentAnswered } = answers
  const [minimized, setMinimized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answerRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      if (answerInputRef) {
        answerInputRef.current = element
      }
    },
    [answerInputRef]
  )
  const goTo = (next: number): void => {
    setError(null)
    answers.setIndex(next)
  }
  const submit = (): void => {
    if (!currentAnswered) {
      setError(
        translate(
          'components.native-chat.question.unanswered',
          'Select an option or type an answer.'
        )
      )
      return
    }
    setError(null)
    answers.confirm()
  }
  const minimizeLabel = minimized
    ? translate('components.native-chat.question.expand', 'Expand question')
    : translate('components.native-chat.question.minimize', 'Collapse question')
  const hasOptions = question.options.length > 0

  return (
    <div className={CHAT_TAKEOVER_FRAME_CLASS}>
      <section
        aria-label={question.question}
        aria-busy={isSubmitting}
        className={cn(
          CHAT_TAKEOVER_CARD_CLASS,
          minimized ? 'max-h-none' : 'max-h-[min(60vh,520px)] pb-2.5'
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-start justify-between gap-4 pt-5 pr-4 pl-6',
            minimized && 'pb-3.5'
          )}
        >
          <div className="min-w-0">
            {question.header ? (
              <p className="mb-[5px] text-[11px] leading-4 text-chat-ink-tertiary">
                {question.header}
              </p>
            ) : null}
            <h3 className="m-0 text-base leading-[22px] font-medium break-words">
              {question.question}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={minimizeLabel}
              title={minimizeLabel}
              aria-expanded={!minimized}
              onClick={() => setMinimized((value) => !value)}
              className={CHAT_TAKEOVER_ICON_BUTTON_CLASS}
            >
              {minimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            <button
              type="button"
              aria-label={translate('components.native-chat.question.cancel', 'Cancel')}
              title={translate('components.native-chat.question.cancel', 'Cancel')}
              onClick={onCancel}
              className={CHAT_TAKEOVER_ICON_BUTTON_CLASS}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {minimized ? null : (
          <>
            <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <div className="mt-2 flex flex-col gap-px px-3 py-1">
                {question.options.map((option, i) => (
                  <NativeChatSeatOptionRow
                    key={`${i}:${option.label}`}
                    index={i}
                    option={option}
                    multiSelect={question.multiSelect}
                    selected={(answers.selections[index] ?? []).includes(i)}
                    disabled={isSubmitting}
                    onSelect={() => {
                      setError(null)
                      answers.pickOption(i)
                    }}
                  />
                ))}
                {hasOptions ? (
                  <NativeChatSeatAnswerField
                    block={false}
                    value={answers.otherText[index] ?? ''}
                    disabled={isSubmitting}
                    inputRef={answerRef}
                    onChange={(value) => answers.setOther(index, value)}
                    onContinue={() => answers.confirm(true)}
                  />
                ) : null}
              </div>
              {hasOptions ? null : (
                <NativeChatSeatAnswerField
                  block
                  value={answers.otherText[index] ?? ''}
                  disabled={isSubmitting}
                  inputRef={answerRef}
                  onChange={(value) => answers.setOther(index, value)}
                  onContinue={() => answers.confirm(true)}
                />
              )}
            </div>

            <div className="mt-3 flex shrink-0 items-center justify-between gap-3 pr-2.5 pl-[18px]">
              {total > 1 ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={translate(
                      'components.native-chat.question.previous',
                      'Previous question'
                    )}
                    disabled={index === 0 || isSubmitting}
                    onClick={() => goTo(index - 1)}
                    className={CHAT_TAKEOVER_ICON_BUTTON_CLASS}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="px-1 text-sm leading-6 font-medium whitespace-nowrap text-chat-ink-secondary tabular-nums [word-spacing:-2px]">
                    {translate(
                      'components.native-chat.question.progress',
                      '{{value0}} / {{value1}}',
                      {
                        value0: index + 1,
                        value1: total
                      }
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={translate(
                      'components.native-chat.question.nextQuestion',
                      'Next question'
                    )}
                    disabled={isLast || isSubmitting}
                    onClick={() => goTo(index + 1)}
                    className={CHAT_TAKEOVER_ICON_BUTTON_CLASS}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
              <p role="status" className={cn(CHAT_TAKEOVER_ERROR_CLASS, 'flex-1 text-right')}>
                {error}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setError(null)
                    answers.skip()
                  }}
                  className={CHAT_TAKEOVER_OUTLINE_CLASS}
                >
                  {translate('components.native-chat.question.skip', 'Skip')}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={submit}
                  className={CHAT_TAKEOVER_PRIMARY_CLASS}
                >
                  {isSubmitting
                    ? translate('components.native-chat.question.sending', 'Sending…')
                    : isLast
                      ? translate('components.native-chat.question.send', 'Submit')
                      : translate('components.native-chat.question.next', 'Next')}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
