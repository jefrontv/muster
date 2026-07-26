// Label formatting split out of task-source-context-summary.ts, which hit the 300-line cap when
// ActiveCollab was added. These are pure presentation helpers with no task-source knowledge, so
// they are the natural seam.

import type { SshConnectionStatus } from '../../../shared/ssh-types'

export function getSshStatusLabel(status: SshConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'connecting':
    case 'deploying-relay':
    case 'reconnecting':
      return 'connecting'
    case 'auth-failed':
      return 'auth needed'
    case 'reconnection-failed':
    case 'error':
      return 'connection issue'
    case 'disconnected':
      return 'disconnected'
  }
}

/** Chrome has little room, so past two entries collapse to "first +N". */
export function formatShortList(labels: readonly string[]): string {
  if (labels.length <= 2) {
    return labels.join(', ')
  }
  return `${labels[0]} +${labels.length - 1}`
}

/** Tooltips have room for the whole set. */
export function formatLongList(labels: readonly string[]): string {
  return labels.join(', ')
}

export function uniqueLabels(labels: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const label of labels) {
    const trimmed = label?.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}
