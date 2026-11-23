import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentCommentDraftStore } from './agent-comment-draft-store'
import { runCommentDraftToolOp } from './comment-draft-tool-ops'

let root: string
let cwd: string
let downloads: string
let clock: number

function makeStore(sendFeedback = vi.fn(async () => true)) {
  return createAgentCommentDraftStore({
    dataDir: join(root, 'data'),
    downloadsDir: downloads,
    sendFeedback,
    now: () => ++clock
  })
}

const source = () => ({ agent: 'claude-code', cwd })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-drafts-'))
  cwd = join(root, 'repo')
  downloads = join(root, 'Downloads')
  mkdirSync(cwd)
  mkdirSync(downloads)
  clock = 1000
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('agent comment draft store', () => {
  it('queues, numbers and persists drafts', async () => {
    const store = makeStore()
    const first = store.queue({
      projectId: 1,
      taskId: 10,
      bodyHtml: '<p>Hi &amp; bye</p>',
      source: source()
    })
    store.queue({ projectId: 1, taskId: 11, bodyHtml: '<p>Two</p>', source: source() })
    expect(first.replaced).toBe(false)
    expect(first.draft.id.startsWith('agent-')).toBe(true)
    expect(first.draft.bodyText).toBe('Hi & bye')
    const reloaded = makeStore()
    const listed = await reloaded.list('waiting')
    expect(listed.ok && listed.value.map((d) => [d.taskId, d.number])).toEqual([
      [10, 1],
      [11, 2]
    ])
  })

  it('replaces the waiting draft for the same task and keeps its queue time', () => {
    const store = makeStore()
    const first = store.queue({ projectId: 1, taskId: 10, bodyHtml: '<p>A</p>', source: source() })
    const second = store.queue({ projectId: 1, taskId: 10, bodyHtml: '<p>B</p>', source: source() })
    expect(second.replaced).toBe(true)
    expect(second.draft.id).toBe(first.draft.id)
    expect(second.draft.version).toBe(2)
    expect(second.draft.queuedAt).toBe(first.draft.queuedAt)
  })

  it('refuses a stale user edit and undoes one level', async () => {
    const store = makeStore()
    const { draft } = store.queue({
      projectId: 1,
      taskId: 10,
      bodyHtml: '<p>A</p>',
      source: source()
    })
    store.amend({ draft: '1', bodyHtml: '<p>B</p>', source: source() })
    const stale = await store.update({
      id: draft.id,
      bodyHtml: '<p>X</p>',
      bodyText: 'X',
      baseVersion: 1
    })
    expect(stale.ok).toBe(false)
    expect(!stale.ok && stale.reason).toBe('conflict')
    const undone = await store.undo(draft.id)
    expect(undone.ok && undone.value.bodyHtml).toBe('<p>A</p>')
    expect(undone.ok && undone.value.canUndo).toBe(false)
  })

  it('only lets an agent attach files from its folder or Downloads', () => {
    const store = makeStore()
    const inside = join(cwd, 'shot.png')
    const outside = join(root, 'secret.txt')
    writeFileSync(inside, 'png')
    writeFileSync(outside, 'nope')
    const ok = store.queue({
      projectId: 1,
      taskId: 10,
      bodyHtml: '<p>A</p>',
      source: source(),
      attachments: [inside]
    })
    expect(ok.draft.attachments).toMatchObject([
      { name: 'shot.png', mime: 'image/png', addedBy: 'bot' }
    ])
    expect(() =>
      store.queue({
        projectId: 1,
        taskId: 11,
        bodyHtml: '<p>A</p>',
        source: source(),
        attachments: [outside]
      })
    ).toThrow(/outside your working folder/)
  })

  it('deletes files when a draft is posted and reports it gone after', async () => {
    const store = makeStore()
    const file = join(downloads, 'a.txt')
    writeFileSync(file, 'a')
    const { draft } = store.queue({
      projectId: 1,
      taskId: 10,
      bodyHtml: '<p>A</p>',
      source: source(),
      attachments: [file]
    })
    const folder = join(root, 'data', 'agent-comment-draft-files', draft.id)
    expect(existsSync(folder)).toBe(true)
    await store.setStatus(draft.id, 'posted')
    expect(existsSync(folder)).toBe(false)
    const again = await store.setStatus(draft.id, 'discarded')
    expect(!again.ok && again.reason).toBe('gone')
  })

  it('reports feedback as unavailable when no terminal takes it', async () => {
    const store = makeStore(vi.fn(async () => false))
    const { draft } = store.queue({
      projectId: 1,
      taskId: 10,
      bodyHtml: '<p>A</p>',
      source: source()
    })
    const result = await store.feedback(draft.id, 'shorter')
    expect(!result.ok && result.reason).toBe('unavailable')
  })
})

describe('comment draft tool ops', () => {
  it('turns bad arguments into TypeErrors the agent can read', async () => {
    const store = makeStore()
    await expect(
      runCommentDraftToolOp(store, 'queue', { project_id: 1 }, source())
    ).rejects.toThrow(TypeError)
    await expect(
      runCommentDraftToolOp(store, 'amend', { draft: '9', body_html: '<p>x</p>' }, source())
    ).rejects.toThrow(/No draft matches/)
  })

  it('queues and lists by task', async () => {
    const store = makeStore()
    await runCommentDraftToolOp(
      store,
      'queue',
      { project_id: 1, task_id: 10, body_html: '<p>A</p>' },
      source()
    )
    await runCommentDraftToolOp(
      store,
      'queue',
      { project_id: 1, task_id: 11, body_html: '<p>B</p>' },
      source()
    )
    const listed = (await runCommentDraftToolOp(store, 'list', { task_id: 11 }, source())) as {
      drafts: { task_id: number }[]
    }
    expect(listed.drafts.map((d) => d.task_id)).toEqual([11])
  })
})
