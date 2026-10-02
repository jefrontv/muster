import { describe, expect, it } from 'vitest'
import { describeToolActivity } from './native-chat-tool-activity'
import { describeToolApproval } from './native-chat-tool-approval'
import {
  countWorkActivities,
  describeChangedFilesLine,
  describeExploreGroup,
  describeWorkFailures,
  describeWorkFold
} from './native-chat-work-summary'
import type { NativeChatToolResultBlock } from './native-chat-types'

const ok: NativeChatToolResultBlock = { type: 'tool-result', output: 'ok' }
const failed: NativeChatToolResultBlock = { type: 'tool-result', output: 'no', isError: true }
const activity = (name: string, input: unknown, result = ok) =>
  describeToolActivity({ type: 'tool-call', name, input }, result, 'code')

const turn = [
  activity('Edit', { file_path: '/s/a.php' }),
  activity('Edit', { file_path: '/s/a.php' }),
  activity('Write', { file_path: '/s/b.css' }),
  activity('Bash', { command: 'ls' }),
  activity('Bash', { command: 'pwd' }),
  activity('Bash', { command: 'false' }, failed),
  activity('Read', { file_path: '/s/c.php' })
]

describe('describeWorkFold', () => {
  it('names distinct files and commands, up to three parts', () => {
    const counts = countWorkActivities(turn)
    expect(counts).toMatchObject({ editedFiles: 2, commands: 3, readFiles: 1, failed: 1 })
    expect(describeWorkFold(counts, 'code')).toBe('Edited 2 files, ran 3 commands, read 1 file')
    expect(describeWorkFold(counts, 'chat')).toBe(
      'Updated 2 files, ran 3 commands, looked through 1 file'
    )
  })

  it('is null for a turn without visible work, and flags failures separately', () => {
    const none = countWorkActivities([])
    expect(describeWorkFold(none, 'chat')).toBeNull()
    expect(describeWorkFailures(none)).toBeNull()
    expect(describeWorkFailures(countWorkActivities(turn))).toBe("1 step didn't work")
  })

  it('does not count a failed edit as a changed file', () => {
    const counts = countWorkActivities([activity('Edit', { file_path: '/x.ts' }, failed)])
    expect(counts.editedFiles).toBe(0)
  })
})

describe('describeExploreGroup', () => {
  const reads = [
    activity('Read', { file_path: '/s/a' }),
    activity('Grep', { pattern: 'x' }),
    activity('Read', { file_path: '/s/b' })
  ]
  it('counts distinct read files per surface', () => {
    expect(describeExploreGroup(reads, 'code')).toBe('Explored 2 files')
    expect(describeExploreGroup(reads, 'chat')).toBe('Looked through 2 files')
    expect(describeExploreGroup([activity('Grep', { pattern: 'x' })], 'code')).toBe(
      'Searched the project'
    )
  })
})

describe('describeChangedFilesLine', () => {
  it('lists file names only, then falls back to a count', () => {
    expect(describeChangedFilesLine(['/s/inc/header.php', 'style.css']).text).toBe(
      'Changed header.php and style.css'
    )
    expect(describeChangedFilesLine(['a', 'b', 'c', 'd']).text).toBe('Changed 4 files')
  })
})

describe('describeToolApproval', () => {
  it('asks a question and keeps the command behind Details in Chat mode', () => {
    expect(describeToolApproval('Edit', { file_path: '/s/header.php' }, 'chat')).toMatchObject({
      title: 'Allow Claude to change header.php?',
      detailsCollapsed: true
    })
    expect(
      describeToolApproval('Bash', { command: 'rm -rf x', description: 'Clean up' }, 'code')
    ).toEqual({
      title: 'Allow Claude to run a command?',
      caption: 'Clean up',
      code: 'rm -rf x',
      detailsCollapsed: false
    })
    expect(describeToolApproval('mcp__activecollab__create_task', {}, 'chat').title).toBe(
      'Allow Claude to use ActiveCollab?'
    )
  })
})
