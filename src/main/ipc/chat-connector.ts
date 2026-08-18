// Production wiring for the chat connector: builds the tool deps from the live
// stores, brokers the destructive-confirm IPC, and hands the stream layer its
// per-thread MCP registration hooks.

import { app, BrowserWindow, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Store } from '../persistence'
import {
  CHAT_CONNECTOR_CONFIRM_REQUEST_CHANNEL,
  CHAT_MODE_EXTERNAL_CHANGE_CHANNEL
} from '../../shared/chat-connector-types'
import {
  resolveNativeChatSessionOptionDefaults,
  updateNativeChatSessionOptionDefaults
} from '../../shared/native-chat-session-option-defaults'
import { getLearnedClaudeModels } from '../chat-mode/claude-model-registry'
import { stopChatThreadStream } from '../chat-mode/chat-thread-stream'
import { chatStore } from '../chat-mode/chat-workspace-store-singleton'
import {
  ensureChatConnectorServer,
  registerChatConnectorThread,
  revokeChatConnectorThread,
  stopChatConnectorServer
} from '../chat-connector/chat-connector-server'
import {
  respondChatConnectorConfirm,
  requestChatConnectorConfirm,
  setChatConnectorConfirmSender
} from '../chat-connector/chat-connector-confirm'
import type { ChatConnectorToolDeps } from '../chat-connector/chat-connector-tools'

function broadcastToAllWindows(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function buildChatConnectorToolDeps(store: Store): ChatConnectorToolDeps {
  return {
    getChatState: () => chatStore().getState(),
    updateWorkspace: (id, patch) => chatStore().updateWorkspace(id, patch),
    updateThread: (id, patch) => chatStore().updateThread(id, patch),
    deleteThread: (id) => chatStore().deleteThread(id),
    createWorkspace: (args) => chatStore().createWorkspace(args),
    moveThread: (id, workspaceId) => chatStore().moveThread(id, workspaceId),
    getDefaultModel: () => {
      const model = resolveNativeChatSessionOptionDefaults(
        store.getSettings().nativeChatSessionOptions,
        'claude'
      )?.model
      return typeof model === 'string' ? model : null
    },
    setDefaultModel: (modelId) => {
      store.updateSettings(
        {
          nativeChatSessionOptions: updateNativeChatSessionOptionDefaults({
            persisted: store.getSettings().nativeChatSessionOptions,
            agent: 'claude',
            modelId,
            optionId: 'model',
            value: modelId
          })
        },
        // notifyListeners routes the change to every window's settings:changed.
        { notifyListeners: true }
      )
    },
    listLearnedModels: () => getLearnedClaudeModels(),
    confirm: requestChatConnectorConfirm,
    stopThreadStream: stopChatThreadStream,
    broadcastChange: () => broadcastToAllWindows(CHAT_MODE_EXTERNAL_CHANGE_CHANNEL),
    directoryExists: (path) => {
      try {
        return isAbsolute(path) && statSync(path).isDirectory()
      } catch {
        return false
      }
    }
  }
}

export type ChatConnectorStreamMcp = {
  register: (threadId: string) => { url: string; token: string } | null
  revoke: (threadId: string, token: string) => void
}

/** Lazily starts the connector; a failed start degrades to no muster tools. */
export async function chatConnectorMcpForStream(
  store: Store
): Promise<ChatConnectorStreamMcp | null> {
  try {
    await ensureChatConnectorServer(buildChatConnectorToolDeps(store))
    return { register: registerChatConnectorThread, revoke: revokeChatConnectorThread }
  } catch {
    return null
  }
}

export function registerChatConnectorHandlers(): void {
  ipcMain.removeHandler('chatConnector:respondConfirm')
  ipcMain.handle(
    'chatConnector:respondConfirm',
    async (_event, args: { requestId?: unknown; confirmed?: unknown }): Promise<boolean> => {
      if (typeof args?.requestId !== 'string' || args.requestId === '') {
        throw new Error('chatConnector: requestId must be a non-empty string')
      }
      return respondChatConnectorConfirm(args.requestId, args.confirmed === true)
    }
  )
  setChatConnectorConfirmSender((request) =>
    broadcastToAllWindows(CHAT_CONNECTOR_CONFIRM_REQUEST_CHANNEL, request)
  )
  app.on('before-quit', () => stopChatConnectorServer())
}
