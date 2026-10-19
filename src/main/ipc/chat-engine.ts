// IPC for the main-process chat engine: a renderer subscribes to a thread for a
// snapshot and then patches, and sends control actions to its live process.

import { ipcMain, type WebContents } from 'electron'
import type {
  ChatEngineCapabilities,
  ChatEngineControlResult,
  ChatEngineSnapshot
} from '../../shared/chat-engine-types'
import { chatEngine, chatThreadTranscriptPath } from '../chat-mode/engine/chat-engine-singleton'
import {
  controlNeedsSettingsRefresh,
  controlRequestFor,
  metaAfterControl,
  parseControlAction
} from '../chat-mode/engine/chat-engine-control-actions'

const CHANNELS = [
  'chatEngine:subscribe',
  'chatEngine:unsubscribe',
  'chatEngine:capabilities',
  'chatEngine:control',
  'chatEngine:transcriptExists'
] as const

const trackedSenders = new WeakSet<WebContents>()

function asThreadId(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error('chatEngine: threadId must be a non-empty string')
  }
  return value
}

export function registerChatEngineHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'chatEngine:subscribe',
    async (event, threadId: unknown): Promise<ChatEngineSnapshot> => {
      const sender = event.sender
      if (!trackedSenders.has(sender)) {
        trackedSenders.add(sender)
        sender.once('destroyed', () => chatEngine().unsubscribeEverywhere(sender.id))
      }
      return chatEngine().subscribe(asThreadId(threadId), {
        id: sender.id,
        send: (channel, patch) => sender.send(channel, patch),
        isDestroyed: () => sender.isDestroyed()
      })
    }
  )

  ipcMain.handle('chatEngine:unsubscribe', async (event, threadId: unknown): Promise<void> => {
    chatEngine().unsubscribe(asThreadId(threadId), event.sender.id)
  })

  ipcMain.handle(
    'chatEngine:capabilities',
    async (_event, threadId: unknown): Promise<ChatEngineCapabilities | null> =>
      chatEngine().capabilities(asThreadId(threadId))
  )

  ipcMain.handle(
    'chatEngine:control',
    async (_event, threadId: unknown, action: unknown): Promise<ChatEngineControlResult> => {
      try {
        const id = asThreadId(threadId)
        const parsed = parseControlAction(action)
        const engine = chatEngine()
        const control = engine.control(id)
        if (!control) {
          return { ok: false, error: 'This chat is not running.' }
        }
        const { subtype, fields } = controlRequestFor(parsed)
        const value = await control.request(subtype, fields)
        const snapshot = engine.snapshot(id)
        const patch = snapshot ? metaAfterControl(parsed, value, snapshot.meta) : null
        if (patch && engine.control(id) === control) {
          engine.updateMeta(id, patch)
        }
        if (controlNeedsSettingsRefresh(parsed)) {
          await engine.refreshAppliedSettings(id, control)
        }
        return { ok: true, value: value ?? null }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // R16: `--resume` with a deleted transcript fails; the launcher starts fresh instead.
  ipcMain.handle(
    'chatEngine:transcriptExists',
    async (_event, threadId: unknown): Promise<boolean> =>
      (await chatThreadTranscriptPath(asThreadId(threadId))) !== null
  )
}
