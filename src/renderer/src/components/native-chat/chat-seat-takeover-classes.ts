// The seated takeover cards (question, approval, plan review) that replace the
// composer. Values follow DSH; see docs/muster/2026-10-20-chat-dsh-visual-gap.md §4-5.

/** Inset 16px into the composer column, so takeovers sit at the text column's width. */
export const CHAT_TAKEOVER_FRAME_CLASS = 'mx-4 shrink-0'

/** Question and plan review card: raised fill, panel elevation, no border. */
export const CHAT_TAKEOVER_CARD_CLASS =
  'flex flex-col overflow-hidden rounded-chat-bubble bg-chat-raised text-foreground shadow-chat-panel'

/** Approval card: the amber border replaces the hairline. */
export const CHAT_TAKEOVER_WARN_CARD_CLASS =
  'flex flex-col overflow-hidden rounded-chat-bubble border border-chat-warn bg-chat-raised text-foreground shadow-(--chat-panel)'

/** The tinted "Waiting" / "Plan review" band across the card's top. */
export const CHAT_TAKEOVER_STRIP_CLASS =
  'flex shrink-0 items-center gap-2 bg-chat-warn-tint px-4 text-chat-warn-ink'

export const CHAT_TAKEOVER_STATE_DOT_CLASS = 'size-1.5 shrink-0 rounded-full bg-chat-warn'

/** 11/16 error line in a footer; keeps its height when empty so buttons never jump. */
export const CHAT_TAKEOVER_ERROR_CLASS = 'min-h-4 text-[11px] leading-4 text-destructive'

/** Next, Submit, Allow, Approve: ink fill. */
export const CHAT_TAKEOVER_PRIMARY_CLASS =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-3.5 text-sm leading-[22px] whitespace-nowrap transition-colors duration-100 ease-chat disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent pointer-coarse:h-11 bg-foreground font-medium text-background enabled:hover:bg-foreground/85'

/** Skip, Discuss, Reject: 0.5px line-3 outline. */
export const CHAT_TAKEOVER_OUTLINE_CLASS =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-3.5 text-sm leading-[22px] whitespace-nowrap transition-colors duration-100 ease-chat disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent pointer-coarse:h-11 border-[0.5px] border-chat-line-3 bg-transparent text-foreground enabled:hover:bg-chat-hover'

/** 24px round icon button: minimise, close, pager chevrons. */
export const CHAT_TAKEOVER_ICON_BUTTON_CLASS =
  'grid size-6 shrink-0 place-items-center rounded-full text-chat-ink-tertiary transition-colors duration-100 ease-chat enabled:hover:bg-chat-hover enabled:hover:text-foreground disabled:cursor-default disabled:text-chat-ink-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'
