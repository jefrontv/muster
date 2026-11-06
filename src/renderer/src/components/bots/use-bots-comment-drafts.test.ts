// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { draftFixture } from '../../../../shared/bots-comment-draft-fixture'
import { useBotsCommentDrafts } from './use-bots-comment-drafts'

let changed: (() => void) | null = null
const bots = {
  listCommentDrafts: vi.fn(),
  commentDraftTask: vi.fn(),
  onCommentDraftsChanged: vi.fn((callback: () => void) => {
    changed = callback
    return () => {
      changed = null
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  changed = null
  ;(window as unknown as { api: { bots: unknown } }).api = { bots }
  bots.commentDraftTask.mockResolvedValue({
    ok: true,
    value: { title: 'Fix header', taskNumber: 3, projectName: 'Website' }
  })
})

describe('useBotsCommentDrafts', () => {
  it('loads while running, refetches on the change signal and names each task once', async () => {
    bots.listCommentDrafts
      .mockResolvedValueOnce({ ok: true, value: [draftFixture()] })
      .mockResolvedValueOnce({
        ok: true,
        value: [draftFixture(), draftFixture({ id: 'd2', number: 2 })]
      })
    const { result } = renderHook(() => useBotsCommentDrafts(true))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.drafts).toHaveLength(1)
    await waitFor(() => expect(result.current.tasks[42]?.title).toBe('Fix header'))

    await act(async () => changed?.())
    await waitFor(() => expect(result.current.drafts).toHaveLength(2))
    expect(bots.commentDraftTask).toHaveBeenCalledTimes(1)
    expect(bots.commentDraftTask).toHaveBeenCalledWith({ projectId: 7, taskId: 42 })
  })

  it('lists the newest queued draft first', async () => {
    bots.listCommentDrafts.mockResolvedValueOnce({
      ok: true,
      value: [
        draftFixture({ id: 'old', queuedAt: 1000 }),
        draftFixture({ id: 'new', queuedAt: 3000 }),
        draftFixture({ id: 'mid', queuedAt: 2000 })
      ]
    })
    const { result } = renderHook(() => useBotsCommentDrafts(true))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.drafts.map((draft) => draft.id)).toEqual(['new', 'mid', 'old'])
  })

  it('stays empty and unsubscribed while the server is not running', () => {
    const { result } = renderHook(() => useBotsCommentDrafts(false))
    expect(result.current.drafts).toEqual([])
    expect(bots.listCommentDrafts).not.toHaveBeenCalled()
    expect(bots.onCommentDraftsChanged).not.toHaveBeenCalled()
  })

  it('keeps the shown drafts and reports the error when a refetch fails', async () => {
    bots.listCommentDrafts
      .mockResolvedValueOnce({ ok: true, value: [draftFixture()] })
      .mockResolvedValueOnce({ ok: false, reason: 'error', message: 'HTTP 500' })
    const { result } = renderHook(() => useBotsCommentDrafts(true))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await act(async () => changed?.())
    await waitFor(() => expect(result.current.error).toBe('HTTP 500'))
    expect(result.current.drafts).toHaveLength(1)
  })
})
