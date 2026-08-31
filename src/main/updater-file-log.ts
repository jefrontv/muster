// A durable log of what electron-updater did.
//
// Why this exists: a user reported "Could not complete the update" with a 404 for an asset named
// after their INSTALLED version under the NEW release's tag. Console output is invisible on a user's
// machine, so the cause had to be inferred from a cache directory — and the decisive line (which URL
// was requested, and whether a fallback ran) was simply gone. Appending to a file makes the next
// report answerable by asking for one file.
//
// Deliberately dependency-free and best-effort: an updater logger that can throw, block, or grow
// without bound would be worse than no logger at all.

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Small enough to paste into an issue, large enough to hold several update cycles. */
const MAX_LOG_BYTES = 512 * 1024

export type UpdaterLogger = {
  info: (message: unknown) => void
  warn: (message: unknown) => void
  error: (message: unknown) => void
  debug: (message: unknown) => void
}

function logFilePath(): string {
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'updater.log')
}

/** One generation of history, so a failure is still readable after the next launch writes over it. */
function rotateIfLarge(filePath: string): void {
  try {
    if (statSync(filePath).size < MAX_LOG_BYTES) {
      return
    }
    renameSync(filePath, `${filePath}.1`)
  } catch {
    // No file yet, or an unrotatable one. Either way the append below decides what happens next.
  }
}

function format(level: string, message: unknown): string {
  const text =
    message instanceof Error
      ? `${message.message}\n${message.stack ?? ''}`
      : typeof message === 'string'
        ? message
        : JSON.stringify(message)
  return `${new Date().toISOString()} ${level} ${text}\n`
}

/**
 * Writes to the console (kept: it is what `--enable-logging` and Console.app surface) and appends to
 * `<userData>/logs/updater.log`.
 */
export function createUpdaterFileLogger(): UpdaterLogger {
  let filePath: string | null = null
  try {
    filePath = logFilePath()
    rotateIfLarge(filePath)
  } catch {
    // Unwritable userData: fall back to console only rather than failing updater setup.
  }

  const write = (level: string, message: unknown): void => {
    if (filePath === null) {
      return
    }
    try {
      appendFileSync(filePath, format(level, message))
    } catch {
      // A full or read-only disk must never break the updater.
    }
  }

  return {
    info: (message) => {
      console.info('[autoUpdater]', message)
      write('INFO ', message)
    },
    warn: (message) => {
      console.warn('[autoUpdater]', message)
      write('WARN ', message)
    },
    error: (message) => {
      console.error('[autoUpdater]', message)
      write('ERROR', message)
    },
    debug: (message) => {
      console.debug('[autoUpdater]', message)
      write('DEBUG', message)
    }
  }
}
