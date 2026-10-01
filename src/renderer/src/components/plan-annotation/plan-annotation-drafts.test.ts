import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, draftKey, loadDraft, saveDraft } from './plan-annotation-drafts'
import type { DraftNote } from './plan-annotation-notes'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value)
  }
}

const note: DraftNote = {
  id: '1-a',
  kind: 'comment',
  quote: 'q',
  startLine: 1,
  endLine: 1,
  body: 'b'
}

const key = draftKey({ planPath: '/plans/p.md', requestId: 'r1' })

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: createMemoryStorage() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('plan review drafts', () => {
  it('restores notes and edits made against the same plan', () => {
    const edits = { source: 'plan v1', baseline: 'plan v1\n', content: 'plan v1 edited\n' }
    saveDraft(key, { notes: [note], edits })
    expect(loadDraft(key, 'plan v1')).toEqual({ notes: [note], edits })
  })

  it('drops edits once the agent has sent a different plan, but keeps the notes', () => {
    saveDraft(key, {
      notes: [note],
      edits: { source: 'plan v1', baseline: 'plan v1', content: 'edited' }
    })
    expect(loadDraft(key, 'plan v2')).toEqual({ notes: [note], edits: null })
  })

  it('reads drafts saved as a bare note list', () => {
    window.localStorage.setItem(key, JSON.stringify([note]))
    expect(loadDraft(key, 'anything')).toEqual({ notes: [note], edits: null })
  })

  it('removes the entry when nothing is left to recover', () => {
    saveDraft(key, { notes: [note], edits: null })
    saveDraft(key, { notes: [], edits: null })
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('treats corrupt storage as an empty draft', () => {
    window.localStorage.setItem(key, '{ not json')
    expect(loadDraft(key, 'plan')).toEqual({ notes: [], edits: null })
    clearDraft(key)
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('keys inline plans by request id', () => {
    expect(draftKey({ planPath: null, requestId: 'r9' })).toBe('muster.plan-annotation.draft.r9')
  })
})
