import type { TuiAgent } from '../../../../shared/types'
import type { NativeChatContextMenuActions } from './use-native-chat-context-menu'
import type { NativeChatSessionOptionDispatchCommand } from './native-chat-session-option-command-dispatch'

/** A pending can_use_tool question surfaced by the stream transport. */
export type NativeChatPermissionRequest = {
  requestId: string
  toolName: string
  /** Raw tool input JSON, rendered by the approval panel as-is. */
  input: unknown
}

/** 'allow-always' allows AND remembers the tool for the session; 'allow-all'
 *  switches the session to full access (every later request auto-approves). */
export type NativeChatPermissionBehavior = 'allow' | 'allow-always' | 'allow-all' | 'deny'

/** Non-PTY message transport (chat-mode's headless stream-json child). When
 *  present it replaces the PTY send path; PTY-only affordances (interrupt ESC,
 *  attachments) degrade gracefully. */
export type NativeChatTransport = {
  /** Deliver one user turn (optionally with image attachments as base64
   *  content blocks); resolves false when the stream is gone. */
  send: (text: string, imagePaths?: string[]) => Promise<boolean>
  /** Token-streamed assistant text for the in-flight turn, or null. */
  streamingText: string | null
  /** True once the in-flight message completed (typewriter sprints to the end). */
  streamingSealed?: boolean
  /** Current model's context window (tokens), from the CLI's result records. */
  contextWindowTokens?: number
  /** Session-option command dispatch (e.g. "/model …") — restarts the stream
   *  with the new launch flags and resumes the provider session. */
  dispatchOption: NativeChatSessionOptionDispatchCommand
  /** Interrupt the in-flight turn via the stream's control protocol; resolves
   *  false when the stream is gone. */
  interrupt: () => Promise<boolean>
  /** Pending tool-permission questions, oldest first. Absent for PTY chat. */
  permissionRequests?: NativeChatPermissionRequest[]
  /** Answer the given pending request. Absent for PTY chat. */
  respondPermission?: (requestId: string, behavior: NativeChatPermissionBehavior) => void
  /** True while the session auto-approves every tool (full access). */
  fullAccess?: boolean
  /** Turn full access on/off for the session. */
  setFullAccess?: (enabled: boolean) => void
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
  /** Persisted session identity for resumed conversations — renders history
   *  before the live hook entry reports a providerSession. */
  fallbackProviderSession?: { id: string; transcriptPath?: string | null } | null
}
