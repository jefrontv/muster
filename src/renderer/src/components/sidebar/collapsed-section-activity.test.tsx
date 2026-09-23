import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeSectionActivitySummary } from './worktree-section-activity'
import { CollapsedSectionActivity } from './collapsed-section-activity'

const mocks = vi.hoisted(() => ({
  summary: { runningCount: 0, attentionCount: 0 } as WorktreeSectionActivitySummary
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({})
}))

vi.mock('./worktree-section-activity', () => ({
  selectWorktreeSectionActivity: () => mocks.summary
}))

function renderMarkup(summary: WorktreeSectionActivitySummary, count = 3): string {
  mocks.summary = summary
  return renderToStaticMarkup(
    React.createElement(CollapsedSectionActivity, { worktreeIds: ['wt-1'], count })
  )
}

describe('CollapsedSectionActivity', () => {
  beforeEach(() => {
    mocks.summary = { runningCount: 0, attentionCount: 0 }
  })

  it('shows the hidden count in the muted tabular style at rest', () => {
    const markup = renderMarkup({ runningCount: 0, attentionCount: 0 })

    expect(markup).toContain('>3</span>')
    expect(markup).toContain('tabular-nums')
    expect(markup).toContain('text-[11px]')
    expect(markup).toContain('text-worktree-sidebar-muted-foreground')
    expect(markup).toContain('3 hidden workspaces')
    expect(markup).not.toContain('data-agent-spinner')
    expect(markup).not.toContain('text-status-attention')
  })

  it('shows the working spinner when a hidden worktree is working', () => {
    const markup = renderMarkup({ runningCount: 2, attentionCount: 0 })

    expect(markup).toContain('data-agent-spinner')
    expect(markup).toContain('2 working')
  })

  it('prefers the attention glyph over the spinner', () => {
    const markup = renderMarkup({ runningCount: 1, attentionCount: 1 }, 1)

    expect(markup).toContain('text-status-attention')
    expect(markup).not.toContain('data-agent-spinner')
    expect(markup).toContain('1 hidden workspace, 1 needs input, 1 working')
  })
})
