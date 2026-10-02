// Which audience the transcript is drawn for, without threading a prop through
// every row: Chat mode (plain sentences) or Code mode (diffs, commands, paths).

import { createContext, useContext } from 'react'
import type { NativeChatSurface } from '../../../../shared/native-chat-tool-activity-types'

export type NativeChatSurfaceContextValue = {
  /** Effective surface: a Chat thread with technical details on reads as 'code'. */
  surface: NativeChatSurface
  /** Paths under this folder show relative to it. */
  cwd: string | null
  /** Opens a file in the editor; null where there is no editor to open into. */
  openFile: ((path: string) => void) | null
  /** A chat-mode thread (headless, launched by Muster), whatever its surface. */
  chatThread: boolean
  /** Model id from the session's init record, for the composer's model name. */
  reportedModel: string | null
}

const NativeChatSurfaceContext = createContext<NativeChatSurfaceContextValue>({
  surface: 'code',
  cwd: null,
  openFile: null,
  chatThread: false,
  reportedModel: null
})

export const NativeChatSurfaceProvider = NativeChatSurfaceContext.Provider

export function useNativeChatSurface(): NativeChatSurfaceContextValue {
  return useContext(NativeChatSurfaceContext)
}
