import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorktreeListScrollShadows } from './worktree-list-scroll-shadows'

describe('WorktreeListScrollShadows', () => {
  it('shows only the edge that has more rows past it', () => {
    const markup = renderToStaticMarkup(
      <WorktreeListScrollShadows edges={{ top: false, bottom: true }} />
    )
    expect(markup).toContain('data-worktree-list-edge-shadow="top"')
    expect(markup).toMatch(/worktree-list-edge-shadow top-0"/)
    expect(markup).toMatch(/bottom-0 is-visible"/)
  })
})
