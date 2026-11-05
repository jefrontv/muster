// The seated composer's look (Chat mode today, Code mode once it adopts `seat`),
// shared by the thread composer and the empty-state hero so the two never drift.
// Controls follow DSH's InputBar (docs/muster/2026-10-20-chat-dsh-visual-gap.md §1); insets run 12-16px, roomier than DSH's 8px.

/** Keyboard-only focus for every seated control. */
export const CHAT_SEAT_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'

/** The card: 12px top pad, 8px from editor to toolbar, no ring of its own. */
export const CHAT_SEAT_CARD_CLASS =
  'relative flex flex-col gap-2 rounded-chat-composer bg-chat-raised pt-3 text-sm leading-6 shadow-chat-soft'

/** A tab tucked 12px under the card (-mb also cancels the seat's 6px gap), in the card's own surface so the two read as one. */
export const CHAT_SEAT_TAB_CLASS =
  'relative isolate mx-4 -mb-[18px] overflow-hidden rounded-t-[18px] bg-chat-raised pb-3 shadow-chat-hairline'

/** The tab rising out from behind the card. */
/** Chat mode's tab: the Bots card's hairline ring and 20px top corners. */
export const CHAT_CONVERSATION_TAB_CLASS =
  'relative isolate mx-3 -mb-[18px] overflow-hidden rounded-t-[20px] bg-chat-raised pb-3 ring-[0.5px] ring-foreground/10'

export const chatSeatTabClass = (look: 'conversation' | undefined): string =>
  look === 'conversation' ? CHAT_CONVERSATION_TAB_CLASS : CHAT_SEAT_TAB_CLASS

export const CHAT_SEAT_TAB_ENTER_CLASS =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none'

/** Editor without its floor; callers add min-h-12 (docked) or min-h-[64px] (hero). */
export const CHAT_SEAT_EDITOR_CLASS =
  'scrollbar-sleek field-sizing-content mr-1 max-h-[336px] w-[calc(100%-4px)] resize-none bg-transparent pt-0.5 pr-3 pb-0 pl-4 text-sm leading-6 text-foreground caret-chat-accent outline-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-chat-ink-caption disabled:cursor-not-allowed disabled:opacity-50'

/** Attachment chips above the editor, inset to the editor's text edge. */
export const CHAT_SEAT_ATTACHMENTS_CLASS = 'flex flex-wrap items-center gap-2 px-4'

/** Toolbar row; a size container so its groups tighten when the card is narrow. */
export const CHAT_SEAT_TOOLBAR_CLASS = '@container flex flex-wrap items-center gap-2 px-3 pb-3'

export const CHAT_SEAT_TOOLBAR_ROW_CLASS =
  'flex w-full flex-wrap items-center justify-between gap-3 @max-[560px]:gap-2'

export const CHAT_SEAT_TOOLBAR_LEAD_CLASS = 'flex min-w-0 items-center gap-3 @max-[560px]:gap-2'

export const CHAT_SEAT_TOOLBAR_TRAIL_CLASS =
  'ml-auto flex shrink-0 items-center gap-3 @max-[560px]:gap-2'

/** Attach: 28px filled circle; hover stacks a second hover tint inside it. */
export const CHAT_SEAT_ATTACH_CLASS =
  'relative flex size-7 shrink-0 items-center justify-center rounded-full bg-chat-hover text-foreground transition-shadow duration-100 ease-chat hover:shadow-[inset_0_0_0_14px_var(--chat-hover)] disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent pointer-coarse:size-11'

/** Model, effort and workspace chips: 28px, 13/20, secondary ink; `group/chip` turns the chevron. */
export const CHAT_SEAT_CHIP_CLASS =
  'group/chip flex h-7 min-w-0 max-w-[min(360px,45cqw)] items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[13px] leading-5 font-normal text-chat-ink-secondary transition-colors duration-100 ease-chat enabled:hover:bg-chat-hover disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'

export const CHAT_SEAT_CHIP_CHEVRON_CLASS =
  'size-3 shrink-0 text-chat-ink-caption transition-transform duration-[120ms] ease-chat group-data-[state=open]/chip:rotate-180 motion-reduce:transition-none'

// Chat mode's conversation look (the Bots composer): one row, controls either side of the editor.
// Phase 9 makes these the only seat classes; until then Code mode never reads them.

/** One rounded row that wraps the editor onto its own line below 30rem. */
export const CHAT_CONVERSATION_CARD_CLASS =
  '@container/composer relative flex flex-wrap items-end gap-1 rounded-2xl bg-chat-raised px-2 py-1.5 text-sm leading-6 ring-[0.5px] ring-foreground/10 shadow-chat-soft'

export const CHAT_CONVERSATION_ATTACHMENTS_CLASS =
  'order-first flex basis-full flex-wrap items-center gap-2 px-1.5 pt-1 pb-1.5'

export const CHAT_CONVERSATION_EDITOR_CLASS =
  'scrollbar-sleek field-sizing-content order-2 max-h-[336px] min-h-9 min-w-0 flex-1 basis-0 resize-none bg-transparent px-1.5 py-1.5 text-[15px] leading-6 text-foreground caret-chat-accent outline-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-chat-ink-caption disabled:cursor-not-allowed disabled:opacity-50 @max-[30rem]/composer:order-first @max-[30rem]/composer:basis-full'

export const CHAT_CONVERSATION_LEAD_CLASS = 'order-1 flex h-9 shrink-0 items-center gap-0.5'

export const CHAT_CONVERSATION_TRAIL_CLASS = 'order-3 ml-auto flex h-9 shrink-0 items-center gap-1'

/** Attach, access and web: bare 32px icons, as in Bots. */
export const CHAT_CONVERSATION_ICON_CLASS =
  'relative flex size-8 shrink-0 items-center justify-center rounded-full text-chat-ink-secondary transition-colors duration-100 ease-chat hover:bg-foreground/[0.07] hover:text-foreground disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent pointer-coarse:size-11'

/** Voice and its options: 32px filled circles. */
export const CHAT_CONVERSATION_FILLED_ICON_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded-full bg-chat-hover text-foreground transition-shadow duration-100 ease-chat hover:shadow-[inset_0_0_0_16px_var(--chat-hover)] disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent pointer-coarse:size-11'
