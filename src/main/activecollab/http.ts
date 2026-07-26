import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import { acIsRecord } from './codecs'

export type AcRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT'
  query?: Record<string, string | number | undefined>
  body?: unknown
  form?: Record<string, string>
  signal?: AbortSignal
}

export type AcResponse<T> = {
  data: T
  /** Totals live only in `X-Angie-Pagination*`; null when the header was absent. */
  totalItems: number | null
  page: number | null
  perPage: number | null
}

export type AcFetch = (input: string, init: RequestInit) => Promise<Response>

export type AcHttpClient = {
  request<T>(path: string, options?: AcRequestOptions): Promise<AcResponse<T>>
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
// Why: an unbounded Retry-After would stall a background poll for hours.
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
  let body: string | undefined
  if (options.form) {
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

async function acFetchOnce(
  fetchImpl: AcFetch,
  url: string,
  init: RequestInit,
  token: string | null
): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (error) {
    // Why: an abort is the caller's own cancellation and must not be dressed up
    // as a server fault; anything else can carry the request URL — and with it
    // the token — into its message.
    if (init.signal?.aborted) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ActiveCollabApiError(redactAcToken(message, token), 0, false)
  }
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
    for (;;) {
      const response = await acFetchOnce(fetchImpl, url, init, token)
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
      // Why: only GET is safe to replay, and an auth-shaped 500 is a rejected
      // credential rather than a blip, so replaying it can never succeed.
      const retryable =
        init.method === 'GET' &&
        !error.isAuthError &&
        AC_RETRYABLE_STATUS[response.status] === true &&
        attempt < AC_MAX_ATTEMPTS - 1
      if (!retryable) {
        throw error
      }
      // Why: the server's own hint beats our guess — a shorter sleep re-fails.
      await sleep(acRetryAfterMs(response, now) ?? AC_RETRY_BACKOFF_MS[attempt])
      attempt += 1
    }
  }

  return { request }
}
