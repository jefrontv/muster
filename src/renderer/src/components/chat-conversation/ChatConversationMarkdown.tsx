// Chat mode's reply markdown: the chat surface's pipeline and elements at 15px,
// with tables drawn as rich table cards.

import { memo, useMemo, useRef } from 'react'
import type React from 'react'
import Markdown, { type Components } from 'react-markdown'
import { cn } from '@/lib/utils'
import { useCodeThemeClass } from '@/components/native-chat/NativeChatHighlightedCode'
import {
  markdownBlocks,
  type ChatMarkdownBlocks
} from '@/components/chat-thread/chat-markdown-blocks'
import { chatMarkdownComponents } from '@/components/chat-thread/chat-markdown-elements'
import {
  chatRehypePlugins,
  chatRemarkPlugins,
  chatUrlTransform
} from '@/components/chat-thread/chat-markdown-pipeline'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { ChatRichTable } from './ChatRichTable'

const ConversationMarkdownBlock = memo(function ConversationMarkdownBlock(props: {
  content: string
}): React.JSX.Element {
  const { onLinkClick } = useChatThreadContext()
  const components = useMemo<Components>(
    () => ({
      ...chatMarkdownComponents('prose', onLinkClick),
      table: ({ children }) => <ChatRichTable>{children}</ChatRichTable>
    }),
    [onLinkClick]
  )
  return (
    <Markdown
      remarkPlugins={chatRemarkPlugins}
      rehypePlugins={chatRehypePlugins}
      components={components}
      urlTransform={chatUrlTransform}
    >
      {props.content}
    </Markdown>
  )
})

/** Blocks are keyed by source offset, so settling a streamed reply never remounts them. */
export function ChatConversationMarkdown(props: {
  text: string
  streaming: boolean
  className?: string
}): React.JSX.Element {
  const codeThemeClass = useCodeThemeClass()
  const cache = useRef<ChatMarkdownBlocks | null>(null)
  cache.current = markdownBlocks(props.text, props.streaming, cache.current)
  return (
    <div
      className={cn(
        // Blocks render bare elements, so the outer margins of the first and last are trimmed here.
        'chat-conversation-markdown min-w-0 text-chat text-foreground [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
        codeThemeClass,
        props.className
      )}
    >
      {cache.current.blocks.map((block) => (
        <ConversationMarkdownBlock key={block.key} content={block.raw} />
      ))}
    </div>
  )
}
