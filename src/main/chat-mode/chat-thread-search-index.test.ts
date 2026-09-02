import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import {
  ensureThreadIndexed,
  findThreadMatch,
  initChatThreadSearchIndex,
  messagesToSearchEntries,
  pruneChatThreadSearchIndex,
  resetChatThreadSearchIndexForTests,
  searchChatThreads
} from './chat-thread-search-index'

function message(role: 'user' | 'assistant' | 'system', text: string): NativeChatMessage {
  return {
    id: `${role}-${text.slice(0, 8)}`,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: 0,
    source: 'transcript'
  } as unknown as NativeChatMessage
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chat-search-'))
  resetChatThreadSearchIndexForTests()
})

afterEach(async () => {
  resetChatThreadSearchIndexForTests()
  await rm(dir, { recursive: true, force: true })
})

async function transcript(name: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, 'x')
  return path
}

describe('messagesToSearchEntries', () => {
  it('keeps user and assistant prose', () => {
    expect(
      messagesToSearchEntries([message('user', 'deploy staging'), message('assistant', 'done')])
    ).toEqual([
      { source: 'user', text: 'deploy staging' },
      { source: 'assistant', text: 'done' }
    ])
  })

  it('drops other roles and empty text', () => {
    expect(
      messagesToSearchEntries([message('system', 'be helpful'), message('user', '   ')])
    ).toEqual([])
  })

  it('ignores non-text blocks so tool JSON never becomes a hit', () => {
    const withTool = {
      ...message('assistant', ''),
      blocks: [{ type: 'tool-call', name: 'Bash', input: { command: 'staging' } }]
    } as unknown as NativeChatMessage
    expect(messagesToSearchEntries([withTool])).toEqual([])
  })

  it('caps the total text one thread contributes', () => {
    const entries = messagesToSearchEntries([
      message('user', 'a'.repeat(300_000)),
      message('assistant', 'b'.repeat(300_000)),
      message('user', 'never reached')
    ])
    expect(entries.reduce((sum, e) => sum + e.text.length, 0)).toBe(400_000)
    expect(entries).toHaveLength(2)
  })
})

describe('findThreadMatch', () => {
  it('reports which side of the conversation matched', () => {
    const match = findThreadMatch(
      't1',
      [
        { source: 'user', text: 'what about the invoice' },
        { source: 'assistant', text: 'the staging site is up' }
      ],
      'staging'
    )
    expect(match).toEqual({
      threadId: 't1',
      source: 'assistant',
      snippet: 'the staging site is up'
    })
  })

  it('is null when nothing matches', () => {
    expect(findThreadMatch('t1', [{ source: 'user', text: 'hello' }], 'staging')).toBeNull()
  })
})

describe('ensureThreadIndexed', () => {
  it('re-reads only when the transcript moved', async () => {
    const path = await transcript('a.jsonl')
    const read = vi.fn(async () => [message('user', 'deploy staging')])

    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)
    expect(read).toHaveBeenCalledTimes(1)

    await writeFile(path, 'xx')
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('notices an edit that kept the file the same size', async () => {
    const path = await transcript('b.jsonl')
    const read = vi.fn(async () => [message('user', 'one')])
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)

    await writeFile(path, 'y')
    const future = new Date(Date.now() + 10_000)
    await utimes(path, future, future)
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('drops the entry when the transcript is gone', async () => {
    const path = await transcript('c.jsonl')
    const read = vi.fn(async () => [message('user', 'deploy staging')])
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)

    await rm(path)
    expect(await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)).toEqual([])
  })

  it('keeps the last good entries when a read throws', async () => {
    const path = await transcript('d.jsonl')
    let fail = false
    const read = vi.fn(async () => {
      if (fail) {
        throw new Error('unreadable')
      }
      return [message('user', 'deploy staging')]
    })
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)

    fail = true
    await writeFile(path, 'xx')
    expect(await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)).toEqual([
      { source: 'user', text: 'deploy staging' }
    ])
  })
})

describe('searchChatThreads', () => {
  it('returns one match per thread and stops at the result cap', async () => {
    const targets: { threadId: string; transcriptPath: string }[] = []
    for (let i = 0; i < 60; i += 1) {
      targets.push({ threadId: `t${i}`, transcriptPath: await transcript(`t${i}.jsonl`) })
    }
    const result = await searchChatThreads(targets, 'staging', async () => [
      message('user', 'deploy staging')
    ])
    expect(result.matches).toHaveLength(50)
    expect(result.truncated).toBe(true)
  })

  it('reports untruncated when everything fits', async () => {
    const targets = [{ threadId: 't1', transcriptPath: await transcript('one.jsonl') }]
    const result = await searchChatThreads(targets, 'staging', async () => [
      message('user', 'deploy staging')
    ])
    expect(result).toEqual({
      matches: [{ threadId: 't1', source: 'user', snippet: 'deploy staging' }],
      truncated: false
    })
  })
})

describe('pruneChatThreadSearchIndex', () => {
  it('forgets threads that no longer exist', async () => {
    const path = await transcript('e.jsonl')
    const read = vi.fn(async () => [message('user', 'deploy staging')])
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)

    pruneChatThreadSearchIndex(['t2'])
    await ensureThreadIndexed({ threadId: 't1', transcriptPath: path }, read)
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('sidecar persistence', () => {
  it('restores entries so a restart does not re-read every transcript', async () => {
    const { flushChatThreadSearchIndexForTests } = await import('./chat-thread-search-index')
    const sidecar = join(dir, 'index.json')
    const path = await transcript('f.jsonl')
    const read = vi.fn(async () => [message('user', 'deploy staging')])

    initChatThreadSearchIndex({ filePath: sidecar })
    await searchChatThreads([{ threadId: 't1', transcriptPath: path }], 'staging', read)
    await flushChatThreadSearchIndexForTests()

    resetChatThreadSearchIndexForTests()
    initChatThreadSearchIndex({ filePath: sidecar })
    const result = await searchChatThreads(
      [{ threadId: 't1', transcriptPath: path }],
      'staging',
      read
    )
    expect(result.matches).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('discards a sidecar written by a different schema version', async () => {
    const sidecar = join(dir, 'stale.json')
    await writeFile(
      sidecar,
      JSON.stringify({
        schemaVersion: 99,
        threads: { t1: { mtimeMs: 1, sizeBytes: 1, entries: [] } }
      })
    )
    const path = await transcript('g.jsonl')
    const read = vi.fn(async () => [message('user', 'deploy staging')])

    initChatThreadSearchIndex({ filePath: sidecar })
    await searchChatThreads([{ threadId: 't1', transcriptPath: path }], 'staging', read)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
