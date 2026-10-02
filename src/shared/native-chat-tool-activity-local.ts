// Tools that act on the workspace itself: edits, commands, reads and searches.

import type { NativeChatToolResultBlock } from './native-chat-types'
import {
  DESCRIBE_BASE as base,
  type NativeChatDescribe as Describe
} from './native-chat-tool-activity-types'
import {
  firstLine,
  inputField,
  inputPath,
  pathFileName,
  relativeToolPath
} from './native-chat-tool-input-fields'

export const describeEdit: Describe = ({ call, result, surface, t, cwd }) => {
  const path = inputPath(call.input)
  const detail = result?.detail
  const created = call.name === 'Write' && detail?.created === true
  const name = path ? pathFileName(path) : t('components.native-chat.activity.aFile', 'a file')
  if (surface === 'chat') {
    return {
      ...base,
      group: 'edit',
      icon: created ? 'file-plus' : 'pen',
      verb: created
        ? t('components.native-chat.activity.created', 'Created')
        : t('components.native-chat.activity.updated', 'Updated'),
      object: name,
      path,
      liveLabel: t('components.native-chat.activity.updatingFile', 'Updating {{file}}', {
        file: name
      })
    }
  }
  const hasDiff = (detail?.patch?.length ?? 0) > 0 || typeof call.input === 'object'
  return {
    ...base,
    group: 'edit',
    icon: created ? 'file-plus' : 'pen',
    verb: created
      ? t('components.native-chat.activity.created', 'Created')
      : t('components.native-chat.activity.edited', 'Edited'),
    object: path ? relativeToolPath(path, cwd) : name,
    objectIsCode: path !== null,
    detail: hasDiff ? 'diff' : 'none',
    path,
    ...(detail?.additions !== undefined ? { additions: detail.additions } : {}),
    ...(detail?.deletions !== undefined ? { deletions: detail.deletions } : {}),
    liveLabel: t('components.native-chat.activity.editingFile', 'Editing {{file}}', { file: name })
  }
}

export const describeCommand: Describe = ({ call, result, surface, t }) => {
  const description = inputField(call.input, 'description')
  const command = inputField(call.input, 'command') ?? ''
  if (surface === 'chat') {
    const sentence = description ?? t('components.native-chat.activity.ranCommand', 'Ran a command')
    return {
      ...base,
      group: 'command',
      icon: 'terminal',
      verb: sentence,
      object: '',
      liveLabel:
        description ?? t('components.native-chat.activity.runningCommand', 'Running a command')
    }
  }
  return {
    ...base,
    group: 'command',
    icon: 'terminal',
    verb: t('components.native-chat.activity.ran', 'Ran'),
    object: firstLine(command) || (description ?? ''),
    objectIsCode: command !== '',
    detail: result ? 'terminal' : 'none',
    meta: result?.detail?.interrupted
      ? [t('components.native-chat.activity.interrupted', 'interrupted')]
      : [],
    liveLabel:
      description ?? t('components.native-chat.activity.runningCommand', 'Running a command')
  }
}

function matchCount(result: NativeChatToolResultBlock | undefined): string | null {
  const found = /^Found (\d+) (files?|lines?|matches)/.exec(result?.output.trim() ?? '')
  return found ? `${found[1]} ${found[2]}` : null
}

export const describeRead: Describe = ({ call, surface, t, cwd }) => {
  const path = inputPath(call.input)
  const name = path ? pathFileName(path) : t('components.native-chat.activity.aFile', 'a file')
  const offset = Number(inputField(call.input, 'offset') ?? 0)
  const limit = Number(inputField(call.input, 'limit') ?? 0)
  const range =
    surface === 'code' && limit > 0
      ? [
          t('components.native-chat.activity.lineRange', 'lines {{from}}–{{to}}', {
            from: Math.max(1, offset),
            to: Math.max(1, offset) + limit - 1
          })
        ]
      : []
  return {
    ...base,
    group: 'read',
    icon: 'file',
    verb: t('components.native-chat.activity.read', 'Read'),
    object: surface === 'code' && path ? relativeToolPath(path, cwd) : name,
    objectIsCode: surface === 'code' && path !== null,
    detail: surface === 'code' && path ? 'files' : 'none',
    path,
    meta: range,
    liveLabel: t('components.native-chat.activity.readingFile', 'Reading {{file}}', { file: name })
  }
}

export const describeSearch: Describe = ({ call, result, surface, t, cwd }) => {
  const liveLabel = t('components.native-chat.activity.searchingProject', 'Searching the project')
  if (surface === 'chat') {
    const verb = t('components.native-chat.activity.searchedProject', 'Searched the project')
    return { ...base, group: 'search', icon: 'search', verb, object: '', liveLabel }
  }
  const pattern = inputField(call.input, 'pattern') ?? ''
  const where = inputPath(call.input) ?? inputField(call.input, 'glob')
  const count = matchCount(result)
  return {
    ...base,
    group: 'search',
    icon: 'search',
    verb:
      call.name === 'Grep'
        ? t('components.native-chat.activity.searched', 'Searched')
        : t('components.native-chat.activity.listed', 'Listed'),
    object: [pattern, where ? relativeToolPath(where, cwd) : ''].filter(Boolean).join(' in '),
    objectIsCode: true,
    detail: result ? 'files' : 'none',
    meta: count ? [count] : [],
    liveLabel
  }
}
