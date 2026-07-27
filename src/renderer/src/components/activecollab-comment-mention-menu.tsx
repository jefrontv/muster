import React, { useEffect, useRef } from 'react'
import { AtSign } from 'lucide-react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

/**
 * The @mention suggestion list. Opens BELOW the field, unlike the chat composer's picker: this
 * composer sits at the top of the discussion, so the room is underneath it, not above.
 *
 * Never rendered empty — the composer drops the menu when nothing matches — so there is no
 * "no matches" row to write, and a bare `@` still lists people.
 */
export function ActiveCollabMentionMenu({
  users,
  activeIndex,
  listboxId,
  onPick
}: {
  users: readonly ActiveCollabUser[]
  activeIndex: number
  listboxId: string
  onPick: (user: ActiveCollabUser) => void
}): React.JSX.Element {
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, users])

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label={translate(
        'auto.components.activecollab.task_workspace.mention_menu',
        'Mention a person'
      )}
      className="scrollbar-sleek absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
    >
      {users.map((user, index) => {
        const selected = index === activeIndex
        return (
          <button
            key={user.id}
            id={`${listboxId}-option-${index}`}
            ref={selected ? activeItemRef : null}
            role="option"
            aria-selected={selected}
            type="button"
            // Why: the textarea owns the draft and caret, so the pick must run before the browser
            // moves focus to this row and the token's caret position goes stale.
            onPointerDown={(event) => {
              event.preventDefault()
              onPick(user)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[13px] hover:bg-accent hover:text-accent-foreground',
              selected && 'border-border bg-accent text-accent-foreground'
            )}
          >
            <AtSign className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{user.name}</span>
          </button>
        )
      })}
    </div>
  )
}
