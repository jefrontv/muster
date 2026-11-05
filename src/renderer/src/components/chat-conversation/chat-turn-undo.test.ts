import { describe, expect, it } from 'vitest'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { parseRewindPreview, turnUndoTarget } from './chat-turn-undo'

const edit: ChatEngineItem = {
  kind: 'tool',
  id: 'e',
  name: 'Edit',
  input: { file_path: '/a.ts' },
  status: 'done'
}
const read: ChatEngineItem = { kind: 'tool', id: 'r', name: 'Read', input: {}, status: 'done' }
const user = (uuid: string | null) => ({
  text: 'fix it',
  imageCount: 0,
  sentAt: 1,
  delivery: 'delivered' as const,
  uuid
})

describe('turnUndoTarget', () => {
  it('offers undo only for a settled turn that edited files', () => {
    expect(turnUndoTarget({ status: 'done', user: user('u1'), items: [edit] })).toEqual({
      userMessageId: 'u1'
    })
    expect(turnUndoTarget({ status: 'done', user: user('u1'), items: [read] })).toBeNull()
    expect(turnUndoTarget({ status: 'running', user: user('u1'), items: [edit] })).toBeNull()
  })

  it('finds edits inside a subagent and has no target without a uuid', () => {
    const agent: ChatEngineItem = {
      kind: 'agent',
      id: 'g',
      description: 'Fix',
      subagentType: null,
      status: 'done',
      summary: null,
      items: [edit]
    }
    expect(turnUndoTarget({ status: 'done', user: user(null), items: [agent] })).toEqual({
      userMessageId: null
    })
  })
})

describe('parseRewindPreview', () => {
  it('reads files and a refusal', () => {
    expect(parseRewindPreview({ canRewind: true, filesChanged: ['/a.ts', 3] })).toEqual({
      canRewind: true,
      files: ['/a.ts'],
      error: null
    })
    expect(parseRewindPreview({ canRewind: false, error: 'No checkpoint' })).toMatchObject({
      canRewind: false,
      error: 'No checkpoint'
    })
    expect(parseRewindPreview(null).canRewind).toBe(true)
  })
})
