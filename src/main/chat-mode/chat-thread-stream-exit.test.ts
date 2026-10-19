import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { escalateChatStreamStop, waitForChatThreadStreamExit } from './chat-thread-stream-exit'

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe.skipIf(process.platform === 'win32')('escalateChatStreamStop', () => {
  it('ends the whole process group, including tools the child started', async () => {
    // Stands in for Claude ignoring stdin EOF while a Bash tool runs a long job.
    const child = spawn('sh', ['-c', 'sleep 30 & echo $!; wait'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    })
    const grandchild = await new Promise<number>((resolve) =>
      child.stdout.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())))
    )
    expect(isAlive(grandchild)).toBe(true)

    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
    escalateChatStreamStop('t-exit', child, closed)
    await waitForChatThreadStreamExit('t-exit')
    await closed
    expect(isAlive(grandchild)).toBe(false)
    await waitForChatThreadStreamExit('t-exit', 10)
  }, 10_000)
})
