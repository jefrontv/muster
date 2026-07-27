// The people half of an ActiveCollab task: who it is assigned to, and how to badge a person the
// provider ships no avatar for.

import { translate } from '@/i18n/i18n'
import type { ActiveCollabTask, ActiveCollabUser } from '../../../shared/activecollab-types'

/**
 * THREE states, not two. An assignee id whose name the directory could not resolve is still
 * ASSIGNED — rendering it as "Unassigned" would state something false about the row — so the
 * unresolved case is its own kind and gets its own copy.
 */
export type ActiveCollabAssignee =
  | { kind: 'unassigned' }
  | { kind: 'named'; name: string }
  | { kind: 'unresolved' }

/**
 * `roster` is the assignee picker's lazily-fetched user list. Once it has been paid for, an id the
 * task payload could not name often resolves after all — ActiveCollab 8 omits `assignee_name` from
 * task rows — so the honest-but-useless `unresolved` state collapses into a real name.
 */
export function resolveActiveCollabAssignee(
  task: Pick<ActiveCollabTask, 'assigneeId' | 'assigneeName'>,
  roster: readonly ActiveCollabUser[] = []
): ActiveCollabAssignee {
  if (task.assigneeId === null) {
    return { kind: 'unassigned' }
  }
  const name = task.assigneeName?.trim()
  if (name) {
    return { kind: 'named', name }
  }
  const joined = roster.find((user) => user.id === task.assigneeId)?.name.trim()
  return joined ? { kind: 'named', name: joined } : { kind: 'unresolved' }
}

export function activeCollabAssigneeLabel(assignee: ActiveCollabAssignee): string {
  switch (assignee.kind) {
    case 'named': {
      return assignee.name
    }
    case 'unassigned': {
      return translate('auto.components.activecollab.task_workspace.unassigned', 'Unassigned')
    }
    case 'unresolved': {
      return translate(
        'auto.components.activecollab.task_workspace.assignee_unresolved',
        'Assigned (name unavailable)'
      )
    }
  }
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u

/**
 * First and last initial. Only letters and digits count, so a display name leading with an emoji
 * yields clean initials rather than half a surrogate pair.
 */
export function activeCollabInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => [...word].find((character) => WORD_CHARACTER.test(character)) ?? '')
    .filter(Boolean)
  if (letters.length === 0) {
    return '?'
  }
  const first = letters[0]
  return (letters.length === 1 ? first : `${first}${letters.at(-1)}`).toUpperCase()
}
