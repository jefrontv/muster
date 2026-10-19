import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Check, Copy, WrapText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

/** How long the copy button shows its check. */
export const DIFF_COPIED_MS = 1000

const ACTION =
  'flex size-6 items-center justify-center rounded-[8px] text-chat-ink-secondary transition-colors duration-100 ease-chat hover:bg-chat-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent motion-reduce:transition-none'

async function writeClipboard(text: string): Promise<void> {
  // Electron IPC first: navigator.clipboard can reject in an unfocused renderer.
  await (window.api?.ui?.writeClipboardText
    ? window.api.ui.writeClipboardText(text)
    : navigator.clipboard.writeText(text))
}

/** File name, language, and the wrap and copy actions above a diff card. */
export function ChatDiffBanner(props: {
  fileName: string
  title: string
  language: string | null
  wrapped: boolean
  onWrapChange: (wrapped: boolean) => void
  copyText: () => string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    },
    []
  )
  const copy = async (): Promise<void> => {
    try {
      await writeClipboard(props.copyText())
    } catch {
      return
    }
    setCopied(true)
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
    }
    timer.current = window.setTimeout(() => {
      timer.current = null
      setCopied(false)
    }, DIFF_COPIED_MS)
  }
  const copyLabel = copied
    ? translate('components.chat-thread.diff.copied', 'Copied')
    : translate('components.chat-thread.diff.copy', 'Copy diff')
  return (
    <div className="flex items-center justify-between gap-3 pb-2 pl-[22px] pr-[18px] pt-2.5 font-sans text-[11px] leading-[18px] text-chat-ink-secondary">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="min-w-0 truncate" title={props.title}>
          {props.fileName}
        </span>
        {props.language && (
          <span className="shrink-0 font-mono lowercase text-chat-ink-tertiary">
            {props.language}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cn(ACTION, props.wrapped && 'bg-chat-hover')}
          aria-label={translate('components.chat-thread.diff.wrap', 'Wrap lines')}
          aria-pressed={props.wrapped}
          title={translate('components.chat-thread.diff.wrap', 'Wrap lines')}
          onClick={() => props.onWrapChange(!props.wrapped)}
        >
          <WrapText className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className={ACTION}
          aria-label={copyLabel}
          title={copyLabel}
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  )
}
