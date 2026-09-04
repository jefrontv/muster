// agent-local's half of the certificate contract, shaped to the same LocalWpCertStatus the UI
// already renders.
//
// `trusted` is read from the OS on every call rather than remembered, so a certificate the user
// revoked in Keychain Access reports as untrusted instead of as whatever it was when it was issued.

import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'
import { streamCommand } from '../lib/stream-command'
import {
  AGENT_LOCAL_READ_TIMEOUT_MS,
  AGENT_LOCAL_START_TIMEOUT_MS,
  createAgentLocalHost,
  describeAgentLocalResponse,
  isAgentLocalSupported,
  requestWithDaemon,
  type AgentLocalHost,
  type AgentLocalResponse
} from './agent-local-host'

/** Long enough for the user to read the password dialog and type; osascript itself has no timeout. */
const AGENT_LOCAL_TRUST_PROMPT_TIMEOUT_MS = 120_000

type AgentLocalCertOptions = {
  host?: AgentLocalHost
  /** The interactive CLI, injectable for tests. Defaults to `agent-local cert DOMAIN --trust`. */
  runTrustCli?: (domain: string) => Promise<{ code: number; stderr: string; stdout: string }>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' ? value : ''
}

export async function agentLocalCertStatus(
  domain: string,
  options: AgentLocalCertOptions = {}
): Promise<LocalWpCertStatus> {
  const host = options.host ?? createAgentLocalHost()
  const response = await requestWithDaemon(
    host,
    'GET',
    `/certs/${encodeURIComponent(domain)}`,
    undefined,
    { timeoutMs: AGENT_LOCAL_READ_TIMEOUT_MS }
  )
  const data = asRecord(response.data)
  const exists = response.ok && data?.exists === true
  const trusted = response.ok && data?.trusted === true
  return {
    supported: isAgentLocalSupported(host),
    domain,
    certPath: readString(data, 'cert_path'),
    exists,
    trusted,
    reason: certReason({ ok: response.ok, exists, trusted, response })
  }
}

function certReason(args: {
  ok: boolean
  exists: boolean
  trusted: boolean
  response: AgentLocalResponse
}): string {
  if (!args.ok) {
    return describeAgentLocalResponse(args.response)
  }
  if (!args.exists) {
    return 'No certificate yet. Trusting it issues one.'
  }
  return args.trusted ? '' : 'The certificate exists but is not trusted in the System keychain.'
}

const defaultTrustCli: NonNullable<AgentLocalCertOptions['runTrustCli']> = (domain) =>
  streamCommand('agent-local', ['cert', domain, '--trust'], {
    timeoutMs: AGENT_LOCAL_TRUST_PROMPT_TIMEOUT_MS
  })

/**
 * Trust a domain's certificate: the daemon first, then the CLI.
 *
 * The daemon's trust endpoint is deliberately non-interactive - it only succeeds once the one-time
 * `agent-local sudo` allowlist exists, because a daemon has no screen to put a password prompt on.
 * Muster does: it runs in the user's session, so `agent-local cert DOMAIN --trust` from here shows
 * the administrator dialog the CLI has always shown. Skipping that fallback is what turned "enter
 * your password" into a dead-end error for anyone who never ran `agent-local sudo`.
 */
export async function agentLocalCertTrust(
  domain: string,
  options: AgentLocalCertOptions = {}
): Promise<LocalWpCertTrustResult> {
  const host = options.host ?? createAgentLocalHost()
  const response = await requestWithDaemon(
    host,
    'POST',
    `/certs/${encodeURIComponent(domain)}/trust`,
    undefined,
    { timeoutMs: AGENT_LOCAL_START_TIMEOUT_MS }
  )
  if (response.ok) {
    return { ok: true, message: `Trusted ${domain}.` }
  }
  const daemonReason = describeAgentLocalResponse(response)
  const cli = await (options.runTrustCli ?? defaultTrustCli)(domain).catch((error: unknown) => ({
    code: -1,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error)
  }))
  // The CLI's own exit code says whether the prompt was answered; the OS says whether it took.
  const after = await agentLocalCertStatus(domain, { host })
  if (cli.code === 0 && after.trusted) {
    return { ok: true, message: `Trusted ${domain}.` }
  }
  const cliReason = cli.stderr.trim() || cli.stdout.trim()
  return {
    ok: false,
    message:
      cliReason.length > 0
        ? cliReason.includes('authorization failed')
          ? 'The password prompt was cancelled, so the certificate is not trusted.'
          : cliReason
        : daemonReason
  }
}
