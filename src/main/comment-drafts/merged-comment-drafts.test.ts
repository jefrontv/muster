import { describe, expect, it, vi } from 'vitest'
import type { BotsCommentDraft } from '../../shared/bots-comment-draft-types'
import type { BotsCommentDraftsClient } from '../bots/bots-comment-drafts-client'
import { createMergedCommentDraftsClient } from './merged-comment-drafts'

function draft(id: string, queuedAt: number): BotsCommentDraft {
  return {
    id,
    number: 1,
    botId: 'b',
    botName: 'b',
    threadId: '',
    projectId: 1,
    taskId: queuedAt,
    bodyHtml: '',
    bodyText: '',
    attachments: [],
    status: 'waiting',
    version: 1,
    editedBy: 'bot',
    amendNote: null,
    canUndo: false,
    queuedAt,
    createdAt: queuedAt,
    updatedAt: queuedAt
  }
}

function client(list: BotsCommentDraftsClient['list']): BotsCommentDraftsClient {
  const fail = vi.fn(async () => ({ ok: false as const, reason: 'error' as const, message: 'x' }))
  return {
    list,
    update: fail,
    setStatus: vi.fn(async () => ({ ok: true as const, value: draft('x', 0) })),
    undo: fail,
    feedback: fail,
    addAttachments: fail,
    removeAttachment: fail,
    attachmentBytes: fail
  }
}

describe('merged comment drafts', () => {
  it('interleaves both sources by queue time', async () => {
    const bots = client(async () => ({ ok: true, value: [draft('bot-1', 2)] }))
    const agents = client(async () => ({
      ok: true,
      value: [draft('agent-1', 1), draft('agent-2', 3)]
    }))
    const listed = await createMergedCommentDraftsClient(bots, agents).list('waiting')
    expect(listed.ok && listed.value.map((d) => d.id)).toEqual(['agent-1', 'bot-1', 'agent-2'])
  })

  it('still lists agent drafts while Bots is stopped', async () => {
    const bots = client(async () => ({ ok: false, reason: 'unavailable', message: 'off' }))
    const agents = client(async () => ({ ok: true, value: [draft('agent-1', 1)] }))
    const listed = await createMergedCommentDraftsClient(bots, agents).list('waiting')
    expect(listed.ok && listed.value.length).toBe(1)
  })

  it('routes writes by id prefix', async () => {
    const bots = client(async () => ({ ok: true, value: [] }))
    const agents = client(async () => ({ ok: true, value: [] }))
    const merged = createMergedCommentDraftsClient(bots, agents)
    await merged.setStatus('agent-9', 'discarded')
    await merged.setStatus('abc', 'discarded')
    expect(agents.setStatus).toHaveBeenCalledWith('agent-9', 'discarded')
    expect(bots.setStatus).toHaveBeenCalledWith('abc', 'discarded')
  })
})
