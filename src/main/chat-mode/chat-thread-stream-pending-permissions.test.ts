import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listPendingChatThreadPermissionRequests,
  startChatThreadStream,
  stopChatThreadStream
} from './chat-thread-stream'

function fakeChild(): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    stdin: PassThrough
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  return child
}

const started: string[] = []

function start(threadId: string): ReturnType<typeof fakeChild> {
  const child = fakeChild()
  started.push(threadId)
  const result = startChatThreadStream(
    {
      threadId,
      command: 'claude',
      sender: { send: () => undefined, isDestroyed: () => false }
    },
    { spawn: () => child as never }
  )
  expect(result.ok).toBe(true)
  return child
}

function askPermission(
  child: ReturnType<typeof fakeChild>,
  requestId: string,
  toolName: string,
  input: unknown
): void {
  child.stdout.write(
    `${JSON.stringify({
      type: 'control_request',
      request_id: requestId,
      request: { subtype: 'can_use_tool', tool_name: toolName, input }
    })}\n`
  )
}

afterEach(() => {
  for (const threadId of started.splice(0)) {
    stopChatThreadStream(threadId)
  }
  vi.restoreAllMocks()
})

describe('listPendingChatThreadPermissionRequests', () => {
  it('hands a reloaded renderer the questions the CLI is still blocked on', async () => {
    const child = start('t1')
    askPermission(child, 'req-1', 'Read', { file_path: '/tmp/pace-audit/lh.txt' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(listPendingChatThreadPermissionRequests()).toEqual([
      {
        threadId: 't1',
        requestId: 'req-1',
        toolName: 'Read',
        input: { file_path: '/tmp/pace-audit/lh.txt' }
      }
    ])
  })

  it('drops a question the CLI itself cancelled', async () => {
    const child = start('t2')
    askPermission(child, 'req-2', 'Read', {})
    child.stdout.write(
      `${JSON.stringify({ type: 'control_cancel_request', request_id: 'req-2' })}\n`
    )
    await new Promise((resolve) => setImmediate(resolve))

    expect(listPendingChatThreadPermissionRequests()).toEqual([])
  })

  it('reports nothing once the thread is stopped', async () => {
    const child = start('t3')
    askPermission(child, 'req-3', 'Bash', {})
    await new Promise((resolve) => setImmediate(resolve))
    expect(listPendingChatThreadPermissionRequests()).toHaveLength(1)

    stopChatThreadStream('t3')
    expect(listPendingChatThreadPermissionRequests()).toEqual([])
  })
})
