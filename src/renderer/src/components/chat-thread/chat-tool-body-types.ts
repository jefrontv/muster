import type React from 'react'
import type { ChatToolItem } from './chat-tool-input'

export type ChatToolBodyProps = { item: ChatToolItem }

export type ChatToolRenderer = {
  Body: React.ComponentType<ChatToolBodyProps>
  /** Shown without a click: diffs, plans and questions are the point of the call. */
  openByDefault: (item: ChatToolItem) => boolean
}
