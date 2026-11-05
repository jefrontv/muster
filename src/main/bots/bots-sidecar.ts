// Muster Bots: starts, supervises and stops the bundled bots server as an Electron utility process.
// The contract mirrors the upstream desktop shell: OMB_DESKTOP_PARENT=1 makes the server fail closed
// until the owner token arrives over parentPort, and only the Bots partition carries that token.
import { app, utilityProcess, type UtilityProcess } from 'electron'
import { randomBytes } from 'node:crypto'
import { createWriteStream, mkdirSync, statSync, type WriteStream } from 'node:fs'
import path from 'node:path'
import { BOTS_PARTITION, type BotsSidecarStatus } from '../../shared/bots-types'
import { buildBotsAgentEnv } from './bots-agent-env'
import { readBotsCredentialEnv, writeBotsCredentialEnv } from './bots-credentials'
import { reportBotsOwnListeners } from './bots-own-listeners'
import { pickBotsPort, waitForBotsServer } from './bots-sidecar-port'
import { resolveBotsResources } from './bots-resources'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'

const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 60_000
const STOP_TIMEOUT_MS = 5_000
const LOG_TAIL_LINES = 40
export const BOTS_OWNER_HEADER = 'X-OpenMausBot-Desktop-Owner'
const CREDENTIALS_MESSAGE = 'muster:credentials'

type Running = { proc: UtilityProcess; port: number; token: string }

let status: BotsSidecarStatus = { state: 'stopped' }
let current: Running | null = null
let starting: Promise<BotsSidecarStatus> | null = null
let stopping = false
let restarts: number[] = []
let agentResolvers: CommitMessageAgentEnvironmentResolvers | undefined
const listeners = new Set<(next: BotsSidecarStatus) => void>()
const logTail: string[] = []
const LOG_FILE_MAX_BYTES = 1024 * 1024
let logFile: WriteStream | null = null

function setStatus(next: BotsSidecarStatus): void {
  status = next
  for (const listener of listeners) {
    listener(next)
  }
}

function captureLog(chunk: Buffer): void {
  logFile?.write(chunk)
  for (const line of chunk.toString('utf8').split('\n')) {
    if (line.trim()) {
      logTail.push(line)
    }
  }
  logTail.splice(0, Math.max(0, logTail.length - LOG_TAIL_LINES))
}

export function botsDataDir(): string {
  return path.join(app.getPath('userData'), 'bots')
}

export function botsLogPath(): string {
  return path.join(botsDataDir(), 'server.log')
}

// Appends across restarts so a crash log survives the automatic retry; starts over past 1 MB.
function openLogFile(): void {
  logFile?.end()
  let size = 0
  try {
    size = statSync(botsLogPath()).size
  } catch {
    // No log yet.
  }
  try {
    logFile = createWriteStream(botsLogPath(), { flags: size > LOG_FILE_MAX_BYTES ? 'w' : 'a' })
    logFile.on('error', () => {
      logFile = null
    })
    logFile.write(`--- Muster Bots started ${new Date().toISOString()} ---\n`)
  } catch {
    logFile = null
  }
}

export function setBotsAgentResolvers(resolvers: CommitMessageAgentEnvironmentResolvers): void {
  agentResolvers = resolvers
}

export function getBotsSidecarStatus(): BotsSidecarStatus {
  return status
}

export function onBotsSidecarStatus(listener: (next: BotsSidecarStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The Bots partition adds this to requests for the server's port; null while nothing runs. */
export function botsOwnerCapability(): { port: number; token: string } | null {
  return current ? { port: current.port, token: current.token } : null
}

export function startBotsSidecar(): Promise<BotsSidecarStatus> {
  if (status.state === 'running') {
    return Promise.resolve(status)
  }
  starting ??= launch().finally(() => {
    starting = null
  })
  return starting
}

async function launch(): Promise<BotsSidecarStatus> {
  const resources = resolveBotsResources()
  if (!resources) {
    setStatus({ state: 'missing' })
    return status
  }
  setStatus({ state: 'starting' })
  try {
    const dataDir = botsDataDir()
    mkdirSync(dataDir, { recursive: true })
    openLogFile()
    const port = await pickBotsPort()
    // 32 bytes as base64url is the 43-character capability the server accepts.
    const token = randomBytes(32).toString('base64url')
    const env = {
      ...(await buildBotsAgentEnv(agentResolvers)),
      ...readBotsCredentialEnv(),
      OMB_DESKTOP_PARENT: '1',
      // The server reports keys saved in its own settings, so they land in Muster's encrypted store.
      OMB_MUSTER_SECRET_SINK: '1',
      OMB_DATA_DIR: dataDir,
      OMB_PORT: String(port),
      OMB_STATIC_DIR: resources.uiDir,
      OMB_RESOURCES_PATH: resources.root,
      OMB_SKILLS_DIR: resources.skillsDir,
      OMB_APP_VERSION: app.getVersion(),
      OMB_USER_DATA: app.getPath('userData')
    }
    const proc = utilityProcess.fork(resources.entry, [], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      serviceName: 'Muster Bots'
    })
    proc.stdout?.on('data', captureLog)
    proc.stderr?.on('data', captureLog)
    proc.once('spawn', () => {
      proc.postMessage({ type: 'openmausbot:desktop-mutation-token', token })
    })
    proc.on('message', onServerMessage)
    proc.once('exit', (code) => onExit(proc, code))
    current = { proc, port, token }
    await waitForBotsServer(port, () => proc.pid)
    if (current?.proc !== proc) {
      return status
    }
    reportBotsOwnListeners((ports) => {
      try {
        proc.postMessage({ type: 'openmausbot:own-listeners', ports })
      } catch {
        // The process exited; onExit detaches this sink.
      }
    })
    // embed=muster: the UI drops its own window chrome and starts in advanced mode.
    setStatus({
      state: 'running',
      url: `http://127.0.0.1:${port}/?embed=muster`,
      partition: BOTS_PARTITION
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    current?.proc.kill()
    current = null
    setStatus({ state: 'failed', error: [reason, ...logTail.slice(-5)].join('\n') })
  }
  return status
}

function onServerMessage(message: unknown): void {
  const { type, env } = (message ?? {}) as { type?: unknown; env?: unknown }
  if (type !== CREDENTIALS_MESSAGE || !env || typeof env !== 'object') {
    return
  }
  try {
    writeBotsCredentialEnv(env as Record<string, string>)
  } catch (error) {
    console.warn('[bots] could not store a key saved in bot settings:', error)
  }
}

/**
 * The server validates the key (Composio is asked) before anything is stored, the way its own
 * settings page saves, so a save starts the server when it is stopped.
 */
export async function setBotsCredential(
  envName: string,
  configPatch: Record<string, unknown>,
  value: string
): Promise<void> {
  await startBotsSidecar()
  const running = current
  if (!running || status.state !== 'running') {
    throw new Error('The bots server is not running, so the key could not be checked.')
  }
  const response = await fetch(
    `http://127.0.0.1:${running.port}/api/config?secretStorage=external`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', [BOTS_OWNER_HEADER]: running.token },
      body: JSON.stringify(configPatch),
      signal: AbortSignal.timeout(20_000)
    }
  )
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null
    throw new Error(
      typeof body?.error === 'string' && body.error
        ? body.error
        : `The bots server refused the key (HTTP ${response.status}).`
    )
  }
  // The server reports the save too; storing here as well keeps the field current without waiting on it.
  writeBotsCredentialEnv({ [envName]: value })
}

/** The running server's settings as its own settings page reads them; null while stopped. */
export async function readBotsServerConfig(): Promise<Record<string, unknown> | null> {
  const running = current
  if (!running || status.state !== 'running') {
    return null
  }
  try {
    const response = await fetch(`http://127.0.0.1:${running.port}/api/config`, {
      headers: { [BOTS_OWNER_HEADER]: running.token },
      signal: AbortSignal.timeout(5_000)
    })
    return response.ok ? ((await response.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function onExit(proc: UtilityProcess, code: number): void {
  if (current?.proc !== proc) {
    return
  }
  current = null
  reportBotsOwnListeners(null)
  if (stopping) {
    setStatus({ state: 'stopped' })
    return
  }
  const now = Date.now()
  restarts = restarts.filter((at) => now - at < RESTART_WINDOW_MS)
  if (status.state === 'running' && restarts.length < MAX_RESTARTS) {
    restarts.push(now)
    setStatus({ state: 'stopped' })
    void startBotsSidecar()
    return
  }
  setStatus({
    state: 'failed',
    error: [`The bots server exited (code ${code}).`, ...logTail.slice(-5)].join('\n')
  })
}

export async function stopBotsSidecar(): Promise<void> {
  const running = current
  if (!running) {
    return
  }
  stopping = true
  try {
    const exited = new Promise<void>((resolve) => running.proc.once('exit', () => resolve()))
    running.proc.kill()
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS))])
  } finally {
    stopping = false
  }
}

export async function restartBotsSidecar(): Promise<BotsSidecarStatus> {
  restarts = []
  await stopBotsSidecar()
  return startBotsSidecar()
}
