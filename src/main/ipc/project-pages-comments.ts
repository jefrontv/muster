import { ipcMain } from 'electron'
import type { PageCommentAnchor } from '../../shared/project-pages-comment-types'
import { projectPagesComments } from '../project-pages/project-pages'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import { guarded, pageId, scope } from './project-pages'
import { sendToTrustedUIRenderer } from './ui'

export const PROJECT_PAGES_COMMENTS_CHANGED_CHANNEL = 'projectPages:commentsChanged'

const CHANNELS = [
  'projectPages:comments',
  'projectPages:addComment',
  'projectPages:replyComment',
  'projectPages:setCommentStatus',
  'projectPages:deleteComment'
] as const

const USER = { kind: 'user' } as const

function threadId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw new ProjectPagesError('invalid', 'A thread id is required.')
  }
  return value
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function attachments(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : undefined
}

let stopForwarding: (() => void) | null = null

export function registerProjectPagesCommentHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  const comments = projectPagesComments
  ipcMain.handle('projectPages:comments', (_e, key: unknown, id: unknown) =>
    guarded(() => comments().list(scope(key), pageId(id)))
  )
  ipcMain.handle('projectPages:addComment', (_e, key: unknown, id: unknown, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      return comments().create(
        scope(key),
        pageId(id),
        {
          anchor: (input.anchor ?? null) as PageCommentAnchor | null,
          body: text(input.body),
          attachments: attachments(input.attachments),
          kind: input.kind === 'delete' || input.kind === 'looks_good' ? input.kind : undefined
        },
        USER
      )
    })
  )
  ipcMain.handle(
    'projectPages:replyComment',
    (_e, key: unknown, id: unknown, thread: unknown, args: unknown) =>
      guarded(() => {
        const input = (args ?? {}) as Record<string, unknown>
        return comments().reply(
          scope(key),
          threadId(thread),
          { body: text(input.body), attachments: attachments(input.attachments) },
          USER,
          pageId(id)
        ).thread
      })
  )
  ipcMain.handle(
    'projectPages:setCommentStatus',
    (_e, key: unknown, id: unknown, thread: unknown, status: unknown) =>
      guarded(
        () =>
          comments().setStatus(
            scope(key),
            threadId(thread),
            status === 'resolved' ? 'resolved' : 'open',
            USER,
            pageId(id)
          ).thread
      )
  )
  ipcMain.handle('projectPages:deleteComment', (_e, key: unknown, id: unknown, thread: unknown) =>
    guarded(() => comments().remove(scope(key), pageId(id), threadId(thread), USER))
  )
  stopForwarding?.()
  // Agent replies arrive through the site bridge, so every window hears about them here.
  stopForwarding = comments().onChange((change) =>
    sendToTrustedUIRenderer(PROJECT_PAGES_COMMENTS_CHANGED_CHANNEL, change)
  )
}
