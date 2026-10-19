// A tool group's header text: DSH verb labels, live ones held long enough to
// read before the next call replaces them.

import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { ChatToolCategory } from './chat-turn-layout'

/** A live title stays at least this long, so quick calls don't flicker the header. */
export const LIVE_LABEL_MIN_MS = 150

export function toolCategoryLabel(category: ChatToolCategory, live: boolean): string {
  switch (category) {
    case 'read':
      return live
        ? translate('components.chat-thread.group.reading', 'Reading files')
        : translate('components.chat-thread.group.read', 'Read files')
    case 'search':
      return live
        ? translate('components.chat-thread.group.searching', 'Searching files')
        : translate('components.chat-thread.group.searched', 'Searched files')
    case 'run':
      return live
        ? translate('components.chat-thread.group.running', 'Running commands')
        : translate('components.chat-thread.group.ran', 'Ran commands')
    case 'web':
      return live
        ? translate('components.chat-thread.group.browsing', 'Fetching pages')
        : translate('components.chat-thread.group.browsed', 'Fetched pages')
    case 'other':
      return live
        ? translate('components.chat-thread.group.using', 'Using tools')
        : translate('components.chat-thread.group.used', 'Used tools')
  }
}

export function useHeldLiveLabel(label: string, live: boolean): string {
  const [shown, setShown] = useState(label)
  const shownAt = useRef(Date.now())
  const latest = useRef(label)
  useEffect(() => {
    latest.current = label
    if (shown === label) {
      return
    }
    const commit = (): void => {
      shownAt.current = Date.now()
      setShown(latest.current)
    }
    // Settled groups track the label so the next live stretch never starts on a stale title.
    const wait = live ? LIVE_LABEL_MIN_MS - (Date.now() - shownAt.current) : 0
    const timer = setTimeout(commit, Math.max(0, wait))
    return () => clearTimeout(timer)
  }, [label, live, shown])
  return live ? shown : label
}
