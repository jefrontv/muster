import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { runWorktreeDelete } from '@/components/sidebar/delete-worktree-flow'
import {
  buildCmdJQuickActionContext,
  type CmdJQuickActionContext
} from '@/components/cmd-j/quick-action-context'

/**
 * Wires the shared Cmd+J quick-action catalog to store operations for the action
 * palette. The catalog itself stays the single source of the verbs; this only
 * supplies the callbacks it declares.
 */
export function useActionPaletteQuickActionContext(): () => CmdJQuickActionContext {
  const openModal = useAppStore((state) => state.openModal)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSitesPage = useAppStore((state) => state.openSitesPage)
  const openNewBrowserTab = useAppStore((state) => state.openNewBrowserTabInActiveWorkspace)
  const openNewMarkdownFile = useAppStore((state) => state.openNewMarkdownInActiveWorkspace)
  const openNewTerminalTab = useAppStore((state) => state.openNewTerminalTabInActiveWorkspace)

  const openCreateWorkspace = useCallback(() => {
    // Why: let the palette finish closing before the composer mounts, so Radix
    // focus teardown can't steal focus back from the new surface.
    queueMicrotask(() =>
      openModal('new-workspace-composer', { telemetrySource: 'command_palette' })
    )
  }, [openModal])

  const deleteActiveWorkspace = useCallback(() => {
    const { activeView, activeWorktreeId } = useAppStore.getState()
    if (activeView !== 'terminal' || !activeWorktreeId) {
      return
    }
    queueMicrotask(() => runWorktreeDelete(activeWorktreeId))
  }, [])

  const openAddQuickCommand = useCallback(() => {
    openSettingsTarget({ pane: 'quick-commands', repoId: null, intent: 'add-quick-command' })
    openSettingsPage()
  }, [openSettingsPage, openSettingsTarget])

  return useCallback(
    () =>
      buildCmdJQuickActionContext({
        state: useAppStore.getState(),
        activeGroupSnapshot: null,
        openNewBrowserTab,
        openNewMarkdownFile,
        openNewTerminalTab,
        openCreateWorkspace,
        deleteActiveWorkspace,
        openAddQuickCommand,
        openSitesPage
      }),
    [
      deleteActiveWorkspace,
      openAddQuickCommand,
      openCreateWorkspace,
      openNewBrowserTab,
      openNewMarkdownFile,
      openNewTerminalTab,
      openSitesPage
    ]
  )
}
