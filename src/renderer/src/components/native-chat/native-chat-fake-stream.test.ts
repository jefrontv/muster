// End to end without Electron: the fake Claude CLI streams a turn, main's stream
// decoder and transcript reader turn it into messages, and the work log describes
// it for both surfaces, as a thread does after the transcript lands.

import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatThreadStreamEvent } from '../../../../shared/chat-thread-stream-types'
import { createChatThreadStreamDecoder } from '../../../../main/chat-mode/chat-thread-stream-decode'
import { readNativeChatTranscript } from '../../../../main/native-chat/transcript-reader'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { deriveNativeChatTurnWork } from './native-chat-turn-work'
import { buildNativeChatTimelineRows } from './native-chat-timeline-rows'

const FIXTURE = resolve(__dirname, '../../../../../tests/e2e/fixtures/fake-claude-stream.cjs')

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fake-claude-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function runTurn(prompt: string): Promise<{
  events: ChatThreadStreamEvent[]
  messages: NativeChatMessage[]
}> {
  const events: ChatThreadStreamEvent[] = []
  const child = spawn(process.execPath, [FIXTURE, '--permission-mode', 'acceptEdits'], {
    cwd: dir,
    env: { ...process.env, FAKE_CLAUDE_TRANSCRIPT_DIR: dir, FAKE_CLAUDE_SCENARIO: 'full' },
    stdio: ['pipe', 'pipe', 'inherit']
  })
  const done = new Promise<void>((resolveDone) => {
    const decoder = createChatThreadStreamDecoder('t1', (event) => {
      events.push(event)
      if (event.kind === 'turn-complete') {
        resolveDone()
      }
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => decoder.push(chunk))
  })
  child.stdin.write(
    `${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] } })}\n`
  )
  await done
  child.stdin.end()
  await new Promise((resolveExit) => child.on('exit', resolveExit))
  const file = (await readdir(dir)).find((name) => name.endsWith('.jsonl'))
  const read = await readNativeChatTranscript('claude', 'fake', { filePath: join(dir, file!) })
  return { events, messages: 'messages' in read ? read.messages : [] }
}

describe('a fake Claude turn through the decoders', () => {
  it('reports the model at init and streams text deltas', async () => {
    const { events } = await runTurn('fix the header')
    expect(events.find((event) => event.kind === 'init')).toMatchObject({ model: 'fake-model' })
    expect(events.some((event) => event.kind === 'delta')).toBe(true)
    expect(events.at(-1)).toMatchObject({ kind: 'turn-complete', isError: false })
  })

  it('reads as plain sentences in Chat mode and as real work in Code mode', async () => {
    const { messages } = await runTurn('fix the header')
    const chat = deriveNativeChatTurnWork(messages, { surface: 'chat', live: false, cwd: dir })
    const lines = chat.activities.map((a) => [a.verb, a.object].filter(Boolean).join(' '))
    expect(lines).toEqual([
      'Read style.css',
      'Build the theme',
      'Searched the web',
      'Asked a helper to check other headers',
      'Updated style.css'
    ])
    expect(JSON.stringify(chat.activities)).not.toContain('npm run build')

    const code = deriveNativeChatTurnWork(messages, { surface: 'code', live: false, cwd: dir })
    const edit = code.activities.find((a) => a.group === 'edit')
    expect(edit).toMatchObject({ object: 'style.css', additions: 1, deletions: 1, detail: 'diff' })
    expect(code.activities.find((a) => a.group === 'command')).toMatchObject({
      object: 'npm run build',
      detail: 'terminal'
    })
    expect(code.activities.find((a) => a.group === 'web')?.sources).toHaveLength(1)
  })

  it('settles into prose rows, one work log and a changes card', async () => {
    const { messages } = await runTurn('fix the header')
    const rows = buildNativeChatTimelineRows({ messages, isWorking: false, surface: 'chat' })
    expect(rows.filter((row) => row.kind === 'work-log')).toHaveLength(1)
    expect(rows.some((row) => row.kind === 'turn-changed-files')).toBe(true)
    expect(rows.filter((row) => row.kind === 'message').length).toBeGreaterThanOrEqual(3)
  })

  it('ends a failed turn with an error result', async () => {
    const { events } = await runTurn('please fail')
    expect(events.at(-1)).toMatchObject({
      kind: 'turn-complete',
      isError: true,
      errorMessage: 'error_max_turns'
    })
  })
})
