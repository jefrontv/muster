import { describe, expect, it } from 'vitest'
import { projectPagesTabLabel } from '@/components/project-pages/project-pages-tab'
import { planReviewTabLabel } from '@/components/plan-annotation/plan-review-tab'
import type { OpenFile } from '@/store/slices/editor'
import { getTabStripEditorKind, getTabStripEditorLabel, hasFilePathLabel } from './tab-strip-labels'

function file(overrides: Partial<OpenFile>): OpenFile {
  return {
    id: 'f',
    filePath: '/repo/docs/README.md',
    relativePath: 'docs/README.md',
    worktreeId: 'wt',
    language: 'markdown',
    isDirty: false,
    mode: 'edit',
    ...overrides
  } as OpenFile
}

describe('getTabStripEditorLabel', () => {
  it('drops the Pages prefix but keeps the bare Pages label', () => {
    expect(
      getTabStripEditorLabel(
        file({ mode: 'project-pages', relativePath: projectPagesTabLabel('Home') })
      )
    ).toBe('Home')
    expect(
      getTabStripEditorLabel(
        file({ mode: 'project-pages', relativePath: projectPagesTabLabel(null) })
      )
    ).toBe('Pages')
  })

  it('drops the plan review prefix', () => {
    expect(
      getTabStripEditorLabel(
        file({ mode: 'plan-review', relativePath: planReviewTabLabel('Tab rework') })
      )
    ).toBe('Tab rework')
  })

  it('drops the markdown preview suffix', () => {
    expect(getTabStripEditorLabel(file({ mode: 'markdown-preview' }))).toBe('README.md')
  })

  it('keeps the editor label for files and diffs', () => {
    expect(getTabStripEditorLabel(file({}))).toBe('README.md')
    expect(getTabStripEditorLabel(file({ mode: 'diff', diffSource: 'staged' }))).toBe(
      'README.md (staged diff)'
    )
  })
})

describe('getTabStripEditorKind', () => {
  it('names only the kinds the label dropped', () => {
    expect(getTabStripEditorKind({ mode: 'project-pages' })).toBe('Pages')
    expect(getTabStripEditorKind({ mode: 'plan-review' })).toBe('Plan review')
    expect(getTabStripEditorKind({ mode: 'markdown-preview' })).toBe('Markdown preview')
    expect(getTabStripEditorKind({ mode: 'edit' })).toBeNull()
  })
})

describe('hasFilePathLabel', () => {
  it('accepts files and single-file diffs only', () => {
    expect(hasFilePathLabel({ mode: 'edit' })).toBe(true)
    expect(hasFilePathLabel({ mode: 'diff', diffSource: 'unstaged' })).toBe(true)
    expect(hasFilePathLabel({ mode: 'diff', diffSource: 'combined-all' })).toBe(false)
    expect(hasFilePathLabel({ mode: 'project-pages' })).toBe(false)
  })
})
