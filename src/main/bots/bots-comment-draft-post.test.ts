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
})
