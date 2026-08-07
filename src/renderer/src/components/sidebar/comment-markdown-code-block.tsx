import React from 'react'
import { Check, Copy, WrapText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

// react-markdown hands <pre> its rendered <code> child; the fence's raw text
// and language live on that child's props, so both are recovered here.

function flattenNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(flattenNodeText).join('')
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return flattenNodeText(node.props.children)
  }
  return ''
}

/** The fence's language label (```ts → "ts") from the code child's className. */
export function extractCodeBlockLanguage(children: React.ReactNode): string | null {
  const nodes = Array.isArray(children) ? children : [children]
  for (const node of nodes) {
    if (React.isValidElement<{ className?: string }>(node)) {
      const match = /language-([\w+#.-]+)/.exec(node.props.className ?? '')
      if (match) {
        return match[1]
      }
    }
  }
  return null
}

const COPIED_RESET_MS = 1_200

/**
 * Fenced code block with a slim header: language label left; wrap-toggle and
 * copy actions right, revealed on hover/focus. Rendered only when a surface
 * opts in via CommentMarkdown's `codeBlockActions` — every other markdown
 * surface keeps the bare <pre>.
 */
export function CommentMarkdownCodeBlock({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [wrapped, setWrapped] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const resetTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const language = extractCodeBlockLanguage(children)

  const handleCopy = React.useCallback(async () => {
    const code = flattenNodeText(children)
    try {
      // Electron clipboard IPC when available (navigator.clipboard can reject
      // silently in some renderer contexts); web falls back to the browser API.
      await (window.api?.ui?.writeClipboardText
        ? window.api.ui.writeClipboardText(code)
        : navigator.clipboard.writeText(code))
      setCopied(true)
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null
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

  const actionClassName =
    'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="group/codeblock my-3 max-w-full overflow-hidden rounded-md bg-accent">
      <div className="flex h-7 select-none items-center justify-between gap-2 border-b border-border/50 px-3">
        <span className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {language ?? ''}
        </span>
        <span
          role="toolbar"
          aria-label={translate('components.native-chat.codeBlock.actions', 'Code block actions')}
          className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/codeblock:opacity-100 group-focus-within/codeblock:opacity-100"
        >
          <button
            type="button"
            aria-pressed={wrapped}
            aria-label={wrapLabel}
            title={wrapLabel}
            onClick={() => setWrapped((value) => !value)}
            className={actionClassName}
          >
            <WrapText className="size-3" />
          </button>
          <button
            type="button"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={handleCopy}
            className={cn(actionClassName, copied && 'text-status-success')}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        </span>
      </div>
      <pre
        className={cn(
          'my-0 max-h-80 max-w-full overflow-x-auto p-3 font-mono text-[12px]',
          wrapped && 'whitespace-pre-wrap [overflow-wrap:anywhere]'
        )}
      >
        {children}
      </pre>
    </div>
  )
}
