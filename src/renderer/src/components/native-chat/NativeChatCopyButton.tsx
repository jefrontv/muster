import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

/**
 * Per-message copy affordance for the native chat. Copies the message's text to
 * the clipboard and briefly swaps the icon to a check tint as success feedback —
 * matching the app's other inline copy buttons (icon swap, no toast).
 *
 * With `getHtml`, writes a dual-flavor payload (text/plain markdown +
 * text/html rendered markup) via ClipboardItem so pastes into rich editors
 * keep formatting; any failure falls back to the plain-text Electron clipboard
 * IPC, which avoids the silent rejections navigator.clipboard hits inside some
 * renderer contexts.
 */
export function NativeChatCopyButton({
  text,
  getHtml,
  className
}: {
  text: string
  /** Rendered HTML for the text/html clipboard flavor; read lazily at click time. */
  getHtml?: () => string | null
  className?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      const html = getHtml?.() ?? null
      let wroteRich = false
      if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': new Blob([text], { type: 'text/plain' }),
              'text/html': new Blob([html], { type: 'text/html' })
            })
          ])
          wroteRich = true
        } catch {
          // Rich write can reject (focus, permissions); plain text still lands below.
        }
      }
      if (!wroteRich) {
        await window.api.ui.writeClipboardText(text)
      }
      setCopied(true)
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null
        setCopied(false)
      }, 1500)
    } catch {
      /* best-effort: clipboard can reject when unfocused */
    }
  }, [text, getHtml])

  const label = copied
    ? translate('components.native-chat.copyMessage.copied', 'Copied')
    : translate('components.native-chat.copyMessage.copy', 'Copy message')

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        copied && 'text-status-success',
        className
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}
