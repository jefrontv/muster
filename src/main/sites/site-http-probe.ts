// Is the live site answering, and how long is its certificate good for?
//
// Ported from ocsites `_check_health_impl` (mcp_server.py:1346-1405). Two deliberate improvements
// over the Python:
//
//   * The TLS probe does not verify the chain. Python used a verifying context, so an *expired*
//     certificate failed the handshake and the tool reported a socket error instead of the one fact
//     the operator needed — that it expired, and when. Here the certificate is always read, and a
//     verification problem is reported alongside the expiry rather than instead of it. Nothing is
//     transferred over this socket, so not verifying costs no security.
//   * Redirects are followed, so a site behind a canonical-host 301 reports the status a browser
//     would actually land on.

import { connect as tlsConnect, type PeerCertificate } from 'node:tls'
import type { SiteCheck } from '../../shared/site-tool-types'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'

const HTTP_TIMEOUT_MS = 12_000
const TLS_TIMEOUT_MS = 10_000
const HTTPS_PORT = 443
/** Under this many days left, the certificate is a problem rather than a fact. */
const TLS_EXPIRY_WARNING_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** `acme.com` → `https://acme.com`; an explicit scheme is respected. */
export function normalizeLiveSiteUrl(liveDomain: string, protocol: 'http' | 'https'): string {
  const trimmed = liveDomain.trim()
  if (trimmed.length === 0) {
    return ''
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `${protocol}://${trimmed}`
}

export async function probeLiveSite(url: string, signal?: AbortSignal): Promise<SiteCheck> {
  if (url.length === 0) {
    return {
      check: 'http-reachable',
      outcome: 'skipped',
      detail: 'No live domain is configured for this environment.'
    }
  }
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'muster-health/1.0' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    })
    // Every path must release the body, including a 4xx/5xx: an unread undici body can take the
    // whole process down (see global-fetch-call-site-audit.test.ts).
    await cancelUnreadResponseBody(response)
    return {
      check: 'http-reachable',
      outcome: response.status < 400 ? 'ok' : 'failed',
      detail: `GET ${url} → ${response.status}`
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { check: 'http-reachable', outcome: 'failed', detail: `GET ${url}: ${detail}` }
  }
}

export async function probeTlsCertificate(url: string, signal?: AbortSignal): Promise<SiteCheck> {
  if (!url.toLowerCase().startsWith('https://')) {
    return {
      check: 'tls-certificate',
      outcome: 'skipped',
      detail: url.length === 0 ? 'No live domain configured.' : 'The live domain is not HTTPS.'
    }
  }
  const host = new URL(url).hostname
  try {
    const { certificate, authorizationError } = await readPeerCertificate(host, signal)
    if (!certificate.valid_to) {
      return {
        check: 'tls-certificate',
        outcome: 'failed',
        detail: `${host}: the server presented no certificate expiry.`
      }
    }
    const daysLeft = Math.floor((Date.parse(certificate.valid_to) - Date.now()) / MS_PER_DAY)
    const expiryDetail = `${host} expires in ${daysLeft} day(s) (${certificate.valid_to})`
    if (authorizationError) {
      return {
        check: 'tls-certificate',
        outcome: 'failed',
        detail: `${expiryDetail}; not trusted: ${authorizationError}`
      }
    }
    return {
      check: 'tls-certificate',
      outcome: daysLeft > TLS_EXPIRY_WARNING_DAYS ? 'ok' : 'failed',
      detail: expiryDetail
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { check: 'tls-certificate', outcome: 'failed', detail: `${host}: ${detail}` }
  }
}

type PeerCertificateResult = {
  certificate: PeerCertificate
  /** Non-empty when the chain does not verify; the expiry is still reported. */
  authorizationError: string
}

function readPeerCertificate(host: string, signal?: AbortSignal): Promise<PeerCertificateResult> {
  const { promise, resolve, reject } = Promise.withResolvers<PeerCertificateResult>()
  const socket = tlsConnect({
    host,
    port: HTTPS_PORT,
    servername: host,
    rejectUnauthorized: false,
    timeout: TLS_TIMEOUT_MS
  })
  const abort = (): void => {
    socket.destroy(new Error('Certificate probe cancelled'))
  }
  signal?.addEventListener('abort', abort, { once: true })
  const settle = (run: () => void): void => {
    signal?.removeEventListener('abort', abort)
    socket.destroy()
    run()
  }
  socket.once('secureConnect', () => {
    const certificate = socket.getPeerCertificate()
    const authorizationError = socket.authorized ? '' : (socket.authorizationError?.message ?? '')
    settle(() => resolve({ certificate, authorizationError }))
  })
  socket.once('timeout', () =>
    settle(() => reject(new Error(`TLS handshake timed out after ${TLS_TIMEOUT_MS} ms`)))
  )
  socket.once('error', (error: Error) => settle(() => reject(error)))
  return promise
}
