// AskUserQuestion's questions, and the answers the CLI wrote back once the user replied.

import { inputList, inputRecord, type ChatToolItem } from './chat-tool-input'

export type ChatQuestion = {
  question: string
  header: string | null
  multiSelect: boolean
  options: { label: string; description: string | null }[]
  /** The chosen labels (or free text), once answered. */
  answer: string | null
}

/** The CLI reports answers as `"question"="answer"` pairs in its tool_result text. */
function answersOf(text: string): Map<string, string> {
  const answers = new Map<string, string>()
  for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g)) {
    answers.set(match[1]!, match[2]!)
  }
  return answers
}

export function questionModel(item: ChatToolItem): ChatQuestion[] {
  const answers =
    item.status === 'done' && item.result ? answersOf(item.result.text) : new Map<string, string>()
  return inputList(item.input, 'questions').flatMap((entry): ChatQuestion[] => {
    const question = inputRecord(entry)
    if (typeof question.question !== 'string' || question.question === '') {
      return []
    }
    return [
      {
        question: question.question,
        header: typeof question.header === 'string' ? question.header : null,
        multiSelect: question.multiSelect === true,
        options: inputList(question, 'options').flatMap((option) => {
          const record = inputRecord(option)
          return typeof record.label === 'string'
            ? [
                {
                  label: record.label,
                  description: typeof record.description === 'string' ? record.description : null
                }
              ]
            : []
        }),
        answer: answers.get(question.question) ?? null
      }
    ]
  })
}
