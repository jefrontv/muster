// Picks the history a thread opens with: the engine's own snapshot, unless the
// transcript has moved on since (the session was continued in a terminal) or
// there is no snapshot yet (threads from before the engine).

import { stat } from 'node:fs/promises'
import type { ChatEngineSnapshot } from '../../../shared/chat-engine-types'
import { readChatEngineSnapshot } from './chat-engine-persistence'
import { hydrateChatEngineFromTranscript } from './chat-engine-transcript'

/** The CLI appends bookkeeping lines just after a turn ends, so slightly newer is still in sync. */
const TRANSCRIPT_SLACK_MS = 10_000

export type ChatEngineRestore = (threadId: string) => Promise<ChatEngineSnapshot | null>

export function createChatEngineRestore(deps: {
  persistDir: () => string | null
  transcriptPathFor?: (threadId: string) => Promise<string | null>
  now?: () => number
}): ChatEngineRestore {
  const now = deps.now ?? Date.now
  return async (threadId) => {
    const dir = deps.persistDir()
    const stored = dir ? await readChatEngineSnapshot(dir, threadId) : null
    const transcriptPath = deps.transcriptPathFor
      ? await deps.transcriptPathFor(threadId).catch(() => null)
      : null
    const transcriptMtime = transcriptPath
      ? await stat(transcriptPath).then(
          (stats) => stats.mtimeMs,
          () => null
        )
      : null
    if (
      stored &&
      (transcriptMtime === null || transcriptMtime <= stored.savedAt + TRANSCRIPT_SLACK_MS)
    ) {
      return stored.snapshot
    }
    if (transcriptPath && transcriptMtime !== null) {
      const hydrated = await hydrateChatEngineFromTranscript(threadId, transcriptPath, now())
      if (hydrated) {
        return hydrated
      }
    }
    return stored?.snapshot ?? null
  }
}
