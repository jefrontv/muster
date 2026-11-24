// The Pages tab: one virtual editor tab per worktree that shows the project's pages.

export type OpenProjectPagesState = {
  scopeKey: string
  pageId: string | null
  /** Bumped on every open request so asking for the page already shown still selects it. */
  request: number
}

export function buildProjectPagesTabId(worktreeId: string): string {
  return `${worktreeId}::project-pages`
}

export function projectPagesTabLabel(title: string | null): string {
  return title ? `Pages: ${title}` : 'Pages'
}
