import { useCallback } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import {
  promptForSetupGuideProject,
  useSetupTargetWorktree
} from './FeatureWallSetupWorkflowActions'

export function BrowserAction(props: { done: boolean }): React.JSX.Element | null {
  const targetWorktree = useSetupTargetWorktree()
  const openModal = useAppStore((s) => s.openModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const openNewBrowserTabInActiveWorkspace = useAppStore(
    (s) => s.openNewBrowserTabInActiveWorkspace
  )

  const handleTryIt = useCallback(() => {
    if (!targetWorktree) {
      promptForSetupGuideProject(openModal)
      return
    }
    closeModal()
    activateAndRevealWorktree(targetWorktree.id)
    const state = useAppStore.getState()
    // Why: open the browser into the worktree's active group so it lands beside
    // the user's current work rather than spawning a detached surface.
    const groupId =
      state.activeGroupIdByWorktree[targetWorktree.id] ??
      state.groupsByWorktree[targetWorktree.id]?.[0]?.id
    if (groupId) {
      void openNewBrowserTabInActiveWorkspace(groupId)
    } else {
      toast.warning(
        translate(
          'auto.components.feature.wall.FeatureWallBrowserAction.5022c43a88',
          'Browser could not open'
        ),
        {
          description: translate(
            'auto.components.feature.wall.FeatureWallBrowserAction.c9eb68b474',
            'No workspace group is available for this worktree yet.'
          )
        }
      )
    }
  }, [closeModal, openModal, openNewBrowserTabInActiveWorkspace, targetWorktree])

  // Why: this step completes by viewing a real page, so once done there is
  // nothing left to offer here.
  if (props.done) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button type="button" size="sm" className="w-fit gap-2" onClick={handleTryIt}>
        <ArrowUpRight className="size-3.5" />
        {translate(
          'auto.components.feature.wall.FeatureWallBrowserAction.c9728107c5',
          'Try it out'
        )}
      </Button>
    </div>
  )
}
