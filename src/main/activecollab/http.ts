import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import { acIsRecord, acMimeEssence } from './codecs'
import { acMultipartBody, type AcMultipartPart } from './multipart'

export type AcRequestOptions = {
  /** DELETE is never retried — the replay gate below is GET-only, which a delete must stay out of. */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  form?: Record<string, string>
  /**
   * File parts for the one route that takes an upload. Mutually exclusive with `body` and `form`,
   * and never retried: `request` only replays a GET.
   */
  multipart?: readonly AcMultipartPart[]
  signal?: AbortSignal
}

export type AcResponse<T> = {
  data: T
  /** Totals live only in `X-Angie-Pagination*`; null when the header was absent. */
  totalItems: number | null
  page: number | null
  perPage: number | null
}

export type AcBinaryRequest = {
  /** Hard ceiling on buffered bytes, enforced against what ACTUALLY arrives. */
  maxBytes: number
  /** Consulted on the response Content-Type before a single body byte is buffered. */
  acceptMime: (mimeType: string) => boolean
  signal?: AbortSignal
}

/**
 * Transport faults still THROW `ActiveCollabApiError` so a 401 keeps mapping to "reconnect". Only
 * the two policy refusals come back as data, because phrasing them belongs to the caller.
 */
export type AcBinaryResponse =
  | { ok: true; mimeType: string; bytes: Uint8Array }
  | { ok: false; reason: 'unsupported-media'; mimeType: string }
  | { ok: false; reason: 'too-large' }

/**
 * The response body handed over UNREAD, for a caller that will spool it somewhere rather than hold
 * it. The caller owns the stream and MUST read or cancel it. Null when there was no body at all.
 */
export type AcStreamResponse = {
  mimeType: string
  body: ReadableStream<Uint8Array> | null
}

export type AcFetch = (input: string, init: RequestInit) => Promise<Response>

export type AcHttpClient = {
  request<T>(path: string, options?: AcRequestOptions): Promise<AcResponse<T>>
  /**
   * One-shot authenticated GET of a binary body, bounded by `maxBytes`. Deliberately not retried:
   * replaying a download costs far more than replaying a JSON read, and the caller can ask again.
   */
  requestBinary(path: string, options: AcBinaryRequest): Promise<AcBinaryResponse>
  /**
   * The same authenticated GET with the body left UNBUFFERED, for a payload that can dwarf any
   * inline cap — a download writes it straight to disk instead of holding it twice.
   */
  requestStream(path: string, options?: { signal?: AbortSignal }): Promise<AcStreamResponse>
}

export type AcHttpArgs = {
  baseUrl: string
  token: string | null
  /** Injected so tests never touch the network. */
  fetchImpl?: AcFetch
  /** Injected so retry tests observe delays without real timers. */
  sleepImpl?: (ms: number) => Promise<void>
  /** Injected so an HTTP-date `Retry-After` is deterministic under test. */
  nowImpl?: () => number
}

const AC_REDACTED = '***'
const AC_MAX_ATTEMPTS = 3
const AC_RETRY_BACKOFF_MS = [250, 750]
// Why: an unbounded Retry-After would stall a background poll for hours. The cap is a budget for
// the WHOLE request, not per attempt: three attempts each honouring a 60s hint would hold one poll
// open for three minutes, and the poller then schedules its own backoff on top of that.
const AC_MAX_RETRY_AFTER_MS = 60_000
// Why: ActiveCollab answers bad credentials with HTTP 500, so a 500 naming an
// authentication failure must be told apart from a transient server fault —
// otherwise a wrong password is retried forever and never reported.
const AC_AUTH_BODY_PATTERN =
  /authenticat|unauthori[sz]ed|invalid\s+(user|username|password|credentials?|token)/i
// Static table rather than a Set: these statuses never change at runtime.
const AC_RETRYABLE_STATUS: Record<number, true | undefined> = {
  429: true,
  500: true,
  502: true,
  503: true,
  504: true
}

export class ActiveCollabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly isAuthError: boolean,
    /** Body `message`/`type` verbatim (redacted), for callers branching on them. */
    readonly apiMessage: string | null = null,
    readonly apiType: string | null = null
  ) {
    super(message)
    this.name = 'ActiveCollabApiError'
  }
}

/**
 * Replace a token wherever it appears in a string.
 *
 * Attachment URLs carry `--DOWNLOAD-TOKEN--`, `--THUMBNAIL-TOKEN--` and
 * `--PREVIEW-TOKEN--` sentinels that callers substitute with the real token, so
 * matching the token VALUE — never a sentinel name — is the only way to catch
 * every path by which it could reach a log.
 */
export function redactAcToken(value: string, token: string | null): string {
  if (!token) {
    return value
  }
  const redacted = value.split(token).join(AC_REDACTED)
  // Why: a token that reached a query string may arrive percent-encoded.
  const encoded = encodeURIComponent(token)
  return encoded === token ? redacted : redacted.split(encoded).join(AC_REDACTED)
}

/**
 * A bare instance URL gains the API prefix; a URL that already carries a path
 * is taken as-is, matching the reference clients — the caller may point
 * straight at `/api/v1` or at a sub-path install.
 */
function normalizeAcBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl.trim())
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path === '' ? '/api/v1/' : `${path}/`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function acUrl(baseUrl: string, path: string, query: AcRequestOptions['query']): string {
  // Leading slashes are stripped so a path cannot reset to the host root and
  // silently drop the /api/v1 prefix.
  const url = new URL(path.replace(/^\/+/, ''), baseUrl)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function acRequestInit(token: string | null, options: AcRequestOptions): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) {
    // Raw token: ActiveCollab rejects a `Bearer` prefix.
    headers['X-Angie-AuthApiToken'] = token
  }
  let body: string | FormData | undefined
  if (options.multipart) {
    // No Content-Type is set on purpose: the runtime writes it WITH the boundary it generated.
    // Naming the type here strips the boundary, which is how a self-hosted instance ends up
    // answering 200 with an empty array instead of upload records — see ./multipart.ts.
    body = acMultipartBody(options.multipart)
  } else if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(options.form).toString()
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  return { method: options.method ?? 'GET', headers, body, signal: options.signal }
}

function acHeaderInt(response: Response, name: string): number | null {
  const raw = response.headers.get(name)
  if (raw === null || raw.trim() === '') {
    return null
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

async function acReadBody(response: Response): Promise<unknown> {
  let text: string
  try {
    text = await response.text()
  } catch {
    // A body we could not drain still has to be released or undici can stall
    // the whole process (orca#8695).
    await cancelUnreadResponseBody(response)
    return null
  }
  if (text === '') {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    // Proxies and crash pages answer with HTML; keep it for the error message.
    return text
  }
}

function acBodyField(body: unknown, key: string): string | null {
  if (!acIsRecord(body)) {
    return null
  }
  const value = body[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function acError(status: number, body: unknown, token: string | null): ActiveCollabApiError {
  const apiMessage = acBodyField(body, 'message')
  const apiType = acBodyField(body, 'type')
  const isAuthError =
    status === 401 ||
    status === 403 ||
    (status === 500 && AC_AUTH_BODY_PATTERN.test(`${apiType ?? ''} ${apiMessage ?? ''}`))
  return new ActiveCollabApiError(
    redactAcToken(apiMessage ?? apiType ?? `ActiveCollab request failed with ${status}`, token),
    status,
    isAuthError,
    apiMessage === null ? null : redactAcToken(apiMessage, token),
    apiType === null ? null : redactAcToken(apiType, token)
  )
}

function acRetryAfterMs(response: Response, now: () => number): number | null {
  const header = response.headers.get('retry-after')
  if (!header) {
    return null
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return seconds > 0 ? Math.min(seconds * 1000, AC_MAX_RETRY_AFTER_MS) : null
  }
  // Why: RFC 9110 allows an HTTP-date in place of a delta-seconds value.
  const dateMs = Date.parse(header)
  if (!Number.isFinite(dateMs)) {
    return null
  }
  const delta = dateMs - now()
  return delta > 0 ? Math.min(delta, AC_MAX_RETRY_AFTER_MS) : null
}

/** Per-attempt ceiling on JSON calls with no caller signal: a hung socket must fail the REQUEST,
 *  not the caller's loop — the notification poller's `inFlight` latch made one unsettled fetch
 *  stop polling for the session. Binary paths are exempt; attachments may stream longer. */
export const AC_REQUEST_TIMEOUT_MS = 30_000

async function acFetchOnce(
  fetchImpl: AcFetch,
  url: string,
  init: RequestInit,
  token: string | null,
  /** The CALLER's signal, distinct from any per-attempt timeout signal riding in `init`. */
  callerSignal?: AbortSignal | null
): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (error) {
    // Why: an abort is the caller's own cancellation and must not be dressed up as a server
    // fault; anything else — a timeout abort included — can carry the URL and token in its message.
    if (callerSignal?.aborted) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ActiveCollabApiError(redactAcToken(message, token), 0, false)
  }
}

/**
 * Buffer at most `maxBytes`, counting the bytes that ACTUALLY arrive. Content-Length is never
 * trusted: it can lie, it is absent under chunked encoding, and a truncated header must not be
 * able to talk us into holding a body larger than the cap.
 */
async function acReadBounded(
  response: Response,
  maxBytes: number,
  mimeType: string
): Promise<AcBinaryResponse> {
  const body = response.body
  if (body === null) {
    return { ok: true, mimeType, bytes: new Uint8Array(0) }
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      total += chunk.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false, reason: 'too-large' }
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, mimeType, bytes }
}

export function createAcHttp(args: AcHttpArgs): AcHttpClient {
  const baseUrl = normalizeAcBaseUrl(args.baseUrl)
  const token = args.token
  const fetchImpl = args.fetchImpl ?? globalThis.fetch
  const sleep =
    args.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = args.nowImpl ?? Date.now

  async function request<T>(path: string, options: AcRequestOptions = {}): Promise<AcResponse<T>> {
    const url = acUrl(baseUrl, path, options.query)
    const init = acRequestInit(token, options)
    let attempt = 0
    let retryAfterSpentMs = 0
    for (;;) {
      // Fresh timeout per attempt: a retry must get its own budget, not the dregs of the last one.
      const attemptInit = options.signal
        ? init
        : { ...init, signal: AbortSignal.timeout(AC_REQUEST_TIMEOUT_MS) }
      const response = await acFetchOnce(fetchImpl, url, attemptInit, token, options.signal ?? null)
      // Draining on every path — ok or not — is what keeps undici from stalling.
      const body = await acReadBody(response)
      if (response.ok) {
        return {
          data: body as T,
          totalItems: acHeaderInt(response, 'X-Angie-PaginationTotalItems'),
          page: acHeaderInt(response, 'X-Angie-PaginationCurrentPage'),
          perPage: acHeaderInt(response, 'X-Angie-PaginationItemsPerPage')
        }
      }
      const error = acError(response.status, body, token)
      // Why: the server's own hint beats our guess — a shorter sleep re-fails.
      const hintedMs = acRetryAfterMs(response, now)
      // Why: only GET is safe to replay, and an auth-shaped 500 is a rejected
      // credential rather than a blip, so replaying it can never succeed. A hint that no longer
      // fits the budget ends the request instead: asking again sooner than the server asked is
      // worse than failing, and the caller comes back on its own schedule.
      const retryable =
        init.method === 'GET' &&
        !error.isAuthError &&
        AC_RETRYABLE_STATUS[response.status] === true &&
        attempt < AC_MAX_ATTEMPTS - 1 &&
        (hintedMs === null || hintedMs <= AC_MAX_RETRY_AFTER_MS - retryAfterSpentMs)
      if (!retryable) {
        throw error
      }
      retryAfterSpentMs += hintedMs ?? 0
      await sleep(hintedMs ?? AC_RETRY_BACKOFF_MS[attempt])
      attempt += 1
    }
  }

  /** The authenticated GET both binary paths start from, with a non-2xx already turned into a
   * mapped, redacted `ActiveCollabApiError` so neither caller repeats that decision. */
  async function fetchAuthorizedBinary(path: string, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { Accept: '*/*' }
    if (token) {
      headers['X-Angie-AuthApiToken'] = token
    }
    const init: RequestInit = { method: 'GET', headers, signal }
    const url = acUrl(baseUrl, path, undefined)
    const response = await acFetchOnce(fetchImpl, url, init, token, signal ?? null)
    if (!response.ok) {
      throw acError(response.status, await acReadBody(response), token)
    }
    return response
  }

  async function requestBinary(path: string, options: AcBinaryRequest): Promise<AcBinaryResponse> {
    const response = await fetchAuthorizedBinary(path, options.signal)
    const mimeType = acMimeEssence(response.headers.get('content-type'))
    if (!options.acceptMime(mimeType)) {
      // Refused on the header alone: a 200 MB video must not be buffered just to be rejected.
      await cancelUnreadResponseBody(response)
      return { ok: false, reason: 'unsupported-media', mimeType }
    }
    return acReadBounded(response, options.maxBytes, mimeType)
  }

  async function requestStream(
    path: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<AcStreamResponse> {
    const response = await fetchAuthorizedBinary(path, options.signal)
    return { mimeType: acMimeEssence(response.headers.get('content-type')), body: response.body }
  }

  return { request, requestBinary, requestStream }
}
