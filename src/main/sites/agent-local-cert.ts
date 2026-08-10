// agent-local's half of the certificate contract, shaped to the same LocalWpCertStatus the UI
// already renders.
//
// `trusted` is read from the OS on every call rather than remembered, so a certificate the user
// revoked in Keychain Access reports as untrusted instead of as whatever it was when it was issued.

import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'
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

type AgentLocalCertOptions = { host?: AgentLocalHost }

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
  return {
    ok: response.ok,
    // A trust failure is usually the missing one-time `agent-local sudo` grant, which a background
    // Electron process cannot satisfy with a GUI prompt — say so rather than retrying forever.
    message: response.ok
      ? `Trusted ${domain}.`
      : `${describeAgentLocalResponse(response)} (if this needs a password prompt, run \`agent-local sudo\` once in a terminal)`
  }
}
