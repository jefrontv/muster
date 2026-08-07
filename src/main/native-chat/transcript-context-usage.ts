// Context-window usage from a Claude JSONL transcript: the latest assistant
// record's message.usage tells how full the session's context currently is.

import { open } from 'node:fs/promises'
import { asRecord, parseJsonObject } from '../ai-vault/session-scanner-values'

export type TranscriptContextUsage = {
  /** input + cache_read + cache_creation + output tokens of the latest assistant record. */
  usedTokens: number
}

/** Only the file tail is read per refresh; the latest assistant record lives there. */
const TAIL_READ_BYTES = 256 * 1024

function usageTokens(value: unknown): number | null {
  const usage = asRecord(value)
  if (!usage) {
    return null
  }
  const parts = [
    usage.input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_creation_input_tokens,
    usage.output_tokens
  ]
  let total = 0
  let sawAny = false
  for (const part of parts) {
    if (typeof part === 'number' && Number.isFinite(part)) {
      total += part
      sawAny = true
    }
  }
  return sawAny ? total : null
}

/** Latest assistant usage across decoded JSONL lines (scanned newest-first).
 *  Lines that fail to parse — including a tail-read's truncated first line —
 *  are skipped rather than failing the whole scan. */
export function latestContextUsageFromLines(
  lines: readonly string[]
): TranscriptContextUsage | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const record = parseJsonObject(lines[i])
    if (!record || record.type !== 'assistant') {
      continue
    }
    const tokens = usageTokens(asRecord(record.message)?.usage)
    if (tokens !== null) {
      return { usedTokens: tokens }
    }
  }
  return null
}

/** Read the transcript file's tail and extract the latest assistant usage.
 *  Returns null when the file is missing, unreadable, or carries no usage. */
export async function readTranscriptContextUsage(
  filePath: string
): Promise<TranscriptContextUsage | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(filePath, 'r')
    const { size } = await handle.stat()
    const readLength = Math.min(size, TAIL_READ_BYTES)
    const buffer = Buffer.alloc(readLength)
    await handle.read(buffer, 0, readLength, size - readLength)
    return latestContextUsageFromLines(buffer.toString('utf-8').split('\n'))
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}
