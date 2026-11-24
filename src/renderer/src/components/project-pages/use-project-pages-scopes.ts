// Projects that can hold pages, and which one the open workspace belongs to.
import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { pagesScopeKeyForRepo } from '../../../../shared/project-pages-space-key'

export type PagesScopeOption = { key: string; label: string }

export function useProjectPagesScopes(): { options: PagesScopeOption[]; activeKey: string | null } {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) =>
    s.activeWorktreeId ? (s.getKnownWorktreeById(s.activeWorktreeId)?.repoId ?? null) : null
  )
  return useMemo(() => {
    const options = repos
      .map((repo) => ({ key: pagesScopeKeyForRepo(repo.id), label: repo.displayName }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return { options, activeKey: activeRepoId ? pagesScopeKeyForRepo(activeRepoId) : null }
  }, [repos, activeRepoId])
}
