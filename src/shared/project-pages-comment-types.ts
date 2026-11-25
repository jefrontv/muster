// Page comment threads. Stored beside the page in Muster's pages store, never in the markdown.
import type { ProjectPageAuthor } from './project-pages-types'

/** The quoted text plus some context either side; null on a thread about the whole page. */
export type PageCommentAnchor = { quote: string; prefix: string; suffix: string }

export type PageCommentMessage = {
  id: string
  author: ProjectPageAuthor
  body: string
  /** Absolute paths, so an agent can read the image. */
  attachments?: string[]
  createdAt: number
}

export type PageCommentStatus = 'open' | 'resolved'

/** A plan review's remove / looks-good note; a plain comment has none. */
export type PageCommentKind = 'delete' | 'looks_good'

export type PageCommentThread = {
  id: string
  anchor: PageCommentAnchor | null
  status: PageCommentStatus
  kind?: PageCommentKind
  createdAt: number
  updatedAt: number
  messages: PageCommentMessage[]
}

export type PageCommentCreateInput = {
  anchor: PageCommentAnchor | null
  body: string
  attachments?: string[]
  /** Remove and looks-good notes may have no text, like their plan review counterparts. */
  kind?: PageCommentKind
}

export type PageCommentsChange = { scopeKey: string; pageId: string; author: ProjectPageAuthor }

export const PAGE_COMMENT_LIMITS = {
  body: 10_000,
  quote: 2_000,
  /** Characters of context kept either side of the quote. */
  context: 32,
  threadsPerPage: 500,
  messagesPerThread: 200,
  attachments: 8
} as const
