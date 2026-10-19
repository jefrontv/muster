import { memo, useRef } from 'react'
import type React from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { useCodeThemeClass } from '@/components/native-chat/NativeChatHighlightedCode'
import { markdownBlocks, type ChatMarkdownBlocks } from './chat-markdown-blocks'
import { useChatThreadContext } from './chat-thread-context'

const ChatMarkdownBlock = memo(function ChatMarkdownBlock(props: { raw: string }) {
  const { onLinkClick } = useChatThreadContext()
  return (
    <CommentMarkdown
      content={props.raw}
      variant="document"
      className="text-sm"
      onLinkClick={onLinkClick}
      allowFileUriLinks
      codeBlockActions
      chat
    />
  )
})

/** Assistant prose. Blocks are keyed by source offset, so settling never remounts them. */
export function ChatMarkdown(props: { text: string; streaming: boolean }): React.JSX.Element {
  const codeThemeClass = useCodeThemeClass()
  const cache = useRef<ChatMarkdownBlocks | null>(null)
  cache.current = markdownBlocks(props.text, props.streaming, cache.current)
  return (
    <div className={cn('chat-thread-markdown min-w-0', codeThemeClass)}>
      {cache.current.blocks.map((block) => (
        <ChatMarkdownBlock key={block.key} raw={block.raw} />
      ))}
    </div>
  )
}
