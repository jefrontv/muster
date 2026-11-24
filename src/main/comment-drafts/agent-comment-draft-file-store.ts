// The agent drafts JSON file: waiting drafts plus the latest closed ones, written atomically.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BotsCommentDraft } from '../../shared/bots-comment-draft-types'

const KEEP_CLOSED = 50

export type StoredAgentDraft = Omit<BotsCommentDraft, 'number' | 'canUndo'> & {
  /** One level of undo. */
  previous: { bodyHtml: string; bodyText: string } | null
}

export function loadAgentDrafts(file: string): StoredAgentDraft[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { drafts?: unknown }
    return Array.isArray(parsed.drafts) ? (parsed.drafts as StoredAgentDraft[]) : []
  } catch {
    return []
  }
}

/** Writes the drafts and returns the trimmed list the caller should keep. */
export function saveAgentDrafts(file: string, drafts: StoredAgentDraft[]): StoredAgentDraft[] {
  const waiting = drafts.filter((d) => d.status === 'waiting')
  const closed = drafts
    .filter((d) => d.status !== 'waiting')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, KEEP_CLOSED)
  const kept = [...waiting, ...closed]
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ drafts: kept }, null, 2))
  renameSync(tmp, file)
  return kept
}
