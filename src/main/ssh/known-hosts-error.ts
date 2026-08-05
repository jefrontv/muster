export const SSH_HOST_KEY_MISMATCH_CODE = 'ERR_SSH_HOST_KEY_MISMATCH'

export type TrustedHostKey = {
  keyType: string
  fingerprint: string
  source: 'muster-pin' | 'user-known-hosts'
}

export type PresentedHostKey = {
  keyType: string
  fingerprint: string
}

export type SshHostKeyMismatchError = Error & {
  code: typeof SSH_HOST_KEY_MISMATCH_CODE
}

export type HostKeyRefusal = {
  reason: 'mismatch' | 'revoked'
  host: string
  port: number
  presented: PresentedHostKey
  trusted: readonly TrustedHostKey[]
  /** Where Muster's own pins live, so the message can name a concrete remedy. */
  pinFilePath?: string | null
}

/**
 * Security-worded, non-transient failure. The wording has to survive being shown as a bare
 * connection error, so it names the endpoint, both fingerprints, and the deliberate remedy.
 */
export function createHostKeyMismatchError(refusal: HostKeyRefusal): SshHostKeyMismatchError {
  const endpoint = `${refusal.host}:${refusal.port}`
  const presented = `${refusal.presented.keyType} ${refusal.presented.fingerprint}`
  const lines =
    refusal.reason === 'revoked'
      ? [
          `SSH host key verification FAILED for ${endpoint}: the presented key is marked @revoked in known_hosts.`,
          `Presented key: ${presented}`,
          `Trusted key(s): ${formatTrustedKeys(refusal.trusted)}`
        ]
      : [
          `SSH host key verification FAILED for ${endpoint}: the server presented a key Muster does not trust.`,
          `Presented key: ${presented}`,
          `Trusted key(s): ${formatTrustedKeys(refusal.trusted)}`
        ]
  lines.push(
    'Refusing to connect. A changed host key can mean a legitimate key rotation, or that someone is impersonating this server and could capture your stored password.',
    buildRemedy(refusal)
  )

  const error = new Error(lines.join('\n')) as SshHostKeyMismatchError
  error.code = SSH_HOST_KEY_MISMATCH_CODE
  return error
}

function formatTrustedKeys(trusted: readonly TrustedHostKey[]): string {
  if (trusted.length === 0) {
    return '(none recorded)'
  }
  return trusted
    .map(
      (key) =>
        `${key.keyType} ${key.fingerprint} (${key.source === 'muster-pin' ? 'Muster pin' : 'known_hosts'})`
    )
    .join(', ')
}

function buildRemedy(refusal: HostKeyRefusal): string {
  // ssh-keygen keys non-default ports as `[host]:port`, matching the known_hosts host field.
  const removalTarget = refusal.port === 22 ? refusal.host : `[${refusal.host}]:${refusal.port}`
  const verify = `Verify the new key out-of-band before trusting it. If it is genuine, run \`ssh-keygen -R '${removalTarget}'\` and reconnect with your own ssh client so it is recorded in known_hosts; Muster re-pins from known_hosts automatically.`
  return refusal.pinFilePath
    ? `${verify} Muster's own pins are stored in ${refusal.pinFilePath}.`
    : verify
}
