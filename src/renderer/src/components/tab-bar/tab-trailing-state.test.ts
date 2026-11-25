import { describe, expect, it } from 'vitest'
import { resolveTabTrailingState } from './tab-trailing-state'

describe('resolveTabTrailingState', () => {
  it('pins replace the close button entirely', () => {
    expect(resolveTabTrailingState({ isActive: true, isPinned: true, isDirty: true })).toEqual({
      indicator: 'pinned',
      close: 'never'
    })
  })

  it('shows close always on the active tab and on hover elsewhere', () => {
    expect(resolveTabTrailingState({ isActive: true, isPinned: false })).toEqual({
      indicator: null,
      close: 'always'
    })
    expect(resolveTabTrailingState({ isActive: false, isPinned: false })).toEqual({
      indicator: null,
      close: 'hover'
    })
  })

  it('ranks review above dirty above changed, with close revealed on hover', () => {
    expect(
      resolveTabTrailingState({
        isActive: true,
        isPinned: false,
        isDirty: true,
        attention: 'review'
      })
    ).toEqual({ indicator: 'review', close: 'hover' })
    expect(
      resolveTabTrailingState({
        isActive: false,
        isPinned: false,
        isDirty: true,
        attention: 'changed'
      })
    ).toEqual({ indicator: 'dirty', close: 'hover' })
    expect(
      resolveTabTrailingState({ isActive: false, isPinned: false, attention: 'changed' })
    ).toEqual({ indicator: 'changed', close: 'hover' })
  })
})
