import React from 'react'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import {
  isMermaidFence,
  isMermaidPre,
  renderMermaidFence
} from '@/components/sidebar/comment-mermaid-fence'
import { ChatMarkdownCodeBlock } from './ChatMarkdownCodeBlock'

/** Prose is the assistant reply (14/24); compact is the reasoning body (13/20). */
export type ChatMarkdownDensity = 'prose' | 'compact'

type ElementProps = { node?: unknown; className?: string }

function styled(tag: string, className: string): React.FC<ElementProps> {
  function Styled({ node: _node, className: own, ...rest }: ElementProps): React.ReactElement {
    return React.createElement(tag, { ...rest, className: cn(className, own) })
  }
  Styled.displayName = `ChatMarkdown.${tag}`
  return Styled
}

const LIST_ITEM =
  'pl-0.5 marker:text-chat-ink-secondary [&:not(:first-child)]:mt-1.5 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&>input]:pointer-events-none [&>input]:mr-2 [&>input]:accent-chat-ink-secondary [&>p]:my-2 [&>ol]:mt-1 [&>ul]:mt-1'

const CELL = 'min-w-[100px] max-w-[min(30vw,320px)] px-4 py-2.5 first:pl-0 last:pr-0'

const PROSE = {
  p: 'my-4',
  h1: 'mb-4 mt-8 text-[21px] font-bold leading-[30px] [&_strong]:font-[inherit]',
  h2: 'mb-4 mt-8 text-[19px] font-bold leading-[28px] [&_strong]:font-[inherit]',
  h3: 'mb-4 mt-8 text-[18px] font-bold leading-[26px] [&_strong]:font-[inherit]',
  h4: 'my-4 text-sm font-semibold leading-6 [&_strong]:font-[inherit]',
  list: 'my-4 pl-[18px]',
  hr: 'my-8 h-[0.5px] border-0 bg-chat-line-2',
  blockquote: 'my-4 border-l-2 border-chat-ink-caption pl-3.5'
}

// Reasoning reads as one quiet tier, so headings drop to body size.
const COMPACT = {
  p: 'my-2',
  h1: 'my-2 font-semibold',
  h2: 'my-2 font-semibold',
  h3: 'my-2 font-semibold',
  h4: 'my-2 font-semibold',
  list: 'my-2 pl-[18px]',
  hr: 'my-4 h-[0.5px] border-0 bg-chat-line-2',
  blockquote: 'my-2 border-l-2 border-chat-ink-caption pl-3.5'
}

function handleAnchorClick(
  event: React.MouseEvent<HTMLElement>,
  href: string | undefined,
  onLinkClick: CommentMarkdownLinkClickHandler | undefined
): void {
  event.stopPropagation()
  if (href?.trim().toLowerCase().startsWith('file:')) {
    event.preventDefault()
  }
  onLinkClick?.(event, href)
}

/** Chat-only element renderers; CommentMarkdown keeps its own for sidebar comments. */
export function chatMarkdownComponents(
  density: ChatMarkdownDensity,
  onLinkClick: CommentMarkdownLinkClickHandler | undefined
): Components {
  const tier = density === 'prose' ? PROSE : COMPACT
  return {
    p: styled('p', tier.p),
    h1: styled('h1', tier.h1),
    h2: styled('h2', tier.h2),
    h3: styled('h3', tier.h3),
    h4: styled('h4', tier.h4),
    h5: styled('h5', tier.h4),
    h6: styled('h6', tier.h4),
    strong: styled('strong', 'font-semibold'),
    ul: styled('ul', cn(tier.list, 'list-disc')),
    ol: styled('ol', cn(tier.list, 'list-decimal')),
    li: styled('li', LIST_ITEM),
    hr: styled('hr', tier.hr),
    blockquote: styled('blockquote', tier.blockquote),
    a: ({ href, children }) => (
      <a
        href={href || undefined}
        target="_blank"
        rel="noreferrer"
        className="rounded-[2px] font-medium text-chat-accent no-underline decoration-dotted underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
        onClick={(event) => handleAnchorClick(event, href, onLinkClick)}
      >
        {children}
      </a>
    ),
    code: ({ className, children }) =>
      isMermaidFence(className) ? (
        renderMermaidFence(
          children,
          'my-4 min-w-0 max-w-full overflow-x-auto rounded-2xl bg-chat-code p-4 [&_.mermaid-block]:min-w-0 [&_.mermaid-block_pre]:my-0 [&_.mermaid-block_pre]:font-mono [&_.mermaid-block_pre]:text-[11px]'
        )
      ) : (
        <code
          className={cn(
            'rounded-[8px] border-[0.5px] border-chat-line-1 bg-chat-inline-code px-[5px] font-mono text-[0.875em] leading-[19px] [box-decoration-break:clone] [overflow-wrap:anywhere]',
            // Fenced code keeps the hljs language class; the pill styling is undone by the <pre>.
            className
          )}
        >
          {children}
        </code>
      ),
    // Mermaid renders a <div>, which is invalid inside <pre>, so unwrap it.
    pre: ({ children }) =>
      isMermaidPre(children) ? (
        <>{children}</>
      ) : (
        <ChatMarkdownCodeBlock sticky={density === 'prose'}>{children}</ChatMarkdownCodeBlock>
      ),
    table: ({ children }) => (
      <div className="my-4 max-w-full overflow-x-auto overscroll-x-contain">
        {/* Four or more columns keep their natural width and scroll; fewer fill the column. */}
        <table className="w-full border-collapse [&:has(th:nth-child(4))]:w-max">{children}</table>
      </div>
    ),
    th: ({ node: _node, className, ...rest }) => (
      <th
        {...rest}
        className={cn(
          CELL,
          'border-b-[0.5px] border-chat-line-3 text-start text-[13px] font-medium leading-[22px]',
          className
        )}
      />
    ),
    td: ({ node: _node, className, ...rest }) => (
      <td
        {...rest}
        className={cn(
          CELL,
          'border-b-[0.5px] border-chat-line-2 text-[13px] leading-[22px] [&_code]:text-[11px]',
          className
        )}
      />
    ),
    img: ({ alt, src }) => (
      <img
        src={src}
        alt={alt ?? ''}
        className={cn(
          'my-4 block max-h-96 max-w-full rounded-xl object-contain',
          onLinkClick && 'cursor-pointer'
        )}
        onClick={(event) => {
          if (onLinkClick) {
            event.stopPropagation()
            onLinkClick(event, src)
          }
        }}
      />
    )
  }
}
