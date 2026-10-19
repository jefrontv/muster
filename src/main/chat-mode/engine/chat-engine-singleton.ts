// The one ChatEngine the stream layer feeds and chat-engine IPC reads.

import { app } from 'electron'
import { join } from 'node:path'
import { resolveSessionFilePath } from '../../native-chat/session-file-resolver'
import { chatStore } from '../chat-workspace-store-singleton'
import { ChatEngine } from './chat-engine'
import { createChatEngineRestore } from './chat-engine-restore'

let engineSingleton: ChatEngine | null = null

/** The thread's Claude transcript on disk, or null when it has none (or it was deleted). */
export async function chatThreadTranscriptPath(threadId: string): Promise<string | null> {
  const thread = chatStore()
    .getState()
    .threads.find((entry) => entry.id === threadId)
  if (!thread?.claudeSessionId) {
    return null
  }
  return resolveSessionFilePath(
    'claude',
    thread.claudeSessionId,
    thread.transcriptPath ? { transcriptPath: thread.transcriptPath } : {}
  )
}

export function chatEngine(): ChatEngine {
  if (!engineSingleton) {
    const persistDir = (): string => join(app.getPath('userData'), 'chat-engine')
    const engine = new ChatEngine({
      persistDir,
      restore: createChatEngineRestore({ persistDir, transcriptPathFor: chatThreadTranscriptPath })
    })
    app.on('before-quit', () => engine.flushAll())
    engineSingleton = engine
  }
  return engineSingleton
}
