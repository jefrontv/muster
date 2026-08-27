// Persists the last app version this install ran, so the next launch can tell
// "updated" from "fresh install" for the What's New modal. Deliberately its own
// file: app version is per-desktop-install state, and both GlobalSettings and
// the UI view-state sync with mobile, which knows nothing about desktop
// releases — parking it there would let a mobile echo clobber the record.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const WHATS_NEW_FILE_NAME = 'whats-new.json'

export type WhatsNewRecord = {
  lastRunVersion?: string
}

type WhatsNewFile = {
  lastRunVersion?: string
}

export function getWhatsNewFilePath(userDataDir: string): string {
  return join(userDataDir, WHATS_NEW_FILE_NAME)
}

export function readWhatsNewRecord(filePath: string): WhatsNewRecord {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as WhatsNewFile
      if (typeof record.lastRunVersion === 'string') {
        return { lastRunVersion: record.lastRunVersion }
      }
    }
  } catch {
    // Missing or corrupt file = fresh install as far as this feature cares.
  }
  return {}
}

export function writeWhatsNewRecord(filePath: string, record: WhatsNewRecord): void {
  const serialized = `${JSON.stringify({ lastRunVersion: record.lastRunVersion } satisfies WhatsNewFile)}\n`
  mkdirSync(dirname(filePath), { recursive: true })
  // Why: temp + rename matches the other persisted files — a crash mid-write
  // leaves the previous record intact instead of a truncated JSON.
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, serialized, 'utf8')
  renameSync(tempPath, filePath)
}
