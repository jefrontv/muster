// Bots comment drafts: ActiveCollab comments a bot queued for the person to edit and post.
// Shape is the server contract in docs/muster/2026-11-06-bots-comment-drafts-contract.md.
import type { ActiveCollabFailure } from './activecollab-api-types'

export type BotsCommentDraftStatus = 'waiting' | 'posted' | 'discarded'

export type BotsCommentDraft = {
  id: string
  /** 1-based among waiting drafts, oldest first; null once posted or discarded. */
  number: number | null
  botId: string
  botName: string
  threadId: string
  projectId: number
  taskId: number
  bodyHtml: string
  bodyText: string
  status: BotsCommentDraftStatus
  version: number
  editedBy: 'bot' | 'user'
  amendNote: string | null
  canUndo: boolean
  queuedAt: number
  createdAt: number
  updatedAt: number
}

/** What a card shows about the task; taskNumber and title are null when the task can't be listed. */
export type BotsCommentDraftTask = {
  title: string | null
  taskNumber: number | null
  projectName: string | null
  /** Who assigned the task (else who created it); null when unknown or it's the signed-in user. */
  handBackTo?: { userId: number; name: string } | null
}

export type BotsCommentDraftEdit = {
  id: string
  bodyHtml: string
  bodyText: string
  baseVersion: number
}

export type BotsCommentDraftFailure =
  /** A bot changed the draft since baseVersion; `draft` is the current one. */
  | { ok: false; reason: 'conflict'; message: string; draft: BotsCommentDraft }
  /** Already posted or discarded. */
  | { ok: false; reason: 'gone'; message: string }
  /** The bots server isn't running. */
  | { ok: false; reason: 'unavailable'; message: string }
  | { ok: false; reason: 'error'; message: string }
  /** ActiveCollab refused the comment; the draft stays waiting. */
  | { ok: false; reason: 'post-failed'; failure: ActiveCollabFailure }
  /** The comment posted but the draft could not be marked posted. */
  | { ok: false; reason: 'posted-unmarked'; message: string }
  /** The comment posted and the draft cleared, but the task could not be reassigned. */
  | { ok: false; reason: 'reassign-failed'; message: string; draft: BotsCommentDraft }

export type BotsCommentDraftResult<T> = { ok: true; value: T } | BotsCommentDraftFailure

/** Post sends the stored body, or saves `edit` first when the editor holds unsaved text. */
export type BotsCommentDraftPostArgs = {
  id: string
  edit?: Omit<BotsCommentDraftEdit, 'id'>
  /** After posting, assign the task to this user. */
  reassignTo?: number
}

export const BOTS_COMMENT_DRAFTS_CHANGED_MESSAGE = 'muster:comment-drafts-changed'
