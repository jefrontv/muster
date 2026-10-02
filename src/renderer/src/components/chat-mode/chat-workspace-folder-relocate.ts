// Re-points a workspace whose folder moved, or drops the folder from it.

import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import { dirname } from '@/lib/path'
import { useAppStore } from '@/store'

/** True once the workspace points at the picked folder; false if the picker was cancelled. */
export async function relocateChatWorkspaceFolder(
  workspace: ChatWorkspace,
  missing: string
): Promise<boolean> {
  // The picker opens beside the old location, where a moved folder usually is.
  const picked = await window.api.shell.pickDirectory({ defaultPath: dirname(missing) })
  if (!picked) {
    return false
  }
  await useAppStore.getState().updateChatWorkspace(workspace.id, {
    directories: workspace.directories.map((directory) =>
      directory === missing ? picked : directory
    )
  })
  return true
}

/** Forgets the missing folder; the workspace keeps chatting in its other folders (or home). */
export async function removeChatWorkspaceFolder(
  workspace: ChatWorkspace,
  missing: string
): Promise<void> {
  await useAppStore.getState().updateChatWorkspace(workspace.id, {
    directories: workspace.directories.filter((directory) => directory !== missing)
  })
}
