// The GUI side of the MCP comment draft tools; arguments arrive from the site bridge.
import type {
  AgentCommentDraftSource,
  BotsCommentDraft
} from '../../shared/bots-comment-draft-types'
import { AgentDraftError, type AgentCommentDraftStore } from './agent-comment-draft-store'

export const COMMENT_DRAFT_TOOL_OPS = ['queue', 'list', 'amend'] as const
export type CommentDraftToolOp = (typeof COMMENT_DRAFT_TOOL_OPS)[number]

const MAX_BODY = 200_000

export function isCommentDraftToolOp(value: unknown): value is CommentDraftToolOp {
  return (COMMENT_DRAFT_TOOL_OPS as readonly unknown[]).includes(value)
}

// TypeError reaches the agent as a 400 it can fix.
function positiveInt(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${key} must be a positive whole number.`)
  }
  return value
}

function body(args: Record<string, unknown>): string {
  const value = args.body_html
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_BODY) {
    throw new TypeError('body_html must be non-empty comment HTML.')
  }
  return value
}

function paths(args: Record<string, unknown>): string[] | undefined {
  const value = args.attachments
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value) || !value.every((p) => typeof p === 'string' && p)) {
    throw new TypeError('attachments must be a list of file paths.')
  }
  return value as string[]
}

function summary(draft: BotsCommentDraft): Record<string, unknown> {
  return {
    id: draft.id,
    number: draft.number,
    project_id: draft.projectId,
    task_id: draft.taskId,
    status: draft.status,
    version: draft.version,
    edited_by: draft.editedBy === 'bot' ? 'agent' : 'user',
    attachments: draft.attachments.map((f) => f.name),
    body_html: draft.bodyHtml
  }
}

export async function runCommentDraftToolOp(
  store: AgentCommentDraftStore,
  op: CommentDraftToolOp,
  args: Record<string, unknown>,
  source: AgentCommentDraftSource
): Promise<unknown> {
  try {
    if (op === 'queue') {
      const { draft, replaced } = store.queue({
        projectId: positiveInt(args, 'project_id'),
        taskId: positiveInt(args, 'task_id'),
        bodyHtml: body(args),
        attachments: paths(args),
        source
      })
      return {
        ...summary(draft),
        message: replaced
          ? `Replaced the waiting draft #${draft.number} for this task. The user reviews and posts it in Muster.`
          : `Queued as draft #${draft.number}. The user reviews and posts it in Muster; you cannot post it.`
      }
    }
    if (op === 'amend') {
      const ref = args.draft
      if (typeof ref !== 'string' && typeof ref !== 'number') {
        throw new TypeError('draft must be a draft id or its waiting number.')
      }
      const note = typeof args.note === 'string' ? args.note : undefined
      const draft = store.amend({
        draft: String(ref),
        bodyHtml: body(args),
        note,
        attachments: paths(args),
        source
      })
      return {
        ...summary(draft),
        message: `Draft #${draft.number} is now version ${draft.version}.`
      }
    }
    const status = args.status === 'all' ? 'all' : 'waiting'
    const listed = await store.list(status)
    const drafts = listed.ok ? listed.value : []
    const taskId = typeof args.task_id === 'number' ? args.task_id : null
    return {
      drafts: drafts.filter((d) => taskId === null || d.taskId === taskId).map(summary)
    }
  } catch (error) {
    throw error instanceof AgentDraftError ? new TypeError(error.message) : error
  }
}
