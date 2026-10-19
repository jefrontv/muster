import type React from 'react'
import type { ChatToolBodyProps } from './chat-tool-body-types'
import { ChatToolIoCard, type ChatToolIoSection } from './ChatToolIoCard'

const inputText = (input: unknown): string => {
  if (input === undefined || input === null) {
    return ''
  }
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/** Any tool without its own renderer: the arguments it got and what it returned. */
export function ChatGenericToolBody({ item }: ChatToolBodyProps): React.JSX.Element | null {
  const input = inputText(item.input)
  const output = item.result?.text ?? ''
  const sections: ChatToolIoSection[] = []
  if (input && input !== '{}') {
    sections.push({ kind: 'in', text: input })
  }
  if (output) {
    sections.push({ kind: 'out', text: output, isError: item.status === 'error' })
  }
  return <ChatToolIoCard sections={sections} />
}
