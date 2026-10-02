// The surface context value: audience, the folder paths read relative to, and
// how a path opens (only where the pane belongs to a worktree with an editor).

import { useMemo } from 'react'
import { openDetectedFilePath } from '@/components/terminal-pane/terminal-file-open-routing'
import type { NativeChatSurface } from '../../../../shared/native-chat-tool-activity-types'
import type { NativeChatFileLinkContext } from './native-chat-file-link'
import type { NativeChatSurfaceContextValue } from './native-chat-surface-context'

export function useNativeChatSurfaceValue(input: {
  surface: NativeChatSurface
  workingDirectory: string | null
  fileLinkContext: NativeChatFileLinkContext | null
}): NativeChatSurfaceContextValue {
  const { surface, workingDirectory, fileLinkContext } = input
  return useMemo(
    () => ({
      surface,
      cwd: fileLinkContext?.worktreePath ?? workingDirectory,
      openFile: fileLinkContext
        ? (path: string) =>
            openDetectedFilePath(path, null, null, {
              worktreeId: fileLinkContext.worktreeId,
              worktreePath: fileLinkContext.worktreePath,
              runtimeEnvironmentId: fileLinkContext.runtimeEnvironmentId
            })
        : null
    }),
    [surface, workingDirectory, fileLinkContext]
  )
}
