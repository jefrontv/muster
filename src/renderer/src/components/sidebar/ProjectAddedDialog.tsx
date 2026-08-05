import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useModalData } from '@/hooks/use-modal-data'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { finishProjectAddWithDefaultCheckout } from './project-added-default-checkout'

export default function ProjectAddedDialog(): null {
  const modalData = useModalData('project-added')
  const closeModal = useAppStore((s) => s.closeModal)
  const repos = useAppStore((s) => s.repos)
  const fetchRepos = useAppStore((s) => s.fetchRepos)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const setHideDefaultBranchWorkspace = useAppStore((s) => s.setHideDefaultBranchWorkspace)
  const handoffRunRef = useRef(0)
  const pendingRepoHydrationRef = useRef<string | null>(null)

  // Why: older onboarding builds wrote `projectId`; accepting both prevents a
  // stale project-added modal from blocking follow-up contextual tours.
  const repoId = modalData?.repoId ?? modalData?.projectId ?? ''
  const repo = repos.find((candidate) => candidate.id === repoId) ?? null

  useEffect(() => {
    if (modalData === null) {
      handoffRunRef.current++
      pendingRepoHydrationRef.current = null
      return
    }
    if (!repoId) {
      closeModal()
      return
    }
    if (!repo) {
      if (pendingRepoHydrationRef.current === repoId) {
        return
      }
      pendingRepoHydrationRef.current = repoId
      let cancelled = false
      void (async () => {
        await fetchRepos()
        if (cancelled) {
          return
        }
        const hydratedRepo = useAppStore
          .getState()
          .repos.find((candidate) => candidate.id === repoId)
        if (!hydratedRepo) {
          closeModal()
        }
        pendingRepoHydrationRef.current = null
      })()
      return () => {
        cancelled = true
        pendingRepoHydrationRef.current = null
      }
    }
    pendingRepoHydrationRef.current = null
    const runId = ++handoffRunRef.current

    let cancelled = false
    if (isFolderRepo(repo)) {
      void (async () => {
        try {
          await fetchWorktrees(repoId)
        } catch {
          // Why: folder compatibility exists to clear stale modal state; close
          // even if the best-effort synthetic workspace refresh fails.
        }
        if (cancelled) {
          return
        }
        const folderWorktree = useAppStore.getState().worktreesByRepo[repoId]?.[0]
        if (folderWorktree) {
          activateAndRevealWorktree(folderWorktree.id, { sidebarRevealBehavior: 'auto' })
        }
        closeModal()
      })()
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        await fetchWorktrees(repoId)
      } catch {
        // Why: this is a compatibility handoff; fall back to whatever worktree
        // state is already loaded rather than leaving a stale modal active.
      }
      if (!cancelled && handoffRunRef.current === runId) {
        await finishProjectAddWithDefaultCheckout({
          repoId,
          source: 'project_added_compat',
          closeModal,
          setHideDefaultBranchWorkspace
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    modalData,
    closeModal,
    fetchRepos,
    fetchWorktrees,
    repo,
    repoId,
    setHideDefaultBranchWorkspace
  ])

  return null
}
