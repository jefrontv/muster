// Test-only: a waiting draft with every contract field filled.
import type { BotsCommentDraft } from './bots-comment-draft-types'

export function draftFixture(overrides: Partial<BotsCommentDraft> = {}): BotsCommentDraft {
  return {
    id: 'd1',
    number: 1,
    botId: 'bob',
    botName: 'Bob',
    threadId: 't1',
    projectId: 7,
    taskId: 42,
    bodyHtml: '<p>Hi</p>',
    bodyText: 'Hi',
    status: 'waiting',
    version: 1,
    editedBy: 'bot',
    amendNote: null,
    canUndo: false,
    queuedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}
