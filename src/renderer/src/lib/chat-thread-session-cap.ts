// Which idle chat processes to stop. History renders from the transcript and a
// send relaunches in the background, so stopping an idle process is invisible;
// keeping one per visited thread only costs memory.

export const CHAT_THREAD_IDLE_SESSION_CAP = 4

export type ChatThreadLiveSessionUse = {
  threadId: string
  /** Last send, launch or turn end; 0 when unknown (stopped first). */
  touchedAt: number
  /** Mid-turn, holding a question, or otherwise not safe to stop. */
  busy: boolean
}

/** Least recently used idle sessions beyond the idle cap; busy and kept ones never stop. */
export function selectChatThreadSessionsToStop(args: {
  sessions: readonly ChatThreadLiveSessionUse[]
  keep: ReadonlySet<string>
  cap?: number
}): string[] {
  const cap = args.cap ?? CHAT_THREAD_IDLE_SESSION_CAP
  const idle = args.sessions.filter((session) => !session.busy)
  const excess = idle.length - cap
  if (excess <= 0) {
    return []
  }
  return idle
    .filter((session) => !args.keep.has(session.threadId))
    .sort((a, b) => a.touchedAt - b.touchedAt)
    .slice(0, excess)
    .map((session) => session.threadId)
}
