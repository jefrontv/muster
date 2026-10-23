import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'

/** Selects the site's folder as a project and switches to its terminal; false when it could not. */
export async function openSiteProject(path: string): Promise<boolean> {
  // The setup clone registers the repo in main; the renderer only sees it after a refetch.
  await useAppStore.getState().fetchRepos()
  const existing = useAppStore.getState().repos.find((entry) => entry.path === path)
  const repo = existing ?? (await useAppStore.getState().addRepoPath(path))
  if (!repo) {
    // addRepoPath has already said why (toast or the non-git folder prompt).
    return false
  }
  await useAppStore.getState().fetchWorktrees(repo.id)
  const worktrees = useAppStore.getState().worktreesByRepo[repo.id] ?? []
  const target =
    worktrees.find((entry) => entry.path === path) ??
    worktrees.find((entry) => entry.isMainWorktree) ??
    worktrees[0]
  if (!target || !activateAndRevealWorktree(target.id, { sidebarRevealBehavior: 'auto' })) {
    toast.error(
      translate(
        'auto.components.sites.SiteSetupRun.openProjectFailed',
        'Could not open the project'
      ),
      { description: path }
    )
    return false
  }
  return true
}

/** Closes the caller's surface first so the New site dialog is not stacked under it. */
export function openNewSiteSetup(closeCaller: () => void): void {
  closeCaller()
  useAppStore.getState().setNewSiteDialogOpen(true)
}
