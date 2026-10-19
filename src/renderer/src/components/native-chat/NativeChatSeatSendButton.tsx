// The seated composer's Send / Stop: one 34px accent circle whose glyph swaps,
// so starting or stopping a turn never moves the toolbar.

import type React from 'react'

export function NativeChatSeatSendButton(props: {
  stop: boolean
  label: string
  disabled: boolean
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      // Lifted 2px like DSH: the toolbar's top pad lowers the chips, not the send circle.
      className="flex size-[34px] shrink-0 -translate-y-0.5 items-center justify-center rounded-full bg-chat-accent text-white transition-colors duration-100 ease-chat enabled:hover:bg-chat-accent-hover disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-raised"
    >
      {props.stop ? (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <path
            d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  )
}
