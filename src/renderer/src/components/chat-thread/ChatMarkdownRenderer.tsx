import { memo, useMemo } from 'react'
import type React from 'react'
import Markdown from 'react-markdown'
import { chatMarkdownComponents, type ChatMarkdownDensity } from './chat-markdown-elements'
import { chatRehypePlugins, chatRemarkPlugins, chatUrlTransform } from './chat-markdown-pipeline'
import { useChatThreadContext } from './chat-thread-context'

/** One markdown block of a chat reply or reasoning body. Renders no wrapper element. */
export const ChatMarkdownRenderer = memo(function ChatMarkdownRenderer(props: {
  content: string
  density: ChatMarkdownDensity
}): React.JSX.Element {
  const { onLinkClick } = useChatThreadContext()
  const components = useMemo(
    () => chatMarkdownComponents(props.density, onLinkClick),
    [props.density, onLinkClick]
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
