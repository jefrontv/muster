// Chat-connector contract shared across main/preload/renderer: the in-app
// confirm handshake for destructive muster-MCP tool calls, and the broadcast
// channel that tells renderers the chat store changed outside their own IPC.

export type ChatConnectorConfirmRequest = {
  requestId: string
  /** Thread whose MCP session asked for the destructive action. */
  threadId: string
  /** Human-readable description of what will be deleted. */
  summary: string
}

export const CHAT_CONNECTOR_CONFIRM_REQUEST_CHANNEL = 'chatConnector:confirmRequest'
export const CHAT_MODE_EXTERNAL_CHANGE_CHANNEL = 'chatMode:externalChange'
