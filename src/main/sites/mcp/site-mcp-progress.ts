// Periodic MCP progress notifications so clients with request timeouts stay alive during slow I/O.

import type { SiteMcpContext } from './site-mcp-context'

export const MCP_HEARTBEAT_INTERVAL_MS = 10_000
export const MCP_TRANSFER_PROGRESS_INTERVAL_MS = 2_000

export async function withProgressHeartbeat<T>(
  context: Pick<SiteMcpContext, 'progress'>,
  label: string,
  work: () => Promise<T>,
  intervalMs: number = MCP_HEARTBEAT_INTERVAL_MS
): Promise<T> {
  const report = context.progress
  if (!report) {
    return work()
  }
  report({ progress: 0, message: label })
  const startedAt = Date.now()
  let tick = 0
  const timer = setInterval(() => {
    tick += 1
    const elapsedSec = Math.round((Date.now() - startedAt) / 1_000)
    report({ progress: tick, message: `${label} (${elapsedSec}s)` })
  }, intervalMs)
  timer.unref?.()
  try {
    return await work()
  } finally {
    clearInterval(timer)
  }
}

export function createTransferProgressReporter(
  context: Pick<SiteMcpContext, 'progress'>,
  label: string,
  minIntervalMs: number = MCP_TRANSFER_PROGRESS_INTERVAL_MS
): (transferred: number, total: number) => void {
  const report = context.progress
  if (!report) {
    return () => undefined
  }
  let lastSentAt = 0
  let completed = false
  return (transferred: number, total: number): void => {
    const finished = total > 0 && transferred >= total
    const now = Date.now()
    if ((finished && !completed) || now - lastSentAt >= minIntervalMs) {
      lastSentAt = now
      if (finished) {
        completed = true
      }
      const message =
        total > 0
          ? `${label} (${Math.min(100, Math.round((transferred / total) * 100))}%)`
          : `${label} (${transferred} bytes)`
      report({ progress: transferred, message })
    }
  }
}
