import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, WrapText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { extractCodeBlockLanguage } from '@/components/sidebar/comment-markdown-code-block'

function nodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join('')
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeText(node.props.children)
  }
  return ''
}

const COPIED_RESET_MS = 1_200

const actionClass =
  'flex size-6 shrink-0 items-center justify-center rounded-[6px] text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:bg-chat-hover hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'

/** Fenced code: banner with the language and always-visible wrap and copy; wraps by default, no height cap. */
export function ChatMarkdownCodeBlock(props: {
  children: React.ReactNode
  /** Pins the banner while the block scrolls past; off inside a sticky reasoning body. */
  sticky: boolean
}): React.JSX.Element {
  const [wrapped, setWrapped] = useState(true)
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current)
      }
    },
    []
  )
  const language = extractCodeBlockLanguage(props.children)
  const { children } = props
  const copy = useCallback(async () => {
    try {
      await window.api.ui.writeClipboardText(nodeText(children))
      setCopied(true)
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current)
      }
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = null
        setCopied(false)
      }, COPIED_RESET_MS)
    } catch {
      /* best-effort: clipboard can reject when unfocused */
    }
  }, [children])
  const wrapLabel = wrapped
    ? translate('components.native-chat.codeBlock.unwrap', 'Disable line wrap')
    : translate('components.native-chat.codeBlock.wrap', 'Wrap lines')
  const copyLabel = copied
    ? translate('components.native-chat.codeBlock.copied', 'Copied')
    : translate('components.native-chat.codeBlock.copy', 'Copy code')
  return (
    <div className="my-4 min-w-0 max-w-full rounded-2xl bg-chat-code">
      {/* Square page-coloured backing hides prose scrolling past the pinned banner's rounded corners. */}
      <div className={cn(props.sticky && 'sticky top-0 z-[6] bg-background')}>
        <div className="flex select-none items-center justify-between gap-3 rounded-t-2xl bg-chat-code px-3.5 py-[9px] text-[11px] leading-[18px]">
          <span className="min-w-0 truncate font-mono text-foreground">
            {language?.toLowerCase() ?? ''}
          </span>
          <span
            role="toolbar"
            aria-label={translate('components.native-chat.codeBlock.actions', 'Code block actions')}
            // Negative margin keeps 24px targets inside the 18px banner line.
            className="-my-[3px] flex shrink-0 items-center gap-1"
          >
            <button
              type="button"
              aria-pressed={wrapped}
              aria-label={wrapLabel}
              title={wrapLabel}
              onClick={() => setWrapped((value) => !value)}
              className={cn(actionClass, wrapped && 'text-chat-ink-secondary')}
            >
              <WrapText className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={copyLabel}
              title={copyLabel}
              onClick={copy}
              className={cn(actionClass, copied && 'text-status-success')}
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
            </button>
          </span>
        </div>
      </div>
      <pre
        className={cn(
          'm-0 max-w-full overflow-x-auto rounded-b-2xl bg-chat-code p-4 font-mono text-[11px] leading-[19px] text-foreground',
          '[&>code]:rounded-none [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[length:inherit] [&>code]:leading-[inherit]',
          wrapped ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
        )}
      >
        {props.children}
      </pre>
    </div>
  )
}
