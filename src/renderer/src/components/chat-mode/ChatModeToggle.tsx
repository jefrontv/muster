// The Chat/Bots/Code mode switch. Rendered at the top of each mode's surface so any mode can
// flip to another; Chat and Bots are full-page TopLevelViews, Code restores whatever view the
// user left behind. The active pill is one inverted layer clipped to the active slot, so the
// fill and its label text slide together instead of the text flipping colour mid-slide.

import { Bot, MessageCircle, Code2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { botsSupported } from '@/lib/bots-platform'
import { chatModeSupported } from '@/lib/chat-mode-platform'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

const SLIDE_MS = 280
const SLIDE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

// Clips the inverted layer to one slot of n.
function slotClip(index: number, count: number): string {
  const step = 100 / count
  return `inset(0 ${(count - 1 - index) * step}% 0 ${index * step}% round 9999px)`
}

export type AppMode = 'chat' | 'bots' | 'code'

// Why a module-level "last mode": each mode's toggle is a separate subtree, and Bots and Code
// stay mounted while hidden, so no instance state spans a switch. A toggle slides in from the
// old mode's slot when its surface becomes the shown one; the app's cold first paint must not.
let lastMode: AppMode | null = null

export function ChatModeToggle({ mode }: { mode: AppMode }): React.JSX.Element | null {
  const chatEnabled =
    useAppStore((s) => s.settings?.experimentalChatMode === true) && chatModeSupported()
  const botsEnabled = useAppStore((s) => s.settings?.experimentalBots === true) && botsSupported()
  const openChatPage = useAppStore((s) => s.openChatPage)
  const openBotsPage = useAppStore((s) => s.openBotsPage)
  const closeChatPage = useAppStore((s) => s.closeChatPage)
  const closeBotsPage = useAppStore((s) => s.closeBotsPage)
  const pillRef = useRef<HTMLDivElement | null>(null)
  const shown = useAppStore((s) =>
    s.activeView === 'chat' || s.activeView === 'bots' ? s.activeView === mode : mode === 'code'
  )

  const modes: AppMode[] = [
    ...(chatEnabled ? (['chat'] as const) : []),
    ...(botsEnabled ? (['bots'] as const) : []),
    'code'
  ]
  // Why the owning surface's mode, not the live view: on a switch the outgoing surface
  // re-renders before it unmounts, and a view-driven pill would snap across inside a
  // surface that is about to vanish. Pinning each toggle to its own surface keeps the pill
  // still and makes the slide a pure entrance.
  const index = Math.max(0, modes.indexOf(mode))
  const modesKey = modes.join(',')

  // Why script the slide instead of a CSS mount animation: a CSS animation starts at style
  // recalc, and the chat sidebar's first paint lands well after that (lazy chunk + heavy
  // mount), so the slide would be over before anything reached the screen.
  useEffect(() => {
    if (!shown) {
      return
    }
    const el = pillRef.current
    const from = lastMode === null ? -1 : modesKey.split(',').indexOf(lastMode)
    lastMode = mode
    // typeof check: jsdom/happy-dom have no Web Animations API.
    if (
      from < 0 ||
      from === index ||
      !el ||
      typeof el.animate !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const count = modesKey.split(',').length
    // No cancel on cleanup: StrictMode's re-run would kill the slide, and lastMode already moved on.
    el.animate([{ clipPath: slotClip(from, count) }, { clipPath: slotClip(index, count) }], {
      duration: SLIDE_MS,
      easing: SLIDE_EASING
    })
  }, [shown, mode, index, modesKey])

  if (modes.length < 2) {
    return null
  }

  const select = (target: AppMode): void => {
    if (target === mode) {
      return
    }
    if (target === 'chat') {
      openChatPage()
    } else if (target === 'bots') {
      openBotsPage()
    } else if (mode === 'chat') {
      closeChatPage()
    } else {
      closeBotsPage()
    }
  }

  const segment =
    'flex h-full flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-medium tracking-tight'
  const labels: Record<AppMode, { icon: typeof Bot; text: string }> = {
    chat: { icon: MessageCircle, text: translate('auto.components.chat.mode.chat', 'Chat') },
    bots: { icon: Bot, text: translate('auto.components.chat.mode.bots', 'Bots') },
    code: { icon: Code2, text: translate('auto.components.chat.mode.code', 'Code') }
  }
  const label = (target: AppMode, active: boolean): React.JSX.Element => {
    const { icon: Icon, text } = labels[target]
    return (
      <>
        <Icon className="size-3.5" strokeWidth={active ? 2.25 : 1.75} />
        {text}
      </>
    )
  }
  return (
    <div
      role="tablist"
      aria-label={translate('auto.components.chat.mode.toggleLabel', 'App mode')}
      className="relative flex h-9 rounded-full bg-foreground/[0.05] p-[3px]"
    >
      {modes.map((target) => {
        const active = target === mode
        return (
          <button
            key={target}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              segment,
              'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
              active ? 'text-foreground' : 'text-foreground/55 hover:text-foreground/85'
            )}
            onClick={() => select(target)}
          >
            {label(target, active)}
          </button>
        )
      })}
      {/* The active pill: an inverted copy of the labels, clipped to the active slot. */}
      <div
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute inset-[3px] flex rounded-full bg-foreground text-background"
        style={{ clipPath: slotClip(index, modes.length) }}
      >
        {modes.map((target) => (
          <span key={target} className={segment}>
            {label(target, true)}
          </span>
        ))}
      </div>
    </div>
  )
}
