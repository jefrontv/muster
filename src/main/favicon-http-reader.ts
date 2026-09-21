import type { IncomingMessage } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'

// Why: node http/https instead of Electron net.fetch — the *.local case below
// needs per-request TLS tolerance (rejectUnauthorized), which Chromium's net
// stack only offers as a session-wide certificate hook.

// Per request, so one dead candidate cannot swallow the whole fetch budget.
export const PER_REQUEST_TIMEOUT_MS = 8_000
// Enough hops for apex -> www -> CDN; anything longer is not a favicon.
const MAX_REDIRECT_HOPS = 3
// Why: WAFs commonly 403 UA-less requests (node sends no User-Agent by default).
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Failure after the server answered — a WAF 403 must not trigger the http downgrade. */
export class ServerRespondedError extends Error {}

export type ResponseBytes = { statusCode: number; body: Buffer; finalUrl: URL }

export type RequestOptions = {
  deadlineAt: number
  maxBytes: number
  /** Keep what arrived instead of failing at maxBytes — right for text, wrong for an icon. */
  truncateOverflow: boolean
  accept: string
  /** Ask for compression and inflate the reply. Text only; icon formats are already compressed. */
  decompress?: boolean
  /** Stop reading the moment this matches the decoded text so far. */
  stopAt?: RegExp
  /** Message for a body that outruns maxBytes when truncation is off. */
  overflowMessage?: string
}

function decodeStream(res: IncomingMessage): Readable {
  switch (String(res.headers['content-encoding'] ?? '').toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return res.pipe(createGunzip())
    case 'deflate':
      return res.pipe(createInflate())
    case 'br':
      return res.pipe(createBrotliDecompress())
    default:
      return res
  }
}

export function requestBytes(
  url: URL,
  options: RequestOptions,
  redirectsLeft = MAX_REDIRECT_HOPS
): Promise<ResponseBytes> {
  const { promise, resolve, reject } = Promise.withResolvers<ResponseBytes>()
  const budget = options.deadlineAt - Date.now()
  if (budget <= 0) {
    reject(new Error(`Timed out fetching ${url.href}.`))
    return promise
  }
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
  const req = transport(
    url,
    {
      // Why: LocalWP serves *.local sites over https with a self-signed cert.
      // Tolerate invalid certs ONLY for .local hosts — never globally.
      rejectUnauthorized: !url.hostname.endsWith('.local'),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: options.accept,
        ...(options.decompress ? { 'Accept-Encoding': 'gzip, deflate, br' } : {})
      }
    },
    (res: IncomingMessage) => {
      const { statusCode = 0 } = res
      const location = res.headers.location
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume()
        if (redirectsLeft <= 0) {
          reject(new ServerRespondedError(`Too many redirects fetching ${url.href}.`))
          return
        }
        let next: URL
        try {
          next = new URL(location, url)
        } catch {
          reject(new ServerRespondedError(`${url.href} sent an invalid redirect location.`))
          return
        }
        if (!['http:', 'https:'].includes(next.protocol)) {
          reject(new ServerRespondedError(`${url.href} redirected to a non-http URL.`))
          return
        }
        resolve(requestBytes(next, options, redirectsLeft - 1))
        return
      }
      const chunks: Buffer[] = []
      let received = 0
      // Why `settled`: destroying the socket to stop early makes a decode stream
      // emit an error, and that error is expected, not a failure.
      let settled = false
      const finish = (): void => {
        if (!settled) {
          settled = true
          resolve({ statusCode, body: Buffer.concat(chunks), finalUrl: url })
        }
      }
      const stream = decodeStream(res)
      stream.on('data', (chunk: Buffer) => {
        if (settled) {
          return
        }
        received += chunk.length
        if (received > options.maxBytes) {
          if (!options.truncateOverflow) {
            settled = true
            res.destroy()
            reject(new ServerRespondedError(options.overflowMessage ?? 'Response is too large.'))
            return
          }
          chunks.push(chunk.subarray(0, chunk.length - (received - options.maxBytes)))
          res.destroy()
          finish()
          return
        }
        chunks.push(chunk)
        // Icon links live in <head>; the rest of a 300KB homepage buys nothing but latency.
        if (options.stopAt?.test(Buffer.concat(chunks).toString('utf8'))) {
          res.destroy()
          finish()
        }
      })
      stream.on('end', finish)
      stream.on('error', (error) => {
        if (!settled) {
          settled = true
          reject(error)
        }
      })
    }
  )
  req.setTimeout(Math.min(budget, PER_REQUEST_TIMEOUT_MS), () =>
    req.destroy(new Error(`Timed out fetching ${url.href}.`))
  )
  req.on('error', (error) => reject(error))
  req.end()
  return promise
}
