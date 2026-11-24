import { describe, expect, it } from 'vitest'
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import { draftBelongsToScope, type CommentDraftScope } from './comment-draft-project-filter'

const base: BotsCommentDraft = {
  id: 'd',
  number: 1,
  botId: 'b',
  botName: 'Bob',
  threadId: '',
  projectId: 7,
  taskId: 1,
  bodyHtml: '',
  bodyText: '',
  attachments: [],
  status: 'waiting',
  version: 1,
  editedBy: 'bot',
  amendNote: null,
  canUndo: false,
  queuedAt: 1,
  createdAt: 1,
  updatedAt: 1
}
const scope: CommentDraftScope = { worktreeId: 'wt-1', worktreePath: '/Sites/acme', projectId: 7 }

describe('draftBelongsToScope', () => {
  it('keeps an agent draft from the same workspace', () => {
    const draft = {
      ...base,
      projectId: 99,
      agentSource: { agent: 'claude', cwd: '/elsewhere', worktreeId: 'wt-1' }
    }
    expect(draftBelongsToScope(draft, scope)).toBe(true)
  })

  it('keeps an agent draft whose folder sits inside the workspace', () => {
    const draft = {
      ...base,
      projectId: 99,
      agentSource: { agent: 'claude', cwd: '/Sites/acme/wp-content' }
    }
    expect(draftBelongsToScope(draft, scope)).toBe(true)
  })

  it('drops an agent draft from a sibling folder with a shared prefix', () => {
    const draft = {
      ...base,
      projectId: 99,
      agentSource: { agent: 'claude', cwd: '/Sites/acme-old' }
    }
    expect(draftBelongsToScope(draft, scope)).toBe(false)
  })

  it('matches bot drafts by the bound ActiveCollab project', () => {
    expect(draftBelongsToScope(base, scope)).toBe(true)
    expect(draftBelongsToScope({ ...base, projectId: 8 }, scope)).toBe(false)
    expect(draftBelongsToScope(base, { ...scope, projectId: null })).toBe(false)
  })
})
