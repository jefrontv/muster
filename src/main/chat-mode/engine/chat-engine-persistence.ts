// Per-thread snapshot files, so opening a thread (or reopening the app) shows
// its history at once instead of re-reading the whole transcript.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatEngineSnapshot, ChatEngineTurn } from '../../../shared/chat-engine-types'

const SNAPSHOT_VERSION = 1
/** Older turns keep their text but drop tool output, which dominates file size. */
const FULL_DETAIL_TURNS = 60

type SnapshotFile = { version: number; savedAt: number; snapshot: ChatEngineSnapshot }

export type StoredChatEngineSnapshot = { snapshot: ChatEngineSnapshot; savedAt: number }

const SAFE_ID = /^[A-Za-z0-9_-]+$/

function snapshotPath(dir: string, threadId: string): string | null {
  return SAFE_ID.test(threadId) ? join(dir, `${threadId}.json`) : null
}

function slimTurn(turn: ChatEngineTurn): ChatEngineTurn {
  return {
    ...turn,
    items: turn.items.map((item) =>
      item.kind === 'tool' && item.result
        ? {
            ...item,
            result: {
              ...item.result,
              text: '',
              stdout: undefined,
              stderr: undefined,
              truncated: true
            }
          }
        : item
    )
  }
}

export async function writeChatEngineSnapshot(
  dir: string,
  snapshot: ChatEngineSnapshot,
  savedAt = Date.now()
): Promise<void> {
  const path = snapshotPath(dir, snapshot.meta.threadId)
  if (!path) {
    return
  }
  const cutoff = snapshot.turns.length - FULL_DETAIL_TURNS
  const file: SnapshotFile = {
    version: SNAPSHOT_VERSION,
    savedAt,
    snapshot: {
      ...snapshot,
      // Pending requests and running tasks belong to a live process; a restored thread has none.
      meta: {
        ...snapshot.meta,
        pending: [],
        status: 'idle',
        tasks: snapshot.meta.tasks.map((task) =>
          task.status === 'running' ? { ...task, status: 'stopped' } : task
        )
      },
      turns: snapshot.turns.map((turn, index) => (index < cutoff ? slimTurn(turn) : turn))
    }
  }
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(file), { mode: 0o600 })
  await rename(temp, path)
}

export async function readChatEngineSnapshot(
  dir: string,
  threadId: string
): Promise<StoredChatEngineSnapshot | null> {
  const path = snapshotPath(dir, threadId)
  if (!path) {
    return null
  }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<SnapshotFile>
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      !parsed.snapshot?.meta ||
      !Array.isArray(parsed.snapshot.turns)
    ) {
      return null
    }
    return {
      snapshot: parsed.snapshot,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    }
  } catch {
    return null
  }
}

export async function deleteChatEngineSnapshot(dir: string, threadId: string): Promise<void> {
  const path = snapshotPath(dir, threadId)
  if (path) {
    await rm(path, { force: true })
  }
}
