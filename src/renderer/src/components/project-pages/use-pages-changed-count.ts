import { useProjectPagesScopes } from './use-project-pages-scopes'
import { useProjectPagesTree } from './use-project-pages-tree'
import { useAgentChangedPages } from './project-pages-seen'

/** How many of the open project's pages an agent changed since the user last looked. */
export function usePagesChangedCount(enabled: boolean): number {
  const { activeKey } = useProjectPagesScopes()
  const scopeKey = enabled ? activeKey : null
  const { pages, loaded } = useProjectPagesTree(scopeKey)
  return useAgentChangedPages(scopeKey, pages, loaded).size
}
