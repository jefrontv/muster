// Wire contract for searching inside chat conversations, as opposed to the
// sidebar's existing title-only filter.
//
// The bounds are deliberate and enforced in main: a search reads transcript
// files off disk, so an unbounded query length or result count turns a keystroke
// into arbitrary I/O.

/** Below this a query matches almost everything; searching is not worth the read. */
export const CHAT_SEARCH_MIN_QUERY_LENGTH = 2
export const CHAT_SEARCH_MAX_QUERY_LENGTH = 200
export const CHAT_SEARCH_MAX_RESULTS = 50
/** Enough to read the match in context, short enough for a sidebar row. */
export const CHAT_SEARCH_SNIPPET_LENGTH = 240

export type ChatThreadSearchMatch = {
  threadId: string
  /** Which side of the conversation matched, so the UI can label the excerpt. */
  source: 'user' | 'assistant'
  /** Text around the first match in this thread, ellipsised at both cut points. */
  snippet: string
}

export type ChatThreadSearchRequest = {
  query: string
  /** Restricts the search; omit to search every thread with a transcript. */
  threadIds?: string[]
}

export type ChatThreadSearchResponse = {
  matches: ChatThreadSearchMatch[]
  /** True when results were cut at CHAT_SEARCH_MAX_RESULTS. */
  truncated: boolean
}
