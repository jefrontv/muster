// Agent tools for page comment threads: read the feedback, answer it, close it.
import type { PageCommentThread } from '../../shared/project-pages-comment-types'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import type { ProjectPagesComments } from './project-pages-comments'
import { ProjectPagesError } from './project-pages-store'
import { toolText, type ToolArgs } from './project-pages-tool-args'

export const PROJECT_PAGES_COMMENT_OPS = [
  'list_comments',
  'reply_comment',
  'resolve_comment'
] as const
type CommentOp = (typeof PROJECT_PAGES_COMMENT_OPS)[number]
export const PROJECT_PAGES_COMMENT_READ_OPS = ['list_comments'] as const

export function isProjectPagesCommentOp(op: string): op is CommentOp {
  return PROJECT_PAGES_COMMENT_OPS.includes(op as CommentOp)
}

function authorName(author: ProjectPageAuthor): string {
  return author.kind === 'agent' ? author.agent : 'user'
}

export function threadRow(thread: PageCommentThread): Record<string, unknown> {
  return {
    id: thread.id,
    status: thread.status,
    ...(thread.kind ? { kind: thread.kind } : {}),
    // Null means the comment is about the whole page.
    quote: thread.anchor?.quote ?? null,
    messages: thread.messages.map((message) => ({
      from: authorName(message.author),
      body: message.body,
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      at: new Date(message.createdAt).toISOString()
    }))
  }
}

export function runProjectPagesCommentOp(
  op: CommentOp,
  ctx: {
    comments?: ProjectPagesComments
    scopeKey: string
    author: ProjectPageAuthor
    project: { id: string; name: string }
    args: ToolArgs
    page: () => ProjectPageMeta
    pagePath: (pageId: string) => string
  }
): unknown {
  const { comments, scopeKey, args } = ctx
  if (!comments) {
    throw new ProjectPagesError('error', 'This Muster build has no page comments.')
  }
  if (op === 'list_comments') {
    const page = ctx.page()
    const status = toolText(args, 'status') || 'open'
    if (status !== 'open' && status !== 'resolved' && status !== 'all') {
      throw new ProjectPagesError('invalid', 'status must be open, resolved or all.')
    }
    const threads = comments
      .list(scopeKey, page.id)
      .filter((thread) => status === 'all' || thread.status === status)
    return {
      project: ctx.project,
      page: { id: page.id, path: ctx.pagePath(page.id) },
      count: threads.length,
      threads: threads.map(threadRow)
    }
  }
  const threadId = toolText(args, 'thread', true)
  const changed =
    op === 'reply_comment'
      ? comments.reply(
          scopeKey,
          threadId,
          { body: toolText(args, 'body', true), resolve: args.resolve === true },
          ctx.author
        )
      : comments.setStatus(scopeKey, threadId, 'resolved', ctx.author)
  return {
    project: ctx.project,
    page_id: changed.pageId,
    thread: { id: changed.thread.id, status: changed.thread.status }
  }
}
