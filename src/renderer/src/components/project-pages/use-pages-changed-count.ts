import { useAppStore } from '@/store'
import { pagesScopeKeyForRepo } from '../../../../shared/project-pages-space-key'
import { useProjectPagesTree } from './use-project-pages-tree'
import { useAgentChangedPages } from './project-pages-seen'

/** How many of the open project's pages an agent changed since the user last looked. */
export function usePagesChangedCount(enabled: boolean): number {
  const scopeKey = useAppStore((s) => {
    const repoId =
      enabled && s.activeWorktreeId ? s.getKnownWorktreeById?.(s.activeWorktreeId)?.repoId : null
    return repoId ? pagesScopeKeyForRepo(repoId) : null
  })
  const { pages, loaded } = useProjectPagesTree(scopeKey)
  return useAgentChangedPages(scopeKey, pages, loaded).size
}
