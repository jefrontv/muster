import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatEngine } from './engine/chat-engine'
import {
  respondChatThreadPermission,
  sendChatThreadStreamMessage,
  startChatThreadStream,
  stopAllChatThreadStreams
} from './chat-thread-stream'

const FAKE_CLI = resolve(__dirname, '../../../tests/e2e/fixtures/fake-claude-stream.cjs')

describe.skipIf(process.platform === 'win32')(
  'chat thread stream against the fake Claude CLI',
  () => {
    const dirs: string[] = []
    afterEach(() => {
      stopAllChatThreadStreams()
      for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('runs a whole turn: initialize, replay, approval, structured diff, result', async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'fake-claude-'))
      dirs.push(cwd)
      const engine = new ChatEngine()
      const started = startChatThreadStream(
        {
          threadId: 'fake',
          command: `'${process.execPath}' '${FAKE_CLI}' -p --input-format stream-json`,
          cwd,
          sender: { send: () => undefined, isDestroyed: () => false }
        },
        { engine: { engine, initialize: {} }, hookEnv: () => ({}), loginShellEnv: () => ({}) }
      )
      expect(started.ok).toBe(true)
      await vi.waitFor(() => expect(engine.capabilities('fake')?.models).toHaveLength(2), {
        timeout: 5_000
      })

      expect(await sendChatThreadStreamMessage('fake', 'Fix the header height')).toBe('sent')
      await vi.waitFor(() => expect(engine.snapshot('fake')?.meta.pending).toHaveLength(1), {
        timeout: 5_000
      })
      const [pending] = engine.snapshot('fake')!.meta.pending
      expect(pending).toMatchObject({ kind: 'permission', toolName: 'Edit' })

      respondChatThreadPermission({
        threadId: 'fake',
        requestId: pending!.requestId,
        behavior: 'allow'
      })
      await vi.waitFor(() => expect(engine.snapshot('fake')?.turns.at(-1)?.status).toBe('done'), {
        timeout: 5_000
      })

      const snapshot = engine.snapshot('fake')!
      const [turn] = snapshot.turns
      expect(turn?.user).toMatchObject({
        text: 'Fix the header height',
        delivery: 'delivered',
        uuid: expect.any(String)
      })
      expect(turn?.items.map((item) => item.kind)).toEqual(['text', 'tool', 'text'])
      expect(turn?.items[1]).toMatchObject({
        status: 'done',
        result: { additions: 1, deletions: 1 }
      })
      expect(snapshot.meta).toMatchObject({
        status: 'idle',
        suggestions: ['Run the build'],
        totalCostUsd: 0.01
      })
      expect(snapshot.meta.session).toMatchObject({
        sessionId: expect.stringMatching(/^fake-session-/),
        model: 'fake-model'
      })
    })
  }
)
