// IPC for chat-mode's semantic thread titles. One handler; the renderer decides
// when a thread is still auto-titled and applies whatever comes back.

import { ipcMain } from 'electron'
import {
  generateChatThreadTitle,
  type ChatThreadTitleDeps,
  type ChatThreadTitleResult
} from '../chat-mode/chat-thread-title-generation'

const CHANNEL = 'chatThreadTitle:generate'

export function registerChatThreadTitleHandlers(deps: ChatThreadTitleDeps): void {
  ipcMain.removeHandler(CHANNEL)
  ipcMain.handle(
    CHANNEL,
    async (
      _event,
      args: { firstPrompt?: unknown; assistantMessage?: unknown; cwd?: unknown }
    ): Promise<ChatThreadTitleResult> => {
      try {
        if (typeof args?.firstPrompt !== 'string' || args.firstPrompt === '') {
          return { ok: false, error: 'chatThreadTitle: firstPrompt must be a non-empty string' }
        }
        return await generateChatThreadTitle(
          {
            firstPrompt: args.firstPrompt,
            ...(typeof args.assistantMessage === 'string'
              ? { assistantMessage: args.assistantMessage }
              : {}),
            ...(typeof args.cwd === 'string' && args.cwd !== '' ? { cwd: args.cwd } : {})
          },
          deps
        )
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )
}
