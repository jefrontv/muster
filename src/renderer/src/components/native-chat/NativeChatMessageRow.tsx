import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { ArrowUp, Image as ImageIcon } from 'lucide-react'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import { formatRelativeTime } from '@/components/right-sidebar/site-panel-controls'
import {
  isTextBlock,
  type NativeChatBlock,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import { splitNativeChatBlocks } from './native-chat-tool-fold'
import {
  NATIVE_CHAT_USER_MESSAGE_FADE_MASK,
  shouldCollapseUserMessage
} from './native-chat-user-message-collapse'
import { isNativeChatPastedImagePath } from './native-chat-image-paste'
import { NativeChatToolRun } from './NativeChatToolRun'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'

function proseToMarkdown(blocks: NativeChatBlock[]): string {
  return blocks
    .map((block) => (isTextBlock(block) ? block.text : ''))
    .filter((part) => part.length > 0)
    .join('\n\n')
}

function ImageAttachmentRefs({ blocks }: { blocks: NativeChatBlock[] }): React.JSX.Element | null {
  const images = blocks.filter((block) => block.type === 'image-ref')
  if (images.length === 0) {
    return null
  }
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {images.map((image, index) => {
        const label = image.alt ?? image.path ?? image.url ?? 'Image'
        const name =
          image.path && isNativeChatPastedImagePath(image.path)
            ? translate('components.native-chat.composer.pastedImageLabel', 'Pasted image')
            : image.path
              ? basename(image.path)
              : label
        return (
          <div
            key={`${label}-${index}`}
            className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
            title={label}
          >
            <ImageIcon className="size-3.5 shrink-0" />
            <span className="truncate">{name}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Inline controls for an agent message (mobile AgentControls parity): copy the
 *  message's prose, and scroll so this message's top aligns to the viewport top.
 *  Reveals on hover / keyboard focus like the prior copy affordance. */
function AgentControls({
  markdown,
  getHtml,
  onScrollToTop,
  className
}: {
  markdown: string
  getHtml?: () => string | null
  onScrollToTop: () => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <NativeChatCopyButton text={markdown} getHtml={getHtml} />
      <button
        type="button"
        onClick={onScrollToTop}
        aria-label={translate(
          'components.native-chat.scrollMessageToTop',
          'Scroll this message to top'
        )}
        title={translate('components.native-chat.scrollMessageToTop', 'Scroll this message to top')}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowUp className="size-3.5" />
      </button>
    </div>
  )
}

/** One message: its prose first, then a collapsible run folding all of the
 *  turn's tool activity. Monochrome per STYLEGUIDE: user prompts read as a
 *  lifted card, assistant prose as body copy, reasoning de-emphasized. */
// Memoized so a streaming tick re-renders only the row whose message object
// changed — without this every delta re-parses every message's markdown.
export const NativeChatMessageRow = memo(function NativeChatMessageRow({
  message,
  expandSignal,
  onScrollMessageToTop,
  onLinkClick,
  allowFileUriLinks = false,
  deliveryFailed = false,
  suppressTools = false
}: {
  message: NativeChatMessage
  expandSignal: boolean
  /** Align this message's top to the top of the scroll viewport. */
  onScrollMessageToTop: (el: HTMLElement) => void
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  deliveryFailed?: boolean
  /** Live tool-call collapse: hide this row's tool run, keep its prose. */
  suppressTools?: boolean
}): React.JSX.Element | null {
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Rendered-markup source for the copy button's text/html clipboard flavor.
  const proseRef = useRef<HTMLDivElement | null>(null)
  // Long user prompts start collapsed; per-row state so expanding one row
  // doesn't reflow its neighbors.
  const [userMessageExpanded, setUserMessageExpanded] = useState(false)
  const { prose, tools } = useMemo(() => splitNativeChatBlocks(message.blocks), [message.blocks])
  const markdown = proseToMarkdown(prose)
  const hasImages = prose.some((block) => block.type === 'image-ref')
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  const isSystem = message.role === 'system'
  const isStreaming = message.id === NATIVE_CHAT_STREAMING_ID

  const scrollToTop = useCallback(() => {
    if (rowRef.current) {
      onScrollMessageToTop(rowRef.current)
    }
  }, [onScrollMessageToTop])

  const getProseHtml = useCallback(() => proseRef.current?.innerHTML ?? null, [])

  // Skip rows with nothing renderable so the transcript shows no empty/ghost
  // bubble.
  // After all hooks, so hook order stays unconditional.
  if (markdown.length === 0 && !hasImages && (tools.length === 0 || suppressTools)) {
    return null
  }

  if (isUser) {
    const canCollapse = shouldCollapseUserMessage(markdown)
    const collapsed = canCollapse && !userMessageExpanded
    // Why: an optimistic echo is rendered identically to a real user turn (no
    // muting, no "Queued" label) so that when the real transcript turn lands and
    // replaces it, there is no visible state change — the send just appears and
    // stays. (A distinct "queued" treatment flickered normal→queued→normal as the
    // transcript caught up.)
    return (
      <div
        ref={rowRef}
        data-message-id={message.id}
        className="group flex flex-col items-end gap-0.5"
      >
        {/* User turns get a distinct muted fill (not the card/canvas color) so
            the prompt reads apart from the assistant's body copy. */}
        <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-muted px-3.5 py-2.5 text-sm text-foreground">
          <div
            className={cn('relative', collapsed && 'max-h-44 overflow-hidden')}
            data-user-message-collapsed={collapsed ? 'true' : 'false'}
            // Mask fade so the cut-off reads as "more below" over the bubble fill.
            style={
              collapsed
                ? {
                    WebkitMaskImage: NATIVE_CHAT_USER_MESSAGE_FADE_MASK,
                    maskImage: NATIVE_CHAT_USER_MESSAGE_FADE_MASK
                  }
                : undefined
            }
          >
            {markdown ? (
              <>
                <ImageAttachmentRefs blocks={prose} />
                <CommentMarkdown
                  ref={proseRef}
                  content={markdown}
                  variant="document"
                  className="text-sm"
                  onLinkClick={onLinkClick}
                  allowFileUriLinks={allowFileUriLinks}
                  codeBlockActions
                />
              </>
            ) : (
              <ImageAttachmentRefs blocks={prose} />
            )}
          </div>
        </div>
        {canCollapse ? (
          <button
            type="button"
            aria-expanded={userMessageExpanded}
            onClick={() => setUserMessageExpanded((value) => !value)}
            className="rounded-md text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {userMessageExpanded
              ? translate('components.native-chat.userMessage.showLess', 'Show less')
              : translate('components.native-chat.userMessage.showFull', 'Show full message')}
          </button>
        ) : null}
        {deliveryFailed ? (
          <div className="max-w-[85%] text-[11px] text-destructive/80">
            {translate(
              'components.native-chat.launchPromptNotDelivered',
              'Not delivered — check the terminal'
            )}
          </div>
        ) : null}
        {/* Hover-quiet metadata: relative timestamp + copy, revealed under the
            bubble only while the row is hovered. */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          {message.timestamp !== null ? (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatRelativeTime(message.timestamp)}
            </span>
          ) : null}
          {markdown ? <NativeChatCopyButton text={markdown} getHtml={getProseHtml} /> : null}
        </div>
      </div>
    )
  }

  // Plain assistant prose is the copyable unit; reasoning/system asides stay
  // chrome-free. The controls reveal on hover (and on keyboard focus-within) —
  // withheld while this is the live streaming bubble (its text is unsettled).
  const showControls = !isReasoning && !isSystem && !isStreaming && markdown.length > 0

  return (
    <div
      ref={rowRef}
      data-message-id={message.id}
      className={cn(
        'group relative max-w-full text-sm leading-relaxed text-foreground',
        // Reasoning is the agent thinking aloud — quieter, italic, like an aside.
        isReasoning && 'border-l-2 border-border/60 pl-3 italic text-muted-foreground',
        isSystem && 'text-xs text-muted-foreground'
      )}
    >
      {showControls ? (
        <AgentControls
          markdown={markdown}
          getHtml={getProseHtml}
          onScrollToTop={scrollToTop}
          className="absolute -top-8 right-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        />
      ) : null}
      <ImageAttachmentRefs blocks={prose} />
      {markdown ? (
        <CommentMarkdown
          ref={proseRef}
          content={markdown}
          variant="document"
          className="text-sm"
          onLinkClick={onLinkClick}
          allowFileUriLinks={allowFileUriLinks}
          codeBlockActions
        />
      ) : null}
      {tools.length > 0 && !suppressTools ? (
        <NativeChatToolRun blocks={tools} expandSignal={expandSignal} />
      ) : null}
    </div>
  )
})
