import type React from 'react'
import { bashModel } from './chat-bash-model'
import type { ChatToolBodyProps } from './chat-tool-body-types'
import { ChatToolIoCard, type ChatToolIoSection } from './ChatToolIoCard'

export function ChatBashBody({ item }: ChatToolBodyProps): React.JSX.Element | null {
  const bash = bashModel(item)
  const output = [bash.stdout, bash.stderr].filter(Boolean).join('\n')
  const sections: ChatToolIoSection[] = []
  if (bash.command) {
    sections.push({ kind: 'in', text: bash.command })
  }
  if (output) {
    sections.push({ kind: 'out', text: output, isError: bash.isError, tall: true })
  }
  return <ChatToolIoCard sections={sections} />
}
