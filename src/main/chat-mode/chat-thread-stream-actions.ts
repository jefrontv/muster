// Per-thread calls into a live chat stream: user turns and the message queue,
// and answers to the CLI's tool-permission questions.

import type {
  ChatThreadMessageQueueSnapshot,
  ChatThreadSendMode,
  ChatThreadSendOutcome
} from '../../shared/chat-thread-stream-types'
import type { ChatThreadQueueWritePriority } from './chat-thread-message-queue'
import {
  buildChatStreamUserContent,
  readChatStreamImages,
  type ChatStreamImageRead
} from './chat-thread-stream-user-content'
import { buildPermissionControlResponse } from './chat-thread-permission-response'
import { registry, writeStdinLine, type StreamEntry } from './chat-thread-stream-registry'

export async function writeUserMessage(
  entry: StreamEntry,
  threadId: string,
  message: { id: string; text: string; imagePaths?: readonly string[] },
  priority?: ChatThreadQueueWritePriority
): Promise<boolean> {
  const { text, imagePaths } = message
  const { images, skipped }: ChatStreamImageRead = imagePaths?.length
    ? await readChatStreamImages(imagePaths)
    : { images: [], skipped: [] }
  // The child can die during the file reads; writeStdinLine refuses a stopped entry.
  if (entry.stopping) {
    return false
  }
  if (skipped.length > 0) {
    entry.emit({ threadId, kind: 'attachments-skipped', paths: skipped })
  }
  const content = buildChatStreamUserContent(text, images)
  if (content.length === 0) {
    return false
  }
  const written = writeStdinLine(entry, {
    type: 'user',
    // The CLI echoes this uuid back when the model receives the message.
    uuid: message.id,
    message: { role: 'user', content },
    parent_tool_use_id: null,
    ...(priority ? { priority } : {})
  })
  if (written) {
    entry.engine?.userMessage({
      id: message.id,
      text,
      imageCount: images.length,
      steer: priority === 'next'
    })
  }
  return written
}

/** auto queues behind a running turn; steer hands the message to the running turn. */
export async function sendChatThreadStreamMessage(
  threadId: string,
  text: string,
  imagePaths?: readonly string[],
  mode: ChatThreadSendMode = 'auto'
): Promise<ChatThreadSendOutcome> {
  const entry = registry.get(threadId)
  if (!entry || entry.stopping) {
    return 'failed'
  }
  return entry.queue.submit({
    text,
    ...(imagePaths?.length ? { imagePaths: [...imagePaths] } : {}),
    mode
  })
}

export async function steerChatThreadQueuedMessage(
  threadId: string,
  messageId: string
): Promise<boolean> {
  return (await registry.get(threadId)?.queue.steer(messageId)) ?? false
}

export function removeChatThreadQueuedMessage(threadId: string, messageId: string): boolean {
  return registry.get(threadId)?.queue.remove(messageId) ?? false
}

/** Resume a queue paused by Stop. */
export async function sendNextChatThreadQueuedMessage(threadId: string): Promise<boolean> {
  return (await registry.get(threadId)?.queue.sendNext()) ?? false
}

/** Every non-empty queue across live threads, for a renderer that reloaded. */
export function listChatThreadMessageQueues(): {
  threadId: string
  queue: ChatThreadMessageQueueSnapshot
}[] {
  const queues: { threadId: string; queue: ChatThreadMessageQueueSnapshot }[] = []
  for (const [threadId, entry] of registry) {
    const queue = entry.queue.snapshot()
    if (!entry.stopping && queue.items.length > 0) {
      queues.push({ threadId, queue })
    }
  }
  return queues
}

export function respondChatThreadPermission(args: {
  threadId: string
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
  updatedInput?: unknown
  updatedPermissions?: unknown[]
  interrupt?: boolean
}): boolean {
  const entry = registry.get(args.threadId)
  if (!entry) {
    return false
  }
  // A stale request_id (turn already interrupted) is written anyway; the CLI
  // tolerates unknown ids silently (verified against 2.1.224).
  const originalInput = entry.pendingPermissionRequests.get(args.requestId)?.input
  entry.pendingPermissionRequests.delete(args.requestId)
  const written = writeStdinLine(
    entry,
    buildPermissionControlResponse({
      ...args,
      updatedInput: args.updatedInput ?? originalInput
    })
  )
  if (written) {
    entry.engine?.resolved(args.requestId, args.behavior)
  }
  return written
}

/** Every can_use_tool question still awaiting a verdict, across live threads.
 *  A renderer that reloaded mid-question has no record of it, and the CLI blocks
 *  until someone answers — so the renderer re-reads them on mount. */
export function listPendingChatThreadPermissionRequests(): {
  threadId: string
  requestId: string
  toolName: string
  input: unknown
}[] {
  const pending: { threadId: string; requestId: string; toolName: string; input: unknown }[] = []
  for (const [threadId, entry] of registry) {
    if (entry.stopping) {
      continue
    }
    for (const [requestId, request] of entry.pendingPermissionRequests) {
      pending.push({ threadId, requestId, toolName: request.toolName, input: request.input })
    }
  }
  return pending
}
