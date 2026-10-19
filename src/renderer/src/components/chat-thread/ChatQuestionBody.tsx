import type React from 'react'
import { translate } from '@/i18n/i18n'
import { questionModel } from './chat-tool-question-model'
import type { ChatToolBodyProps } from './chat-tool-body-types'

/** The record of what was asked. Answering happens in the composer takeover. */
export function ChatQuestionBody({ item }: ChatToolBodyProps): React.JSX.Element | null {
  const questions = questionModel(item)
  if (questions.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 text-[13px]">
      {questions.map((question) => (
        <div key={question.question}>
          <div className="text-foreground">{question.question}</div>
          <div className="text-muted-foreground">
            {question.answer ??
              (item.status === 'done'
                ? translate('components.chat-thread.noAnswer', 'No answer')
                : question.options.map((option) => option.label).join(' / '))}
          </div>
        </div>
      ))}
    </div>
  )
}
