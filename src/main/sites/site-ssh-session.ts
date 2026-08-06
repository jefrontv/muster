// The SSH surface every site pipeline runs on, implemented over Orca's SshConnection.
//
// ocsites opened one paramiko client per run and reused it for every exec and SFTP transfer.
// This does the same over ssh2: one connection owned by the run, channels opened per operation,
// and a session object narrow enough that pipelines can be tested against a fake.

import { randomUUID } from 'node:crypto'
import type { ClientChannel, SFTPWrapper } from 'ssh2'
import type { SshTarget } from '../../shared/ssh-types'
import { fastGetViaSftp } from '../providers/ssh-filesystem-provider-sftp'
import { SshConnection } from '../ssh/ssh-connection'
import { uploadFile } from '../ssh/sftp-upload'
import { consumeSiteExecChannel } from './site-ssh-exec'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteExecOptions,
  type SiteExecResult,
  type SiteRunConfig,
  type SiteSshSession
} from './pipeline-contract'

export const SITE_SSH_CONNECT_STEP = 'ssh-connect'

/** Credentials files written to the server must never be world-readable, even briefly. */
const SECURE_REMOTE_FILE_MODE = 0o600

/**
 * The slice of SshConnection a session needs. Structural so the real connection satisfies it and
 * a test can drive the session with a fake channel/SFTP pair, no sockets involved.
 */
export type SiteSshTransport = {
  exec: (command: string, options?: { signal?: AbortSignal }) => Promise<ClientChannel>
  sftp: (signal?: AbortSignal) => Promise<SFTPWrapper>
  disconnect: () => Promise<void>
}

/** Connects to the environment with its stored password and returns a session bound to `signal`. */
export async function createSiteSshSession(
  config: SiteRunConfig,
  signal: AbortSignal
): Promise<SiteSshSession> {
  throwIfCancelled(signal)
  const { hostname, username } = config.environment
  if (!hostname.trim() || !username.trim()) {
    throw new SiteRunStepError(
      SITE_SSH_CONNECT_STEP,
      `Environment "${config.environmentName}" is missing an SSH hostname or username.`
    )
  }
  const connection = new SshConnection(buildSiteSshTarget(config), { onStateChange: () => {} })
  // Why: a run has no window to prompt from, so the decrypted password must be in hand before
  // connect() — SshConnection only asks onCredentialRequest when nothing is cached.
  if (config.sshPassword) {
    connection.useStoredPassword(config.sshPassword)
  }
  await connectWithCancellation(connection, config, signal)
  return createSessionOverTransport(connection, signal)
}

/** Builds the session surface over an already-connected transport. */
export function createSessionOverTransport(
  transport: SiteSshTransport,
  signal: AbortSignal
): SiteSshSession {
  const exec = async (command: string, options?: SiteExecOptions): Promise<SiteExecResult> => {
    throwIfCancelled(signal)
    const channel = await rejectAsCancelled(signal, () => transport.exec(command, { signal }))
    return consumeSiteExecChannel(channel, command, signal, options)
  }
  return {
    exec,
    download: (remotePath, localPath, onProgress) =>
      transfer(transport, signal, (sftp) =>
        fastGetViaSftp(sftp, remotePath, localPath, { signal, onProgress })
      ),
    upload: (localPath, remotePath, onProgress) =>
      transfer(transport, signal, (sftp) =>
        uploadFile(sftp, localPath, remotePath, { onProgress })
      ),
    writeSecureRemoteFile: (remotePath, contents) =>
      transfer(transport, signal, (sftp) => writeSecureFile(sftp, remotePath, contents)),
    // Why: a 0600 credentials file must be removed even when the run was cancelled, so cleanup
    // deliberately runs on an unsignalled channel instead of failing fast like every other call.
    removeRemoteFile: async (remotePath) => {
      try {
        const sftp = await transport.sftp()
        try {
          const { promise, resolve } = Promise.withResolvers<void>()
          sftp.unlink(remotePath, () => resolve())
          await promise
        } finally {
          sftp.end()
        }
      } catch {
        // Best effort by contract: the caller is already unwinding.
      }
    },
    close: () => transport.disconnect()
  }
}

function buildSiteSshTarget(config: SiteRunConfig): SshTarget {
  const { hostname, username } = config.environment
  return {
    // Why: a unique id per run keeps site connections out of the SSH-hosts pool, so ending one
    // run never tears down another run's connection to the same server.
    id: `site-run:${config.site.id}:${config.environmentName}:${randomUUID()}`,
    label: hostname,
    host: hostname,
    port: 22,
    username,
    // Why 'none' when a password is stored: ssh2 offers every key the user's agent holds BEFORE
    // falling back to the password, and a server's MaxAuthTries (commonly 6) then disconnects
    // mid-handshake — an intermittent "handshake dropped" that depends on how many keys the
    // agent happens to carry. A site environment authenticates with its own stored credential, so
    // the keyring is noise here. Password-less environments keep the agent: it is all they have.
    ...(config.sshPassword ? { identityAgent: 'none' } : {}),
    source: 'manual'
  }
}

async function connectWithCancellation(
  connection: SshConnection,
  config: SiteRunConfig,
  signal: AbortSignal
): Promise<void> {
  // Why: SshConnection.connect() retries transient failures for tens of seconds; without this the
  // run keeps burning that budget after the user has already cancelled.
  const onAbort = (): void => void connection.disconnect().catch(() => {})
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    await connection.connect()
  } catch (error) {
    throwIfCancelled(signal)
    const { hostname, username } = config.environment
    const detail = error instanceof Error ? error.message : String(error)
    // Defence in depth: nothing derived from a credential may reach the run log.
    const safeDetail = config.sshPassword ? detail.split(config.sshPassword).join('***') : detail
    throw new SiteRunStepError(
      SITE_SSH_CONNECT_STEP,
      `Could not connect to ${username}@${hostname}: ${safeDetail}`
    )
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
  if (signal.aborted) {
    await connection.disconnect()
    throw new SiteRunCancelledError()
  }
}

/**
 * Opens an SFTP channel for one operation. Ending the channel on abort is what actually stops an
 * in-flight fastGet/fastPut — rejecting the caller alone leaves the transfer writing.
 */
async function transfer<T>(
  transport: SiteSshTransport,
  signal: AbortSignal,
  run: (sftp: SFTPWrapper) => Promise<T>
): Promise<T> {
  throwIfCancelled(signal)
  const sftp = await rejectAsCancelled(signal, () => transport.sftp(signal))
  let ended = false
  const end = (): void => {
    if (!ended) {
      ended = true
      sftp.end()
    }
  }
  signal.addEventListener('abort', end, { once: true })
  try {
    return await rejectAsCancelled(signal, () => run(sftp))
  } finally {
    signal.removeEventListener('abort', end)
    end()
  }
}

function writeSecureFile(sftp: SFTPWrapper, remotePath: string, contents: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  sftp.writeFile(remotePath, contents, { mode: SECURE_REMOTE_FILE_MODE, flag: 'w' }, (error) => {
    if (error) {
      reject(error)
      return
    }
    // Why: 'w' truncates an existing file but leaves its old permissions, so ocsites chmods
    // after writing (deploy/backup.py:591). Without it a stale 0644 file leaks the DB password.
    sftp.chmod(remotePath, SECURE_REMOTE_FILE_MODE, (chmodError) => {
      if (chmodError) {
        reject(chmodError)
      } else {
        resolve()
      }
    })
  })
  return promise
}

/** Normalises a torn-down transport's stream error into the run's cancellation error. */
async function rejectAsCancelled<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throwIfCancelled(signal)
    throw error
  }
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new SiteRunCancelledError()
  }
}
