// The seated approval takeover (DSH ApprovalPanel): an amber-bordered card in
// place of the composer. Enter allows and Esc rejects while focus is inside it.

import type React from 'react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { describeToolApproval } from '../../../../shared/native-chat-tool-approval'
import { useNativeChatSurface } from './native-chat-surface-context'
import {
  NativeChatApprovalAllowMenuContent,
  type NativeChatComposerApproval
} from './NativeChatApprovalPanel'
import {
  CHAT_TAKEOVER_FRAME_CLASS,
  CHAT_TAKEOVER_OUTLINE_CLASS,
  CHAT_TAKEOVER_PRIMARY_CLASS,
  CHAT_TAKEOVER_STATE_DOT_CLASS,
  CHAT_TAKEOVER_STRIP_CLASS,
  CHAT_TAKEOVER_WARN_CARD_CLASS
} from './chat-seat-takeover-classes'

const TEXT_FIELD_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
const ACTIVATABLE_SELECTOR = 'button, a[href], [role="button"], [role="menuitem"]'

/** The approval key verdict, or null when the key belongs to something else. */
export function approvalShortcut(event: {
  key: string
  target: EventTarget | null
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
  isComposing: boolean
  keyCode: number
}): 'allow' | 'deny' | null {
  if (event.key !== 'Enter' && event.key !== 'Escape') {
    return null
  }
  const element = event.target instanceof Element ? event.target : null
  if (element?.closest(TEXT_FIELD_SELECTOR)) {
    return null
  }
  // A focused button's own Enter is its click, not "allow".
  if (event.key === 'Enter' && element?.closest(ACTIVATABLE_SELECTOR)) {
    return null
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return null
  }
  // keyCode 229 covers IME engines that don't set isComposing.
  if (event.repeat || event.isComposing || event.keyCode === 229) {
    return null
  }
  return event.key === 'Enter' ? 'allow' : 'deny'
}

export function NativeChatSeatApprovalCard({
  approval
}: {
  approval: NativeChatComposerApproval
}): React.JSX.Element {
  const { request, count, respond, cancelTurn } = approval
  const { surface } = useNativeChatSurface()
  const detail = describeToolApproval(request.toolName, request.input, surface, translate)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [answered, setAnswered] = useState(false)
  const composingRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const showCode = detail.code !== null && (!detail.detailsCollapsed || detailsOpen)

  // The composer's textarea unmounts under this card; take focus so Enter/Esc work,
  // unless the user is already focused somewhere else.
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) {
      bodyRef.current?.focus({ preventScroll: true })
    }
  }, [request.requestId])

  const answer = (behavior: 'allow' | 'deny'): void => {
    if (answered) {
      return
    }
    setAnswered(true)
    respond(request.requestId, behavior)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // React bubbles portal events (the Allow menu) through here; only the card's own DOM counts.
    if (event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) {
      return
    }
    const verdict = approvalShortcut({
      key: event.key,
      target: event.target,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      isComposing: composingRef.current || event.nativeEvent.isComposing,
      keyCode: event.keyCode
    })
    if (!verdict) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    answer(verdict)
  }

  return (
    <div
      className={CHAT_TAKEOVER_FRAME_CLASS}
      data-approval-request={request.requestId}
      aria-busy={answered}
      onKeyDown={onKeyDown}
      onCompositionStartCapture={() => {
        composingRef.current = true
      }}
      onCompositionEndCapture={() => {
        composingRef.current = false
      }}
    >
      <section className={CHAT_TAKEOVER_WARN_CARD_CLASS} aria-label={detail.title}>
        <div className={cn(CHAT_TAKEOVER_STRIP_CLASS, 'py-2.5 text-[13px] leading-[18px]')}>
          <span
            aria-hidden
            className={cn(CHAT_TAKEOVER_STATE_DOT_CLASS, answered && 'animate-pulse')}
          />
          {translate('components.native-chat.approval.waiting', 'Waiting for approval')}
          {count > 1 ? (
            <span className="ml-auto tabular-nums">
              {translate('components.native-chat.question.progress', '{{value0}} / {{value1}}', {
                value0: 1,
                value1: count
              })}
            </span>
          ) : null}
        </div>
        <div
          ref={bodyRef}
          tabIndex={0}
          role="group"
          aria-label={detail.title}
          className="scrollbar-sleek flex max-h-[336px] flex-col gap-1.5 overflow-y-auto px-4 pt-3 outline-none"
        >
          <p className="text-[15px] leading-6 font-medium break-words text-foreground">
            {detail.title}
          </p>
          {detail.caption ? (
            <p className="text-[13px] leading-5 text-chat-ink-secondary">{detail.caption}</p>
          ) : null}
          {detail.code !== null && detail.detailsCollapsed ? (
            <button
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
              className="flex w-fit items-center gap-0.5 rounded-sm text-[13px] leading-5 text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform duration-[120ms] ease-chat',
                  detailsOpen && 'rotate-90'
                )}
              />
              {translate('components.native-chat.reply.details', 'Details')}
            </button>
          ) : null}
          {showCode ? (
            <pre className="font-mono text-[13px] leading-5 break-all whitespace-pre-wrap text-chat-ink-tertiary">
              {detail.code}
            </pre>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3.5">
          {/* The composer's Stop is hidden under this card, so stopping the turn lives here. */}
          <button
            type="button"
            disabled={answered}
            onClick={cancelTurn}
            className="mr-auto rounded-sm text-[13px] leading-5 text-chat-ink-tertiary transition-colors duration-100 ease-chat enabled:hover:text-chat-ink-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
          >
            {translate('auto.components.native-chat.approval.cancelTurn', 'Cancel turn')}
          </button>
          <button
            type="button"
            disabled={answered}
            onClick={() => answer('deny')}
            className={cn(
              CHAT_TAKEOVER_OUTLINE_CLASS,
              'enabled:hover:border-transparent enabled:hover:bg-destructive/10 enabled:hover:text-destructive'
            )}
          >
            {translate('components.native-chat.approval.reject', 'Reject')}
          </button>
          <div className="flex items-center">
            <button
              type="button"
              disabled={answered}
              onClick={() => answer('allow')}
              className={cn(CHAT_TAKEOVER_PRIMARY_CLASS, 'rounded-r-none')}
            >
              {translate('components.native-chat.approval.allow', 'Allow')}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={answered}
                  aria-label={translate(
                    'auto.components.native-chat.approval.moreOptions',
                    'More approval options'
                  )}
                  className={cn(
                    CHAT_TAKEOVER_PRIMARY_CLASS,
                    'rounded-l-none border-l border-background/20 px-2'
                  )}
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <NativeChatApprovalAllowMenuContent approval={approval} />
            </DropdownMenu>
          </div>
        </div>
      </section>
    </div>
  )
}
