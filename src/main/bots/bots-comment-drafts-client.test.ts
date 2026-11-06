import { describe, expect, it, vi } from 'vitest'
import { draftFixture } from '../../shared/bots-comment-draft-fixture'
import { createBotsCommentDraftsClient } from './bots-comment-drafts-client'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function setup(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response)
  }
  const client = createBotsCommentDraftsClient(() => ({ port: 4000, token: 'tok' }), fetchMock)
  return { client, fetchMock }
}

function request(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index]
  return {
    url: String(url),
    method: init?.method,
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body))
  }
}

describe('bots comment drafts client', () => {
  it('answers unavailable without calling the server while it is stopped', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = createBotsCommentDraftsClient(() => null, fetchMock)
    expect(await client.list()).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists waiting drafts with the owner token and drops malformed rows', async () => {
    const { client, fetchMock } = setup(json(200, { drafts: [draftFixture(), { id: 3 }] }))
    expect(await client.list()).toEqual({ ok: true, value: [draftFixture()] })
    const sent = request(fetchMock)
    expect(sent.url).toBe('http://127.0.0.1:4000/api/muster/comment-drafts?status=waiting')
    expect(sent.method).toBe('GET')
    expect(sent.headers['X-OpenMausBot-Desktop-Owner']).toBe('tok')
  })

  it('patches the body with its base version', async () => {
    const saved = draftFixture({ version: 2, editedBy: 'user' })
    const { client, fetchMock } = setup(json(200, { draft: saved }))
    const result = await client.update({
      id: 'a/b',
      bodyHtml: '<p>Mine</p>',
      bodyText: 'Mine',
      baseVersion: 1
    })
    expect(result).toEqual({ ok: true, value: saved })
    const sent = request(fetchMock)
    expect(sent.url).toBe('http://127.0.0.1:4000/api/muster/comment-drafts/a%2Fb')
    expect(sent.method).toBe('PATCH')
    expect(sent.body).toEqual({ bodyHtml: '<p>Mine</p>', bodyText: 'Mine', baseVersion: 1 })
  })

  it('hands back the current draft on a stale base version', async () => {
    const current = draftFixture({ version: 3, bodyHtml: '<p>Bob</p>' })
    const { client } = setup(json(409, { error: 'stale', draft: current }))
    const result = await client.update({ id: 'd1', bodyHtml: '', bodyText: '', baseVersion: 1 })
    expect(result).toEqual({ ok: false, reason: 'conflict', message: 'stale', draft: current })
  })

  it('maps 410 to gone and other failures to error', async () => {
    const { client } = setup(json(410, { error: 'not waiting' }), json(500, {}))
    expect(await client.setStatus('d1', 'discarded')).toEqual({
      ok: false,
      reason: 'gone',
      message: 'not waiting'
    })
    expect(await client.undo('d1')).toMatchObject({ ok: false, reason: 'error' })
  })

  it('posts status, undo and feedback to their routes', async () => {
    const { client, fetchMock } = setup(
      json(200, { draft: draftFixture({ status: 'discarded' }) }),
      json(200, { draft: draftFixture({ version: 4 }) }),
      json(202, {})
    )
    await client.setStatus('d1', 'discarded')
    await client.undo('d1')
    expect(await client.feedback('d1', 'shorter')).toEqual({ ok: true, value: null })
    expect(request(fetchMock, 0)).toMatchObject({
      url: 'http://127.0.0.1:4000/api/muster/comment-drafts/d1/status',
      method: 'POST',
      body: { status: 'discarded' }
    })
    expect(request(fetchMock, 1)).toMatchObject({
      url: 'http://127.0.0.1:4000/api/muster/comment-drafts/d1/undo',
      method: 'POST'
    })
    expect(request(fetchMock, 2)).toMatchObject({
      url: 'http://127.0.0.1:4000/api/muster/comment-drafts/d1/feedback',
      body: { note: 'shorter' }
    })
  })

  it('turns a network error into a result', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'))
    const client = createBotsCommentDraftsClient(() => ({ port: 1, token: 't' }), fetchMock)
    expect(await client.list()).toEqual({ ok: false, reason: 'error', message: 'ECONNREFUSED' })
  })
})
