// R14: stop chat processes nobody is using. A child is reaped after
// IDLE_STREAM_MS with no turn, question, queued message or background task, and
// no window showing its thread; past MAX_LIVE_STREAMS the least recently active
// idle one goes first. The renderer gets an 'idle' exit and resumes on the next visit.

import type { ChatEngineSnapshot } from '../../shared/chat-engine-types'
import { stopChatThreadStream } from './chat-thread-stream'
import { registry } from './chat-thread-stream-registry'

export const IDLE_STREAM_MS = 10 * 60_000
export const MAX_LIVE_STREAMS = 8
const SWEEP_MS = 60_000

export type ReapCandidate = {
  threadId: string
  lastActivityAt: number
  /** Something is running or waiting on the user, so stopping would lose it. */
  busy: boolean
  watched: boolean
}

/** Which threads to stop now, oldest activity first. */
export function selectChatStreamsToReap(
  candidates: ReapCandidate[],
  now: number,
  limits: { idleMs: number; maxLive: number } = {
    idleMs: IDLE_STREAM_MS,
    maxLive: MAX_LIVE_STREAMS
  }
): string[] {
  const stoppable = candidates
    .filter((candidate) => !candidate.busy && !candidate.watched)
    .sort((a, b) => a.lastActivityAt - b.lastActivityAt)
  const reaped = new Set(
    stoppable
      .filter((candidate) => now - candidate.lastActivityAt >= limits.idleMs)
      .map((candidate) => candidate.threadId)
  )
  let live = candidates.length - reaped.size
  for (const candidate of stoppable) {
    if (live <= limits.maxLive) {
      break
    }
    if (!reaped.has(candidate.threadId)) {
      reaped.add(candidate.threadId)
      live -= 1
    }
  }
  return stoppable.map((candidate) => candidate.threadId).filter((id) => reaped.has(id))
}

export function isChatThreadBusy(snapshot: ChatEngineSnapshot | null): boolean {
  if (!snapshot) {
    return false
  }
  const { meta } = snapshot
  return (
    meta.status === 'working' ||
    meta.status === 'waiting' ||
    meta.status === 'starting' ||
    meta.pending.length > 0 ||
    meta.queue.items.length > 0 ||
    meta.tasks.some((task) => task.status === 'running') ||
    snapshot.turns.at(-1)?.status === 'running'
  )
}

/** Stops the child and tells the renderer why, so it resumes quietly instead of showing an error. */
export function parkChatThreadStream(threadId: string): void {
  const entry = registry.get(threadId)
  if (!entry || entry.stopping) {
    return
  }
  entry.emit({ threadId, kind: 'exit', code: null, reason: 'idle' })
  stopChatThreadStream(threadId)
}

/** Archiving a quiet chat frees its process; a busy one keeps running until it settles and idles out. */
export function parkArchivedChatThreadStream(
  threadId: string,
  snapshot: ChatEngineSnapshot | null
): void {
  const entry = registry.get(threadId)
  if (
    entry?.idleReap &&
    entry.pendingPermissionRequests.size === 0 &&
    !isChatThreadBusy(snapshot)
  ) {
    parkChatThreadStream(threadId)
  }
}

export function startChatStreamReaper(engine: {
  snapshot: (threadId: string) => ChatEngineSnapshot | null
  isWatched: (threadId: string) => boolean
}): () => void {
  const timer = setInterval(() => {
    const candidates: ReapCandidate[] = []
    for (const [threadId, entry] of registry) {
      if (entry.idleReap && !entry.stopping) {
        candidates.push({
          threadId,
          lastActivityAt: entry.lastActivityAt,
          busy:
            entry.pendingPermissionRequests.size > 0 || isChatThreadBusy(engine.snapshot(threadId)),
          watched: engine.isWatched(threadId)
        })
      }
    }
    for (const threadId of selectChatStreamsToReap(candidates, Date.now())) {
      parkChatThreadStream(threadId)
    }
  }, SWEEP_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}
