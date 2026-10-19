// End to end without Electron: the fake Claude CLI streams a turn, main's stream
// decoder and transcript reader turn it into messages, and Code mode's adapter
// turns those into the chat-engine turn the thread surface draws.

import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatThreadStreamEvent } from '../../../../shared/chat-thread-stream-types'
import { createChatThreadStreamDecoder } from '../../../../main/chat-mode/chat-thread-stream-decode'
import { readNativeChatTranscript } from '../../../../main/native-chat/transcript-reader'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { nativeChatEngineTurns } from './native-chat-engine-turns'

function settledTurns(messages: NativeChatMessage[]) {
  return nativeChatEngineTurns(
    {
      agent: 'claude',
      messages,
      isWorking: false,
      awaitingUser: false,
      failedDeliveryText: 'Not delivered',
      now: 0
    },
    null
  ).turns
}

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

  it('maps every tool in the transcript onto the thread registry', async () => {
    const { messages } = await runTurn('fix the header')
    const [turn] = settledTurns(messages)
    expect(turn).toMatchObject({ status: 'done', user: { text: 'fix the header' } })
    const tools = turn!.items.flatMap((item) =>
      item.kind === 'tool' ? [item.name] : item.kind === 'agent' ? ['agent'] : []
    )
    expect(tools).toEqual(['Read', 'Bash', 'WebSearch', 'agent', 'Edit'])
    const edit = turn!.items.find((item) => item.kind === 'tool' && item.name === 'Edit')
    expect(edit).toMatchObject({
      status: 'done',
      result: { additions: 1, deletions: 1, isError: false }
    })
    const bash = turn!.items.find((item) => item.kind === 'tool' && item.name === 'Bash')
    expect(bash).toMatchObject({ input: { command: 'npm run build' }, status: 'done' })
    expect(turn!.items.some((item) => item.kind === 'text')).toBe(true)
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
