import React, { useEffect, useState } from 'react'
import { UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'
import { activeCollabInitials } from './activecollab-task-people'
import { useActiveCollabUserAvatarUrl } from './use-activecollab-user-avatar'

type ActiveCollabPersonBadgeProps = {
  /** Null when the provider gave an id but no resolvable name, or nobody at all. */
  name: string | null
  /** When set, the roster's avatar for this user renders instead of initials. */
  userId?: number | null
  className?: string
}

/**
 * A person's avatar when the roster carries one, otherwise their initials, otherwise a neutral
 * glyph — never a broken image: a URL that fails to load (auth-gated avatar route, offline
 * instance) drops back to the initials it replaced.
 */
export function ActiveCollabPersonBadge({
  name,
  userId = null,
  className
}: ActiveCollabPersonBadgeProps): React.JSX.Element {
  const avatarUrl = useActiveCollabUserAvatarUrl(userId)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  // A new URL gets a fresh chance; only the URL that actually errored stays suppressed.
  useEffect(() => {
    setFailedUrl(null)
  }, [avatarUrl])

  const showImage = avatarUrl !== null && avatarUrl !== failedUrl
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold tracking-tight text-muted-foreground',
        className
      )}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : name ? (
        activeCollabInitials(name)
      ) : (
        <UserRound className="size-3" />
      )}
    </span>
  )
}
