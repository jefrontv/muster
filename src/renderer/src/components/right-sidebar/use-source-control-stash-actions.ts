import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { GitBranchStash, GitStashAction } from '../../../../shared/git-stash'
import {
  readRuntimeGitBranchStash,
  runRuntimeGitStashAction,
  type RuntimeGitContext
} from '@/runtime/runtime-git-client'
import { getConnectionId } from '@/lib/connection-context'
import { translate } from '@/i18n/i18n'

export type SourceControlStashMenu = {
  canStash: boolean
  // The newest stash for the checked-out branch; undefined while it is being read.
  branchStash: GitBranchStash | undefined
  disabled: boolean
  onMenuOpen: () => void
  onStash: () => void
  onPop: () => void
}

type StashActionsParams = {
  worktreeId: string | null
  worktreePath: string | null
  settings: RuntimeGitContext['settings']
  hasChanges: boolean
  isBusy: boolean
  setBusy: (worktreeId: string, busy: boolean) => void
  refreshAfterMutation: () => void
}

export function useSourceControlStashActions({
  worktreeId,
  worktreePath,
  settings,
  hasChanges,
  isBusy,
  setBusy,
  refreshAfterMutation
}: StashActionsParams): SourceControlStashMenu {
  const [lookup, setLookup] = useState<{ worktreeId: string; stash: GitBranchStash } | null>(null)

  const contextFor = useCallback(
    (id: string, path: string): RuntimeGitContext => ({
      // Why: route by the repo OWNER host, not the focused runtime.
      settings,
      worktreeId: id,
      worktreePath: path,
      connectionId: getConnectionId(id) ?? undefined
    }),
    [settings]
  )

  // Why: read on menu open, not on every status poll; Pop only offers this branch's newest stash.
  const onMenuOpen = useCallback((): void => {
    if (!worktreeId || !worktreePath) {
      return
    }
    setLookup(null)
    void readRuntimeGitBranchStash(contextFor(worktreeId, worktreePath))
      .catch((): GitBranchStash => ({ branch: null, stash: null }))
      .then((stash) => setLookup({ worktreeId, stash }))
  }, [contextFor, worktreeId, worktreePath])

  const run = useCallback(
    async (action: GitStashAction): Promise<void> => {
      if (!worktreeId || !worktreePath || isBusy) {
        return
      }
      setBusy(worktreeId, true)
      try {
        const result = await runRuntimeGitStashAction(contextFor(worktreeId, worktreePath), action)
        if (result.conflictMessage) {
          toast.warning(
            translate(
              'auto.components.right.sidebar.source.control.stash.popConflicts',
              'Stash popped with conflicts'
            ),
            { description: result.conflictMessage }
          )
        } else if (action === 'push' && !result.changed) {
          toast.message(
            translate(
              'auto.components.right.sidebar.source.control.stash.nothingToStash',
              'No local changes to stash'
            )
          )
        }
      } catch (error) {
        toast.error(
          action === 'push'
            ? translate(
                'auto.components.right.sidebar.source.control.stash.stashFailed',
                'Stash failed'
              )
            : translate(
                'auto.components.right.sidebar.source.control.stash.popFailed',
                'Pop stash failed'
              ),
          { description: error instanceof Error ? error.message : String(error) }
        )
      } finally {
        setBusy(worktreeId, false)
        setLookup(null)
        refreshAfterMutation()
      }
    },
    [contextFor, isBusy, refreshAfterMutation, setBusy, worktreeId, worktreePath]
  )

  return {
    canStash: hasChanges,
    branchStash: lookup && lookup.worktreeId === worktreeId ? lookup.stash : undefined,
    disabled: isBusy || !worktreeId || !worktreePath,
    onMenuOpen,
    onStash: () => void run('push'),
    onPop: () => void run('pop')
  }
}
