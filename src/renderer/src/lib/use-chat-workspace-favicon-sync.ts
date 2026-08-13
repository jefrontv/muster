// When the workspace's primary URL changes, fetch that site's favicon and
// apply it — unless the user already picked their own icon.

import { useEffect, useRef } from 'react'
import type { RepoIcon } from '../../../shared/repo-icon'
import { websiteHostname } from '../../../shared/chat-workspace-site-info'

const FETCH_DEBOUNCE_MS = 450

export function useChatWorkspaceFaviconSync(args: {
  open: boolean
  primaryUrl: string | undefined
  iconOverridden: boolean
  /** True when the current icon is already an auto-fetched favicon. */
  hasAutoIcon: boolean
  onAutoIcon: (icon: RepoIcon) => void
}): void {
  const { open, primaryUrl, iconOverridden, hasAutoIcon, onAutoIcon } = args
  const generationRef = useRef(0)
  const lastFetchedHostRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      lastFetchedHostRef.current = null
      return
    }
    if (iconOverridden) {
      return
    }
    const host = primaryUrl ? websiteHostname(primaryUrl) : null
    if (!host) {
      return
    }
    // Opening an existing workspace shouldn't refetch the icon we already stored.
    if (hasAutoIcon && lastFetchedHostRef.current === null) {
      lastFetchedHostRef.current = host
      return
    }
    if (lastFetchedHostRef.current === host) {
      return
    }
    const generation = ++generationRef.current
    const timer = window.setTimeout(() => {
      void window.api.repos
        .fetchFavicon({ domain: host })
        .then((result) => {
          if (generation !== generationRef.current || iconOverridden || !result.ok) {
            return
          }
          lastFetchedHostRef.current = host
          onAutoIcon({
            type: 'image',
            src: result.dataUrl,
            source: 'favicon',
            label: 'Website favicon'
          })
        })
        .catch(() => undefined)
    }, FETCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [open, primaryUrl, iconOverridden, hasAutoIcon, onAutoIcon])
}
