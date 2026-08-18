// Blocking in-app confirm for destructive chat-connector tool calls. The tool
// handler awaits the user's verdict; full-access permission modes cannot skip
// this gate because it lives server-side, not in the CLI's can_use_tool flow.

import { randomUUID } from 'node:crypto'
import type { ChatConnectorConfirmRequest } from '../../shared/chat-connector-types'

const CONFIRM_TIMEOUT_MS = 120_000

type PendingConfirm = {
  resolve: (confirmed: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingConfirm>()
let sendRequest: ((request: ChatConnectorConfirmRequest) => void) | null = null

/** Production wiring broadcasts to every BrowserWindow; tests inject a spy. */
export function setChatConnectorConfirmSender(
  sender: ((request: ChatConnectorConfirmRequest) => void) | null
): void {
  sendRequest = sender
}

export function requestChatConnectorConfirm(args: {
  threadId: string
  summary: string
}): Promise<boolean> {
  if (!sendRequest) {
    return Promise.resolve(false)
  }
  const requestId = randomUUID()
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve(false)
    }, CONFIRM_TIMEOUT_MS)
    timer.unref?.()
    pending.set(requestId, { resolve, timer })
    try {
      sendRequest?.({ requestId, threadId: args.threadId, summary: args.summary })
    } catch {
      // A destroyed window mid-send falls through to the timeout denial.
    }
  })
}

export function respondChatConnectorConfirm(requestId: string, confirmed: boolean): boolean {
  const entry = pending.get(requestId)
  if (!entry) {
    return false
  }
  clearTimeout(entry.timer)
  pending.delete(requestId)
  entry.resolve(confirmed)
  return true
}

/** Test-only: deny and clear everything outstanding. */
export function clearChatConnectorConfirmsForTests(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
    entry.resolve(false)
  }
  pending.clear()
}
