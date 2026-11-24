// Comment threads per page, in comments/<pageId>.json beside the page markdown.
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  PAGE_COMMENT_LIMITS,
  type PageCommentAnchor,
  type PageCommentCreateInput,
  type PageCommentsChange,
  type PageCommentStatus,
  type PageCommentThread
} from '../../shared/project-pages-comment-types'
import type { ProjectPageAuthor } from '../../shared/project-pages-types'
import { createProjectPagesFiles, isPageId, writeAtomic } from './project-pages-files'
import { ProjectPagesError } from './project-pages-store'

type CommentsFile = { version: 1; threads: PageCommentThread[] }

export type ProjectPagesComments = ReturnType<typeof createProjectPagesComments>

function cleanBody(body: unknown): string {
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text) {
    throw new ProjectPagesError('invalid', 'A comment needs some text.')
  }
  if (text.length > PAGE_COMMENT_LIMITS.body) {
    throw new ProjectPagesError(
      'invalid',
      `A comment is limited to ${PAGE_COMMENT_LIMITS.body} characters.`
    )
  }
  return text
}

function cleanAnchor(anchor: PageCommentAnchor | null | undefined): PageCommentAnchor | null {
  if (!anchor || typeof anchor.quote !== 'string' || !anchor.quote.trim()) {
    return null
  }
  const context = PAGE_COMMENT_LIMITS.context
  const text = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.slice(0, max) : ''
  return {
    quote: anchor.quote.slice(0, PAGE_COMMENT_LIMITS.quote),
    prefix: text(anchor.prefix, context * 2).slice(-context),
    suffix: text(anchor.suffix, context)
  }
}

function cleanAttachments(paths: unknown): string[] | undefined {
  if (!Array.isArray(paths)) {
    return undefined
  }
  const kept = paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
  return kept.length > 0 ? kept.slice(0, PAGE_COMMENT_LIMITS.attachments) : undefined
}

export function createProjectPagesComments({
  rootDir,
  now = Date.now,
  newId = () => `c_${randomUUID().replace(/-/g, '')}`
}: {
  rootDir: string
  now?: () => number
  newId?: () => string
}) {
  const files = createProjectPagesFiles(rootDir)
  const listeners = new Set<(change: PageCommentsChange) => void>()

  function space(scopeKey: string): string {
    const dir = files.spaceDir(scopeKey, false)
    if (!dir) {
      throw new ProjectPagesError('not_found', 'This project has no pages yet.')
    }
    return dir
  }

  function commentsFile(dir: string, pageId: string): string {
    return join(dir, 'comments', `${pageId}.json`)
  }

  function read(dir: string, pageId: string): PageCommentThread[] {
    try {
      const parsed = JSON.parse(readFileSync(commentsFile(dir, pageId), 'utf-8')) as CommentsFile
      return Array.isArray(parsed?.threads) ? parsed.threads : []
    } catch {
      return []
    }
  }

  function write(dir: string, pageId: string, threads: PageCommentThread[]): void {
    if (threads.length === 0) {
      rmSync(commentsFile(dir, pageId), { force: true })
      return
    }
    writeAtomic(commentsFile(dir, pageId), JSON.stringify({ version: 1, threads }, null, 2))
  }

  function livePageIn(dir: string, pageId: string): void {
    const page = isPageId(pageId) ? files.readTree(dir).find((p) => p.id === pageId) : undefined
    if (!page) {
      throw new ProjectPagesError('not_found', 'No page with that id in this project.')
    }
  }

  function emit(change: PageCommentsChange): void {
    for (const listener of listeners) {
      listener(change)
    }
  }

  /** Thread ids are unique per space, so an agent can name a thread without its page. */
  function locate(scopeKey: string, threadId: string, pageId?: string) {
    const dir = space(scopeKey)
    const pageIds = pageId
      ? [pageId]
      : (() => {
          try {
            return readdirSync(join(dir, 'comments'))
              .filter((name) => name.endsWith('.json'))
              .map((name) => name.slice(0, -5))
          } catch {
            return []
          }
        })()
    for (const id of pageIds) {
      const threads = read(dir, id)
      const index = threads.findIndex((t) => t.id === threadId)
      if (index !== -1) {
        return { dir, pageId: id, threads, index }
      }
    }
    throw new ProjectPagesError('not_found', `No comment thread "${threadId}" in this project.`)
  }

  function change(
    scopeKey: string,
    threadId: string,
    author: ProjectPageAuthor,
    edit: (thread: PageCommentThread) => PageCommentThread,
    pageId?: string
  ): { pageId: string; thread: PageCommentThread } {
    const found = locate(scopeKey, threadId, pageId)
    const thread = edit(found.threads[found.index])
    const threads = found.threads.map((t, i) => (i === found.index ? thread : t))
    write(found.dir, found.pageId, threads)
    emit({ scopeKey, pageId: found.pageId, author })
    return { pageId: found.pageId, thread }
  }

  function list(scopeKey: string, pageId: string): PageCommentThread[] {
    const dir = files.spaceDir(scopeKey, false)
    return dir && isPageId(pageId) ? read(dir, pageId) : []
  }

  return {
    list,
    openCount: (scopeKey: string, pageId: string): number =>
      list(scopeKey, pageId).filter((t) => t.status === 'open').length,
    create(
      scopeKey: string,
      pageId: string,
      input: PageCommentCreateInput,
      author: ProjectPageAuthor
    ): PageCommentThread {
      const dir = space(scopeKey)
      livePageIn(dir, pageId)
      const threads = read(dir, pageId)
      if (threads.length >= PAGE_COMMENT_LIMITS.threadsPerPage) {
        throw new ProjectPagesError('invalid', 'This page has reached the comment limit.')
      }
      const at = now()
      const attachments = cleanAttachments(input.attachments)
      const thread: PageCommentThread = {
        id: newId(),
        anchor: cleanAnchor(input.anchor),
        status: 'open',
        createdAt: at,
        updatedAt: at,
        messages: [
          {
            id: newId(),
            author,
            body: cleanBody(input.body),
            createdAt: at,
            ...(attachments ? { attachments } : {})
          }
        ]
      }
      write(dir, pageId, [...threads, thread])
      emit({ scopeKey, pageId, author })
      return thread
    },
    reply(
      scopeKey: string,
      threadId: string,
      input: { body: string; attachments?: string[]; resolve?: boolean },
      author: ProjectPageAuthor,
      pageId?: string
    ) {
      const body = cleanBody(input.body)
      const attachments = cleanAttachments(input.attachments)
      return change(
        scopeKey,
        threadId,
        author,
        (thread) => {
          if (thread.messages.length >= PAGE_COMMENT_LIMITS.messagesPerThread) {
            throw new ProjectPagesError('invalid', 'This thread has reached the reply limit.')
          }
          const at = now()
          return {
            ...thread,
            status: input.resolve ? 'resolved' : thread.status,
            updatedAt: at,
            messages: [
              ...thread.messages,
              { id: newId(), author, body, createdAt: at, ...(attachments ? { attachments } : {}) }
            ]
          }
        },
        pageId
      )
    },
    setStatus(
      scopeKey: string,
      threadId: string,
      status: PageCommentStatus,
      author: ProjectPageAuthor,
      pageId?: string
    ) {
      return change(
        scopeKey,
        threadId,
        author,
        (thread) => ({ ...thread, status, updatedAt: now() }),
        pageId
      )
    },
    remove(scopeKey: string, pageId: string, threadId: string, author: ProjectPageAuthor): void {
      const found = locate(scopeKey, threadId, pageId)
      write(
        found.dir,
        found.pageId,
        found.threads.filter((t) => t.id !== threadId)
      )
      emit({ scopeKey, pageId: found.pageId, author })
    },
    onChange(listener: (change: PageCommentsChange) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
