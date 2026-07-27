import React from 'react'
import { UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'
import { activeCollabInitials } from './activecollab-task-people'

type ActiveCollabPersonBadgeProps = {
  /** Null when the provider gave an id but no resolvable name, or nobody at all. */
  name: string | null
  className?: string
}

/**
 * The stand-in for an avatar. ActiveCollab's task and comment payloads carry no avatar URL, so a
 * name becomes initials and an absent name becomes a neutral glyph — never a broken image.
 */
export function ActiveCollabPersonBadge({
  name,
  className
}: ActiveCollabPersonBadgeProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold tracking-tight text-muted-foreground',
        className
      )}
    >
      {name ? activeCollabInitials(name) : <UserRound className="size-3" />}
    </span>
  )
}
