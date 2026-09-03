// Sidebar search that looks inside conversations, not just at thread titles.
//
// Titles are filtered synchronously in the renderer; message text lives in
// transcript files that only main can read, so content hits arrive a beat later
// over IPC. Keeping them in a context means the row components pick up their own
// excerpt instead of five call sites threading a map down as a prop.

import type React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import {
  CHAT_SEARCH_MIN_QUERY_LENGTH,
  type ChatThreadSearchMatch
} from '../../../../shared/chat-thread-search-types'

/** Long enough that typing a word is one search, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 220

export type ChatThreadContentMatches = ReadonlyMap<string, ChatThreadSearchMatch>

const EMPTY: ChatThreadContentMatches = new Map()

const ChatThreadContentMatchContext = createContext<ChatThreadContentMatches>(EMPTY)

export function useChatThreadContentMatches(): ChatThreadContentMatches {
  return useContext(ChatThreadContentMatchContext)
}

export function useChatThreadContentMatch(threadId: string): ChatThreadSearchMatch | undefined {
  return useContext(ChatThreadContentMatchContext).get(threadId)
}

export function ChatThreadContentMatchProvider({
  matches,
  children
}: {
  matches: ChatThreadContentMatches
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <ChatThreadContentMatchContext.Provider value={matches}>
      {children}
    </ChatThreadContentMatchContext.Provider>
  )
}

export function useChatThreadContentSearch(query: string): ChatThreadContentMatches {
  const [matches, setMatches] = useState<ChatThreadContentMatches>(EMPTY)

  useEffect(() => {
    if (query.length < CHAT_SEARCH_MIN_QUERY_LENGTH) {
      setMatches(EMPTY)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void window.api.chatMode
        .searchThreadContent({ query })
        .then((response) => {
          if (cancelled) {
            return
          }
          setMatches(new Map(response.matches.map((match) => [match.threadId, match])))
        })
        .catch(() => {
          // A failed search degrades to title-only matching, which is what the
          // sidebar did before; surfacing an error here would be noise.
          if (!cancelled) {
            setMatches(EMPTY)
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      // Guards the in-flight promise too: without this a slow search for an
      // abandoned query can land after a newer one and show stale excerpts.
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  return matches
}
