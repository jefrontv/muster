import { describe, expect, it } from 'vitest'
import { getEditorTabTooltipDetails } from './editor-tab-tooltip-details'

describe('getEditorTabTooltipDetails', () => {
  it('names the git status and pending states', () => {
    expect(
      getEditorTabTooltipDetails({
        status: 'modified',
        externalMutation: undefined,
        isDirty: true,
        attention: 'review'
      })
    ).toEqual(['Modified', 'Unsaved changes', 'Needs review'])
  })

  it('prefers the on-disk mutation over git status', () => {
    expect(
      getEditorTabTooltipDetails({
        status: 'modified',
        externalMutation: 'deleted',
        isDirty: false,
        attention: undefined
      })
    ).toEqual(['Deleted on disk'])
  })

  it('returns nothing for a clean file in a folder workspace', () => {
    expect(
      getEditorTabTooltipDetails({
        status: null,
        externalMutation: undefined,
        isDirty: false,
        attention: undefined
      })
    ).toEqual([])
  })
})
