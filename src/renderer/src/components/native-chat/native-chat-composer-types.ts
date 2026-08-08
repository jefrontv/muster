import type { AgentType } from '../../../../shared/agent-status-types'
import type { NativeChatSessionOptionDispatchCommand } from './native-chat-session-option-command-dispatch'
import type {
  NativeChatPermissionBehavior,
  NativeChatPermissionRequest
} from './native-chat-view-types'

export type NativeChatComposerProps = {
  /** Tab hosting the agent; used to resolve the live ptyId + runtime settings. */
  terminalTabId: string
  /** Stable split-leaf identity; unlike a PTY id, this survives reconnects. */
  paneKey: string
  /** Specific split-pane PTY this chat view owns. */
  targetPtyId: string | null
  agent: AgentType
  /** Stream-transport send; when set, composer text bypasses the PTY entirely. */
  transportSend?: (text: string) => Promise<boolean>
  /** Stream-transport session-option dispatch (relaunch with new launch flags). */
  transportDispatchOption?: NativeChatSessionOptionDispatchCommand
  /** Stream-transport interrupt; Stop sends this instead of a PTY ESC byte. */
  transportInterrupt?: () => Promise<boolean>
  /** Guard desktop sends while a mobile client owns the terminal input lease. */
  canSend?: boolean
  /** True while the hosted TUI reports an in-flight turn; swaps Send to Stop. */
  isWorking?: boolean
  /** Interrupt the hosted agent, usually by sending ESC into the PTY. */
  onStop?: () => void
  /** Render an optimistic echo until the real transcript turn lands. */
  onOptimisticSend?: (text: string, imagePaths?: string[]) => string | undefined
  /** Remove an optimistic echo when its delayed submit is canceled. */
  onOptimisticSendCanceled?: (pendingId: string) => void
  /** Record a dispatched slash command that does not create a chat turn. */
  onSlashCommand?: (command: string) => void
  /** Picker-only agent commands continue in the hosted TUI after dispatch. */
  onSwitchToTerminal?: () => void
  /** Reads the hosted TUI's current rendered screen when chat is entered. */
  readTerminalScreen?: () => string | null
  /** Oldest pending tool-permission request (stream transport only); while set
   *  the editor is disabled and the approval actions replace the footer. */
  permissionRequest?: NativeChatPermissionRequest | null
  /** Total queued permission requests, for the "1/N" counter. */
  permissionRequestCount?: number
  /** Answer a pending permission request. */
  onRespondPermission?: (requestId: string, behavior: NativeChatPermissionBehavior) => void
  /** Enables the context-window donut; off for runtime-owned panes whose
   *  transcript is not on the local disk. */
  contextUsageEnabled?: boolean
  /** Current model's context window for the meter; defaults to 200k. */
  contextMaxTokens?: number
  /** Full-access session state + toggle (stream transport only). */
  fullAccess?: boolean
  onSetFullAccess?: (enabled: boolean) => void
}

export type NativeChatComposerHandle = {
  focus: () => boolean
  insertTypedText: (text: string) => boolean
  /** Routes pane-level paste events back to the composer field. */
  handlePasteEvent: (event: {
    clipboardData: DataTransfer | null
    preventDefault: () => void
    defaultPrevented: boolean
  }) => void
  /** Pastes clipboard content when no DOM paste event is available. */
  pasteFromClipboard: () => void
}
