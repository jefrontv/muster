import { describe, expect, it, vi } from 'vitest'
import { draftFixture } from '../../shared/bots-comment-draft-fixture'
import type { BotsCommentDraftsClient } from './bots-comment-drafts-client'
import { postBotsCommentDraft, type PostComment } from './bots-comment-draft-post'

function fakeClient(overrides: Partial<BotsCommentDraftsClient> = {}): BotsCommentDraftsClient {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: [draftFixture()] })),
    update: vi.fn(async (edit) => ({
      ok: true as const,
      value: draftFixture({ bodyHtml: edit.bodyHtml, version: edit.baseVersion + 1 })
    })),
    setStatus: vi.fn(async (_id, status) => ({
      ok: true as const,
      value: draftFixture({ status, number: null })
    })),
    undo: vi.fn(),
    feedback: vi.fn(),
    addAttachments: vi.fn(),
    removeAttachment: vi.fn(),
    attachmentBytes: vi.fn(),
    ...overrides
  }
}

const posted: PostComment = async () => ({ ok: true, value: null })

describe('postBotsCommentDraft', () => {
  it('posts the stored body, then marks the draft posted', async () => {
    const client = fakeClient()
    const postComment = vi.fn(posted)
    const result = await postBotsCommentDraft(client, postComment, { id: 'd1' })
    expect(postComment).toHaveBeenCalledWith({ taskId: 42, bodyHtml: '<p>Hi</p>' })
    expect(client.setStatus).toHaveBeenCalledWith('d1', 'posted')
    expect(result).toMatchObject({ ok: true, value: { status: 'posted' } })
  })

  it('keeps the draft waiting when ActiveCollab refuses the comment', async () => {
    const client = fakeClient()
    const failure = { ok: false as const, kind: 'network' as const, error: 'offline', status: null }
    const result = await postBotsCommentDraft(
      client,
      vi.fn(async () => failure),
      { id: 'd1' }
    )
    expect(result).toEqual({ ok: false, reason: 'post-failed', failure })
    expect(client.setStatus).not.toHaveBeenCalled()
  })

  it('saves editor text first and posts what was saved', async () => {
    const client = fakeClient()
    const postComment = vi.fn(posted)
    await postBotsCommentDraft(client, postComment, {
      id: 'd1',
      edit: { bodyHtml: '<p>Mine</p>', bodyText: 'Mine', baseVersion: 1 }
    })
    expect(client.update).toHaveBeenCalledWith({
      id: 'd1',
      bodyHtml: '<p>Mine</p>',
      bodyText: 'Mine',
      baseVersion: 1
    })
    expect(postComment).toHaveBeenCalledWith({ taskId: 42, bodyHtml: '<p>Mine</p>' })
  })

  it('does not post over a bot amend it has not seen', async () => {
    const current = draftFixture({ version: 3, bodyHtml: '<p>Bob</p>' })
    const client = fakeClient({
      update: vi.fn(async () => ({
        ok: false as const,
        reason: 'conflict' as const,
        message: 'stale',
        draft: current
      }))
    })
    const postComment = vi.fn(posted)
    const result = await postBotsCommentDraft(client, postComment, {
      id: 'd1',
      edit: { bodyHtml: '<p>Mine</p>', bodyText: 'Mine', baseVersion: 1 }
    })
    expect(result).toMatchObject({ ok: false, reason: 'conflict', draft: current })
    expect(postComment).not.toHaveBeenCalled()
  })

  it('answers gone for a draft no longer waiting', async () => {
    const client = fakeClient({ list: vi.fn(async () => ({ ok: true as const, value: [] })) })
    const postComment = vi.fn(posted)
    expect(await postBotsCommentDraft(client, postComment, { id: 'd1' })).toMatchObject({
      ok: false,
      reason: 'gone'
    })
    expect(postComment).not.toHaveBeenCalled()
  })

  it('says so when the comment posted but the draft could not be cleared', async () => {
    const client = fakeClient({
      setStatus: vi.fn(async () => ({
        ok: false as const,
        reason: 'error' as const,
        message: 'HTTP 500'
      }))
    })
    const result = await postBotsCommentDraft(client, vi.fn(posted), { id: 'd1' })
    expect(result).toMatchObject({ ok: false, reason: 'posted-unmarked' })
  })

  it('retries only the clear after a post that could not be cleared', async () => {
    const seen = new Map<string, number>()
    const postComment = vi.fn(posted)
    const failing = fakeClient({
      setStatus: vi.fn(async () => ({
        ok: false as const,
        reason: 'error' as const,
        message: 'down'
      }))
    })
    const first = await postBotsCommentDraft(failing, postComment, { id: 'd1' }, seen)
    expect(first).toMatchObject({ ok: false, reason: 'posted-unmarked' })
    const client = fakeClient()
    const second = await postBotsCommentDraft(client, postComment, { id: 'd1' }, seen)
    expect(postComment).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ ok: true, value: { status: 'posted' } })
    expect(seen.size).toBe(0)
  })

  it('reassigns the task after the comment posts and the draft clears', async () => {
    const client = fakeClient()
    const reassign = vi.fn(async () => ({ ok: true as const, value: null }))
    const result = await postBotsCommentDraft(
      client,
      vi.fn(posted),
      { id: 'd1', reassignTo: 9 },
      new Map(),
      reassign
    )
    expect(reassign).toHaveBeenCalledWith({ projectId: 7, taskId: 42, assigneeId: 9 })
    expect(result).toMatchObject({ ok: true })
  })

  it('reports a failed reassign without posting again', async () => {
    const client = fakeClient()
    const postComment = vi.fn(posted)
    const failure = { ok: false as const, kind: 'api' as const, error: 'Forbidden', status: 403 }
    const result = await postBotsCommentDraft(
      client,
      postComment,
      { id: 'd1', reassignTo: 9 },
      new Map(),
      vi.fn(async () => failure)
    )
    expect(postComment).toHaveBeenCalledTimes(1)
    expect(client.setStatus).toHaveBeenCalledWith('d1', 'posted')
    expect(result).toMatchObject({
      ok: false,
      reason: 'reassign-failed',
      message: "Posted, but couldn't reassign: Forbidden"
    })
  })

  it('never reassigns when the comment fails', async () => {
    const reassign = vi.fn()
    const failure = { ok: false as const, kind: 'network' as const, error: 'offline', status: null }
    await postBotsCommentDraft(
      fakeClient(),
      vi.fn(async () => failure),
      { id: 'd1', reassignTo: 9 },
      new Map(),
      reassign
    )
    expect(reassign).not.toHaveBeenCalled()
  })

  describe('with files', () => {
    const shot = { id: 'a1', name: 'shot.png', size: 3, mime: 'image/png', addedBy: 'bot' as const }
    const withFiles = () =>
      fakeClient({
        list: vi.fn(async () => ({
          ok: true as const,
          value: [draftFixture({ attachments: [shot] })]
        }))
      })

    it('uploads every file first and posts with the codes', async () => {
      const postComment = vi.fn(posted)
      const upload = vi.fn(async () => ({ ok: true as const, codes: ['c1'] }))
      const result = await postBotsCommentDraft(
        withFiles(),
        postComment,
        { id: 'd1' },
        new Map(),
        undefined,
        upload
      )
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ attachments: [shot] }))
      expect(postComment).toHaveBeenCalledWith({
        taskId: 42,
        bodyHtml: '<p>Hi</p>',
        attachmentCodes: ['c1']
      })
      expect(result.ok).toBe(true)
    })

    it('posts nothing and keeps the draft waiting when an upload fails', async () => {
      const client = withFiles()
      const postComment = vi.fn(posted)
      const upload = vi.fn(async () => ({ ok: false as const, message: 'shot.png was refused' }))
      const result = await postBotsCommentDraft(
        client,
        postComment,
        { id: 'd1' },
        new Map(),
        undefined,
        upload
      )
      expect(result).toEqual({
        ok: false,
        reason: 'attachments-failed',
        message: 'shot.png was refused'
      })
      expect(postComment).not.toHaveBeenCalled()
      expect(client.setStatus).not.toHaveBeenCalled()
    })

    it('sends no codes for a draft without files', async () => {
      const postComment = vi.fn(posted)
      const upload = vi.fn()
      await postBotsCommentDraft(
        fakeClient(),
        postComment,
        { id: 'd1' },
        new Map(),
        undefined,
        upload
      )
      expect(upload).not.toHaveBeenCalled()
      expect(postComment).toHaveBeenCalledWith({ taskId: 42, bodyHtml: '<p>Hi</p>' })
    })
  })
})
