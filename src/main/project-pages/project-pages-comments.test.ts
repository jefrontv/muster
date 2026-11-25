import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectPagesComments } from './project-pages-comments'
import { createProjectPagesStore } from './project-pages-store'
import { runProjectPagesCommentOp } from './project-pages-comment-tool-ops'

const USER = { kind: 'user' } as const
const AGENT = { kind: 'agent', agent: 'claude' } as const
const SCOPE = 'repo:r1'
const dirs: string[] = []

function setup() {
  const rootDir = mkdtempSync(join(tmpdir(), 'page-comments-'))
  dirs.push(rootDir)
  let clock = 1000
  const store = createProjectPagesStore({ rootDir })
  const comments = createProjectPagesComments({ rootDir, now: () => (clock += 1) })
  const page = store.createPage(SCOPE, { title: 'Plan', markdown: 'Ship the thing.' }, USER)
  return { store, comments, pageId: page.meta.id }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('page comments store', () => {
  it('creates, replies, resolves and reopens a thread', () => {
    const { comments, pageId } = setup()
    const anchor = { quote: 'the thing', prefix: 'Ship ', suffix: '.' }
    const thread = comments.create(SCOPE, pageId, { anchor, body: ' Which thing? ' }, USER)
    expect(thread.messages[0].body).toBe('Which thing?')
    expect(comments.openCount(SCOPE, pageId)).toBe(1)

    const replied = comments.reply(SCOPE, thread.id, { body: 'The release.', resolve: true }, AGENT)
    expect(replied.pageId).toBe(pageId)
    expect(replied.thread.status).toBe('resolved')
    expect(comments.openCount(SCOPE, pageId)).toBe(0)

    comments.setStatus(SCOPE, thread.id, 'open', USER, pageId)
    const [stored] = comments.list(SCOPE, pageId)
    expect(stored.status).toBe('open')
    expect(stored.messages.map((m) => m.author.kind)).toEqual(['user', 'agent'])
  })

  it('keeps a whole-page thread with a null anchor and refuses empty text', () => {
    const { comments, pageId } = setup()
    const thread = comments.create(SCOPE, pageId, { anchor: null, body: 'Overall fine' }, USER)
    expect(thread.anchor).toBeNull()
    expect(() => comments.create(SCOPE, pageId, { anchor: null, body: '  ' }, USER)).toThrow()
    expect(() => comments.create(SCOPE, 'p_missing', { anchor: null, body: 'x' }, USER)).toThrow()
  })

  it('keeps a review note kind, lets it go without text, and drops it on a whole-page note', () => {
    const { comments, pageId } = setup()
    const anchor = { quote: 'the thing', prefix: 'Ship ', suffix: '.' }
    const remove = comments.create(SCOPE, pageId, { anchor, body: ' ', kind: 'delete' }, USER)
    expect(remove).toMatchObject({ kind: 'delete', messages: [{ body: '' }] })
    const whole = comments.create(
      SCOPE,
      pageId,
      { anchor: null, body: 'x', kind: 'looks_good' },
      USER
    )
    expect(whole.kind).toBeUndefined()
    expect(() =>
      comments.create(SCOPE, pageId, { anchor: null, body: ' ', kind: 'delete' }, USER)
    ).toThrow()
  })

  it('announces changes and deletes a thread', () => {
    const { comments, pageId } = setup()
    const seen: string[] = []
    comments.onChange((change) => seen.push(change.author.kind))
    const thread = comments.create(SCOPE, pageId, { anchor: null, body: 'x' }, USER)
    comments.remove(SCOPE, pageId, thread.id, USER)
    expect(comments.list(SCOPE, pageId)).toEqual([])
    expect(seen).toEqual(['user', 'user'])
  })

  it('lists, replies to and resolves threads through the agent ops', () => {
    const { store, comments, pageId } = setup()
    const thread = comments.create(SCOPE, pageId, { anchor: null, body: 'Add tests' }, USER)
    const ctx = {
      comments,
      scopeKey: SCOPE,
      author: AGENT,
      project: { id: 'r1', name: 'Repo' },
      page: () => store.readPage(SCOPE, pageId).meta,
      pagePath: () => 'Plan'
    }
    const listed = runProjectPagesCommentOp('list_comments', { ...ctx, args: {} }) as {
      threads: { id: string; quote: string | null; messages: { from: string }[] }[]
    }
    expect(listed.threads).toHaveLength(1)
    expect(listed.threads[0]).toMatchObject({ id: thread.id, quote: null })
    runProjectPagesCommentOp('reply_comment', { ...ctx, args: { thread: thread.id, body: 'Done' } })
    const resolved = runProjectPagesCommentOp('resolve_comment', {
      ...ctx,
      args: { thread: thread.id }
    }) as { thread: { status: string } }
    expect(resolved.thread.status).toBe('resolved')
    const open = runProjectPagesCommentOp('list_comments', { ...ctx, args: {} }) as {
      count: number
    }
    expect(open.count).toBe(0)
  })
})
