// Named counts for a turn's work ("Edited 2 files, ran 3 commands") and the
// plain end-of-turn changes line. Built from the same activities the work log
// rows use, so the fold label and the rows always agree.

import {
  englishTranslate,
  type NativeChatSurface,
  type NativeChatToolActivity,
  type NativeChatTranslate
} from './native-chat-tool-activity-types'
import { pathFileName } from './native-chat-tool-input-fields'

export type NativeChatWorkCounts = {
  editedFiles: number
  commands: number
  readFiles: number
  searches: number
  web: number
  agents: number
  services: number
  failed: number
}

const MAX_FOLD_PARTS = 3

export function countWorkActivities(
  activities: readonly NativeChatToolActivity[]
): NativeChatWorkCounts {
  const edited = new Set<string>()
  const read = new Set<string>()
  const counts: NativeChatWorkCounts = {
    editedFiles: 0,
    commands: 0,
    readFiles: 0,
    searches: 0,
    web: 0,
    agents: 0,
    services: 0,
    failed: 0
  }
  for (const [index, activity] of activities.entries()) {
    if (activity.hidden) {
      continue
    }
    if (activity.failed) {
      counts.failed += 1
    }
    const key = activity.path ?? `#${index}`
    if (activity.group === 'edit' && !activity.failed) {
      edited.add(key)
    } else if (activity.group === 'read') {
      read.add(key)
    } else if (activity.group === 'command') {
      counts.commands += 1
    } else if (activity.group === 'search') {
      counts.searches += 1
    } else if (activity.group === 'web') {
      counts.web += 1
    } else if (activity.group === 'agent') {
      counts.agents += 1
    } else if (activity.group === 'mcp') {
      counts.services += 1
    }
  }
  return { ...counts, editedFiles: edited.size, readFiles: read.size }
}

type Part = { count: number; one: [string, string]; many: [string, string] }

function partsFor(counts: NativeChatWorkCounts, surface: NativeChatSurface): Part[] {
  const chat = surface === 'chat'
  const p = 'components.native-chat.workSummary'
  return [
    {
      count: counts.editedFiles,
      one: chat ? [`${p}.updatedOne`, 'updated 1 file'] : [`${p}.editedOne`, 'edited 1 file'],
      many: chat
        ? [`${p}.updatedMany`, 'updated {{count}} files']
        : [`${p}.editedMany`, 'edited {{count}} files']
    },
    {
      count: counts.commands,
      one: [`${p}.commandOne`, 'ran 1 command'],
      many: [`${p}.commandMany`, 'ran {{count}} commands']
    },
    {
      count: counts.readFiles,
      one: chat ? [`${p}.lookedOne`, 'looked through 1 file'] : [`${p}.readOne`, 'read 1 file'],
      many: chat
        ? [`${p}.lookedMany`, 'looked through {{count}} files']
        : [`${p}.readMany`, 'read {{count}} files']
    },
    {
      count: counts.searches,
      one: [`${p}.searchOne`, 'searched once'],
      many: [`${p}.searchMany`, 'searched {{count}} times']
    },
    {
      count: counts.web,
      one: [`${p}.webOne`, 'checked the web once'],
      many: [`${p}.webMany`, 'checked the web {{count}} times']
    },
    {
      count: counts.agents,
      one: [`${p}.agentOne`, 'asked 1 helper'],
      many: [`${p}.agentMany`, 'asked {{count}} helpers']
    },
    {
      count: counts.services,
      one: [`${p}.serviceOne`, 'used 1 connected service'],
      many: [`${p}.serviceMany`, 'used connected services {{count}} times']
    }
  ]
}

function capitalize(text: string): string {
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text
}

/** "Edited 2 files, ran 3 commands"; null when the turn did no visible work. */
export function describeWorkFold(
  counts: NativeChatWorkCounts,
  surface: NativeChatSurface,
  t: NativeChatTranslate = englishTranslate
): string | null {
  const phrases = partsFor(counts, surface)
    .filter((part) => part.count > 0)
    .slice(0, MAX_FOLD_PARTS)
    .map((part) => {
      const [key, fallback] = part.count === 1 ? part.one : part.many
      return t(key, fallback, { count: part.count })
    })
  return phrases.length > 0 ? capitalize(phrases.join(', ')) : null
}

/** "1 step didn't work": failures stay out of the counts but are never hidden. */
export function describeWorkFailures(
  counts: NativeChatWorkCounts,
  t: NativeChatTranslate = englishTranslate
): string | null {
  if (counts.failed === 0) {
    return null
  }
  return counts.failed === 1
    ? t('components.native-chat.workSummary.failedOne', "1 step didn't work")
    : t('components.native-chat.workSummary.failedMany', "{{count}} steps didn't work", {
        count: counts.failed
      })
}

/** A run of reads and searches as one row: "Explored 6 files" / "Looked through 6 files". */
export function describeExploreGroup(
  activities: readonly NativeChatToolActivity[],
  surface: NativeChatSurface,
  t: NativeChatTranslate = englishTranslate
): string {
  const files = new Set(
    activities.filter((a) => a.group === 'read').map((a, index) => a.path ?? `#${index}`)
  ).size
  if (files === 0) {
    return t('components.native-chat.activity.searchedProject', 'Searched the project')
  }
  if (surface === 'chat') {
    return files === 1
      ? t('components.native-chat.workSummary.lookedOneTitle', 'Looked through 1 file')
      : t('components.native-chat.workSummary.lookedManyTitle', 'Looked through {{count}} files', {
          count: files
        })
  }
  return files === 1
    ? t('components.native-chat.workSummary.exploredOne', 'Explored 1 file')
    : t('components.native-chat.workSummary.exploredMany', 'Explored {{count}} files', {
        count: files
      })
}

const CHANGED_NAMES_SHOWN = 3

/** Chat mode's end-of-turn line: file names only, no folders, no counts. */
export function describeChangedFilesLine(
  paths: readonly string[],
  t: NativeChatTranslate = englishTranslate
): { text: string; names: string[] } {
  const names = [...new Set(paths.map(pathFileName))]
  if (names.length > CHANGED_NAMES_SHOWN) {
    return {
      text: t('components.native-chat.changes.changedMany', 'Changed {{count}} files', {
        count: names.length
      }),
      names
    }
  }
  const list =
    names.length <= 1
      ? (names[0] ?? '')
      : t('components.native-chat.changes.nameList', '{{rest}} and {{last}}', {
          rest: names.slice(0, -1).join(', '),
          last: names.at(-1)!
        })
  return {
    text: t('components.native-chat.changes.changed', 'Changed {{files}}', { files: list }),
    names
  }
}
