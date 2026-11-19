import { open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CodexRpcRateLimits,
  CodexRpcRateWindow
} from './codex-rate-limit-window-classification'

const FRESH_MS = 15 * 60_000
const MAX_RECENT_FILES = 24
const HEADER_BYTES = 64 * 1024
const TAIL_BYTES = 256 * 1024

type CodexSessionIdentity = { accountId: string; userId: string }
type CodexSessionQuota = { observedAt: number; limits: CodexRpcRateLimits; planType?: string }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(line))
  } catch {
    return null
  }
}

function windowFromRecord(value: unknown, now: number): CodexRpcRateWindow | null {
  const window = record(value)
  if (
    typeof window?.used_percent !== 'number' ||
    !Number.isFinite(window.used_percent) ||
    typeof window.resets_at !== 'number' ||
    !Number.isFinite(window.resets_at) ||
    window.resets_at * 1000 <= now
  ) {
    return null
  }
  return {
    usedPercent: window.used_percent,
    windowDurationMins: window.window_minutes,
    resetsAt: window.resets_at
  }
}

function recentSessionFolders(home: string, now: number): Set<string> {
  const folders = new Set<string>()
  for (const time of [now, now - FRESH_MS]) {
    const date = new Date(time)
    const local = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value) =>
      String(value).padStart(2, '0')
    )
    folders.add(join(home, 'sessions', ...local))
    folders.add(join(home, 'sessions', ...date.toISOString().slice(0, 10).split('-')))
  }
  return folders
}

async function readSessionQuota(
  file: string,
  identity: CodexSessionIdentity,
  now: number
): Promise<CodexSessionQuota | null> {
  const handle = await open(file, 'r')
  try {
    const { size, mtimeMs } = await handle.stat()
    if (mtimeMs < now - FRESH_MS) {
      return null
    }
    const header = Buffer.alloc(Math.min(size, HEADER_BYTES))
    const { bytesRead: headerSize } = await handle.read(header, 0, header.length, 0)
    const first = parseLine(header.toString('utf8', 0, headerSize).split('\n', 1)[0])
    const meta = record(first?.payload)
    if (
      first?.type !== 'session_meta' ||
      meta?.account_scoped !== true ||
      meta.creator_account_id !== identity.accountId ||
      meta.creator_user_id !== identity.userId
    ) {
      return null
    }
    const tail = Buffer.alloc(Math.min(size, TAIL_BYTES))
    const { bytesRead: tailSize } = await handle.read(tail, 0, tail.length, size - tail.length)
    for (const line of tail.toString('utf8', 0, tailSize).split('\n').toReversed()) {
      if (!line.includes('"token_count"')) {
        continue
      }
      const event = parseLine(line)
      const payload = record(event?.payload)
      const limits = record(payload?.rate_limits)
      const observedAt =
        typeof event?.timestamp === 'string' ? Date.parse(event.timestamp) : Number.NaN
      if (
        event?.type !== 'event_msg' ||
        payload?.type !== 'token_count' ||
        limits?.limit_id !== 'codex' ||
        !(observedAt >= now - FRESH_MS && observedAt <= now)
      ) {
        continue
      }
      const primary = windowFromRecord(limits.primary, now)
      const secondary = windowFromRecord(limits.secondary, now)
      // An expired window needs a provider read even if the other window still has data.
      if ((!primary && limits.primary != null) || (!secondary && limits.secondary != null)) {
        return null
      }
      return primary || secondary
        ? {
            observedAt,
            limits: { primary, secondary },
            planType: typeof limits.plan_type === 'string' ? limits.plan_type : undefined
          }
        : null
    }
    return null
  } finally {
    await handle.close()
  }
}

export async function readRecentCodexSessionQuota(
  home: string,
  identity: CodexSessionIdentity,
  signal: AbortSignal,
  now = Date.now()
): Promise<CodexSessionQuota | null> {
  const folders = Array.from(recentSessionFolders(home, now))
  const entries = await Promise.all(
    folders.map(async (folder) =>
      (await readdir(folder, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name))
        .map((entry) => ({ folder, name: entry.name }))
    )
  )
  const recent = entries
    .flat()
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, MAX_RECENT_FILES)
  let latest: CodexSessionQuota | null = null
  for (const { folder, name } of recent) {
    if (signal.aborted) {
      return null
    }
    const snapshot = await readSessionQuota(join(folder, name), identity, now).catch(() => null)
    if (snapshot && (!latest || snapshot.observedAt > latest.observedAt)) {
      latest = snapshot
    }
  }
  return latest
}
