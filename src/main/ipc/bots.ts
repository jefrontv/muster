// IPC for the Bots tab: start the bots server on first open, report its state, restart on request.
import { BrowserWindow, ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  botsDataDir,
  getBotsSidecarStatus,
  onBotsSidecarStatus,
  readBotsServerConfig,
  restartBotsSidecar,
  setBotsAgentResolvers,
  setBotsCredential,
  startBotsSidecar
} from '../bots/bots-sidecar'
import { botsCredentialHint, COMPOSIO_API_KEY_ENV } from '../bots/bots-credentials'
import type { BotsKeyStatus, BotsKeySaveResult } from '../../shared/bots-types'
import { installBotsSession } from '../bots/bots-session'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'

const CHANNELS = [
  'bots:start',
  'bots:status',
  'bots:restart',
  'bots:composioKeyStatus',
  'bots:setComposioKey'
] as const

export function registerBotsHandlers(agentEnv?: CommitMessageAgentEnvironmentResolvers): void {
  if (agentEnv) {
    setBotsAgentResolvers(agentEnv)
  }
  installBotsSession()
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  // Why lazy: the server and its agent processes cost memory, so nothing starts until the tab opens.
  ipcMain.handle('bots:start', () => startBotsSidecar())
  ipcMain.handle('bots:status', () => getBotsSidecarStatus())
  ipcMain.handle('bots:restart', () => restartBotsSidecar())
  ipcMain.handle('bots:composioKeyStatus', () => composioKeyStatus())
  ipcMain.handle(
    'bots:setComposioKey',
    async (_event, value: unknown): Promise<BotsKeySaveResult> => {
      const key = typeof value === 'string' ? value.trim() : ''
      try {
        // Same patch the bots settings page sends, so both fields edit one key.
        await setBotsCredential(COMPOSIO_API_KEY_ENV, { composio: { apiKey: key } }, key)
        return { ok: true, status: await composioKeyStatus() }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          status: await composioKeyStatus()
        }
      }
    }
  )
  onBotsSidecarStatus((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('bots:statusChanged', status)
      }
    }
  })
}

/** Muster's stored key, else the one the server already holds (saved before Muster kept keys). */
async function composioKeyStatus(): Promise<BotsKeyStatus> {
  const stored = botsCredentialHint(COMPOSIO_API_KEY_ENV)
  if (stored) {
    return { saved: true, hint: stored }
  }
  const server = (await readBotsServerConfig())?.composio as
    | { configured?: unknown; last4?: unknown }
    | undefined
  if (server) {
    return server.configured === true
      ? { saved: true, hint: typeof server.last4 === 'string' ? server.last4 : null }
      : { saved: false, hint: null }
  }
  const onDisk = serverConfigFileKey()
  return onDisk ? { saved: true, hint: onDisk.slice(-4) } : { saved: false, hint: null }
}

/** The server's own config file, read while it is stopped; only the hint leaves this process. */
function serverConfigFileKey(): string | null {
  try {
    const config = JSON.parse(readFileSync(path.join(botsDataDir(), 'config.json'), 'utf8')) as {
      composio?: { apiKey?: unknown }
    }
    const key = config.composio?.apiKey
    return typeof key === 'string' && key.trim() ? key.trim() : null
  } catch {
    return null
  }
}
