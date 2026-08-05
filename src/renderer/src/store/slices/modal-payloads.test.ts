import { describe, expect, it, vi } from 'vitest'
import { getModalData, type ModalState } from './modal-payloads'

describe('getModalData', () => {
  it('narrows to the payload declared for the active modal', () => {
    const onResolve = vi.fn()
    const state: ModalState = {
      activeModal: 'confirm-orca-yaml-hooks',
      modalData: {
        repoId: 'repo-1',
        repoName: 'orca',
        scriptKind: 'vmRecipe',
        scriptContent: 'echo hi',
        contentHash: 'hash-1',
        previouslyApproved: true,
        onResolve
      }
    }

    const hooks = getModalData(state, 'confirm-orca-yaml-hooks')

    // Field access below compiles only because the id narrowed the payload.
    expect(hooks?.repoName).toBe('orca')
    expect(hooks?.scriptKind).toBe('vmRecipe')
    hooks?.onResolve('skip')
    expect(onResolve).toHaveBeenCalledWith('skip')
  })

  it('returns null for every modal other than the active one', () => {
    const state: ModalState = {
      activeModal: 'delete-worktree',
      modalData: { worktreeIds: ['w1', 'w2'], allowSkipConfirm: false }
    }

    expect(getModalData(state, 'delete-worktree')?.worktreeIds).toEqual(['w1', 'w2'])
    expect(getModalData(state, 'confirm-orca-yaml-hooks')).toBeNull()
    expect(getModalData(state, 'quick-open')).toBeNull()
  })

  // Why: dialogs gate visibility on `!== null`, so an active payload-less modal
  // must stay distinguishable from an inactive one — both hold `undefined`.
  it('separates an active modal with no payload from an inactive modal', () => {
    const state: ModalState = { activeModal: 'quick-open', modalData: undefined }

    expect(getModalData(state, 'quick-open')).toBeUndefined()
    expect(getModalData(state, 'delete-worktree')).toBeNull()
  })

  it('reports no active payload once the modal closes', () => {
    const closed: ModalState = { activeModal: 'none', modalData: undefined }

    expect(getModalData(closed, 'quick-open')).toBeNull()
    expect(getModalData(closed, 'delete-worktree')).toBeNull()
  })
})
