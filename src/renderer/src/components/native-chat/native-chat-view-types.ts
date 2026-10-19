import type { TuiAgent } from '../../../../shared/types'
import type { NativeChatContextMenuActions } from './use-native-chat-context-menu'
import type { NativeChatSessionOptionDispatchCommand } from './native-chat-session-option-command-dispatch'
import type {
  ChatThreadQueuedMessage,
  ChatThreadSendMode,
  ChatThreadSendOutcome
} from '../../../../shared/chat-thread-stream-types'

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

/** Messages held behind a running turn, with the actions the queue strip offers. */
export type NativeChatMessageQueue = {
  items: ChatThreadQueuedMessage[]
  /** Stop paused the queue; held messages wait for sendNext. */
  paused: boolean
  steer: (id: string) => void
  remove: (id: string) => void
  sendNext: () => void
}

/** Non-PTY message transport (chat-mode's headless stream-json child). When
 *  present it replaces the PTY send path; PTY-only affordances (interrupt ESC,
 *  attachments) degrade gracefully. */
export type NativeChatTransport = {
  /** Deliver one user turn (optionally with image attachments as base64
   *  content blocks). While a turn runs, auto holds it in the queue and steer
   *  hands it to the running turn; resolves 'failed' when the stream is gone. */
  send: (
    text: string,
    imagePaths?: string[],
    mode?: ChatThreadSendMode
  ) => Promise<ChatThreadSendOutcome>
  /** Absent for PTY chat, which has no queue. */
  messageQueue?: NativeChatMessageQueue
  /** Start the process ahead of a send (composer focus), so the first token comes sooner. */
  prewarm?: () => void
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
  respondPermission?: (
    requestId: string,
    behavior: NativeChatPermissionBehavior,
    message?: string
  ) => void
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
}
