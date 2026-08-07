import type { TuiAgent } from '../../../../shared/types'
import type { NativeChatContextMenuActions } from './use-native-chat-context-menu'
import type { NativeChatSessionOptionDispatchCommand } from './native-chat-session-option-command-dispatch'

/** Non-PTY message transport (chat-mode's headless stream-json child). When
 *  present it replaces the PTY send path; PTY-only affordances (interrupt ESC,
 *  attachments) degrade gracefully. */
export type NativeChatTransport = {
  /** Deliver one user turn; resolves false when the stream is gone. */
  send: (text: string) => Promise<boolean>
  /** Token-streamed assistant text for the in-flight turn, or null. */
  streamingText: string | null
  /** Session-option command dispatch (e.g. "/model …") — restarts the stream
   *  with the new launch flags and resumes the provider session. */
  dispatchOption: NativeChatSessionOptionDispatchCommand
}

export type NativeChatViewProps = {
  /** The terminal tab hosting the agent. paneKey is `${tabId}:${leafId}`. */
  terminalTabId: string
  /** Specific split leaf this chat surface replaces. */
  paneKey?: string
  /** PTY bound to `paneKey`, used for composer and interactive-card sends. */
  targetPtyId?: string | null
  /** Launch-time agent hint from the TerminalTab, when Orca started one. */
  launchAgent?: TuiAgent | null
  /** Trusted title/foreground fallback for manually-started agents. */
  resolvedAgent?: TuiAgent | null
  /** Return this pane to the hosted terminal surface. */
  onSwitchToTerminal?: () => void
  /** Current xterm screen reader used to recover agent-reported session state. */
  readTerminalScreen?: () => string | null
  contextMenuActions?: Omit<NativeChatContextMenuActions, 'onPaste'>
  /** Stream transport override; when set the composer sends here, not the PTY. */
  transport?: NativeChatTransport | null
}
