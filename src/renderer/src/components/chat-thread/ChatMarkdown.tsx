import { useRef } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { useCodeThemeClass } from '@/components/native-chat/NativeChatHighlightedCode'
import { markdownBlocks, type ChatMarkdownBlocks } from './chat-markdown-blocks'
import type { ChatMarkdownDensity } from './chat-markdown-elements'
import { ChatMarkdownRenderer } from './ChatMarkdownRenderer'

const DENSITY_CLASS: Record<ChatMarkdownDensity, string> = {
  prose: 'text-sm leading-6 text-foreground',
  compact: 'text-[13px] leading-5 text-chat-ink-tertiary'
}

/** Chat markdown. Blocks are keyed by source offset, so settling never remounts them. */
export function ChatMarkdown(props: {
  text: string
  streaming: boolean
  density?: ChatMarkdownDensity
}): React.JSX.Element {
  const density = props.density ?? 'prose'
  const codeThemeClass = useCodeThemeClass()
  const cache = useRef<ChatMarkdownBlocks | null>(null)
  cache.current = markdownBlocks(props.text, props.streaming, cache.current)
  return (
    <div
      className={cn(
        // Blocks render bare elements, so the outer margins of the first and last are trimmed here.
        'chat-thread-markdown min-w-0 [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
        DENSITY_CLASS[density],
        codeThemeClass
      )}
    >
      {cache.current.blocks.map((block) => (
        <ChatMarkdownRenderer key={block.key} content={block.raw} density={density} />
      ))}
    </div>
  )
}
