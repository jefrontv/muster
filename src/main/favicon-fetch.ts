import type { IncomingMessage } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { MAX_REPO_ICON_UPLOAD_BYTES } from '../shared/repo-icon'

// Why: node http/https instead of Electron net.fetch — the *.local fallback
// below needs per-request TLS tolerance (rejectUnauthorized), which Chromium's
// net stack only offers as a session-wide certificate hook.
export type FaviconFetchResult = { ok: true; dataUrl: string } | { ok: false; error: string }

// Total budget across every candidate URL, so a slow host cannot stall the picker.
const FAVICON_FETCH_BUDGET_MS = 5_000
// Enough hops for apex -> www -> CDN; anything longer is not a favicon.
const MAX_REDIRECT_HOPS = 3
// Icon hrefs live in <head>; reading more of the homepage buys nothing.
const MAX_HTML_SNIFF_BYTES = 256 * 1024
// Why: WAFs commonly 403 UA-less requests (node sends no User-Agent by default).
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
const ICON_ACCEPT = 'image/*,text/html;q=0.9,*/*;q=0.5'

export type FaviconFetchTarget = {
  host: string
  /** Scheme the user typed, or null for bare domains (https is tried first). */
  explicitScheme: 'http:' | 'https:' | null
}

/** Accepts bare domains, host:port, or full URLs; keeps an explicit scheme. */
export function normalizeFaviconTarget(raw: string): FaviconFetchTarget | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const hasScheme = trimmed.includes('://')
  try {
    // Why: prefix a scheme so `foo.local:10004` parses as host:port, not scheme:path.
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return null
    }
    // Keep an explicit port (LocalWP maps sites to odd ports); drop creds/path/query.
    return {
      host: url.host.toLowerCase(),
      explicitScheme: hasScheme ? (url.protocol as 'http:' | 'https:') : null
    }
  } catch {
    return null
  }
}

const LINK_TAG_RE = /<link\b[^>]*>/gi
const REL_ATTR_RE = /\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const HREF_ATTR_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const SIZES_ATTR_RE = /\bsizes\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const TYPE_ATTR_RE = /\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i

function attrValue(re: RegExp, tag: string): string {
  const match = re.exec(tag)
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? ''
}

// De-facto apple-touch-icon size when the tag declares none.
const APPLE_TOUCH_DEFAULT_SIZE = 180
// `sizes="any"` (scalable svg) should beat any fixed-size raster.
const SCALABLE_SIZE = 1024

function iconSizeScore(sizes: string, isAppleTouch: boolean): number {
  let max = 0
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') {
      max = Math.max(max, SCALABLE_SIZE)
      continue
    }
    const dims = /^(\d+)x(\d+)$/.exec(token)
    if (dims) {
      max = Math.max(max, Number(dims[1]), Number(dims[2]))
    }
  }
  return max === 0 && isAppleTouch ? APPLE_TOUCH_DEFAULT_SIZE : max
}

function iconFormatScore(type: string, href: string): number {
  const format =
    type.toLowerCase() || /\.([a-z0-9]+)(?:[?#]|$)/i.exec(href)?.[1]?.toLowerCase() || ''
  if (format === 'image/svg+xml' || format === 'svg') {
    return 3
  }
  if (['image/png', 'png', 'image/webp', 'webp'].includes(format)) {
    return 2
  }
  if (['image/x-icon', 'image/vnd.microsoft.icon', 'ico'].includes(format)) {
    return 0
  }
  return 1
}

/**
 * Returns the best icon href declared via `<link rel~=icon|apple-touch-icon>`,
 * or null. Prefers larger declared sizes, then png/svg over ico; ties go to
 * the last declaration since sites commonly list icons smallest-first.
 */
export function extractIconLinkHref(html: string): string | null {
  let best: { href: string; size: number; format: number } | null = null
  for (const [tag] of html.matchAll(LINK_TAG_RE)) {
    const relTokens = attrValue(REL_ATTR_RE, tag).toLowerCase().split(/\s+/)
    const isAppleTouch =
      relTokens.includes('apple-touch-icon') || relTokens.includes('apple-touch-icon-precomposed')
    if (!relTokens.includes('icon') && !isAppleTouch) {
      continue
    }
    const href = attrValue(HREF_ATTR_RE, tag)
    if (!href) {
      continue
    }
    const size = iconSizeScore(attrValue(SIZES_ATTR_RE, tag), isAppleTouch)
    const format = iconFormatScore(attrValue(TYPE_ATTR_RE, tag), href)
    if (!best || size > best.size || (size === best.size && format >= best.format)) {
      best = { href, size, format }
    }
  }
  return best?.href ?? null
}

const SVG_DOCUMENT_RE = /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i

/** Sniffs favicon bytes by magic numbers; returns a mime type or null (e.g. HTML error pages). */
export function sniffFaviconMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png'
    }
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
      return 'image/x-icon'
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg'
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif'
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp'
    }
  }
  // SVG has no magic bytes; require an <svg> document root so HTML pages are rejected.
  const head = Buffer.from(bytes.subarray(0, 1024))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (SVG_DOCUMENT_RE.test(head)) {
    return 'image/svg+xml'
  }
  return null
}

/** Failure after the server answered — a WAF 403 must not trigger the http downgrade. */
class ServerRespondedError extends Error {}

type ResponseBytes = { statusCode: number; body: Buffer; finalUrl: URL }

function requestBytes(
  url: URL,
  options: { deadlineAt: number; maxBytes: number; truncateOverflow: boolean; accept: string },
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
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: options.accept }
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
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (received > options.maxBytes) {
          if (options.truncateOverflow) {
            chunks.push(chunk.subarray(0, chunk.length - (received - options.maxBytes)))
            res.destroy()
            resolve({ statusCode, body: Buffer.concat(chunks), finalUrl: url })
          } else {
            res.destroy()
            reject(new ServerRespondedError('Favicon is larger than 256KB.'))
          }
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve({ statusCode, body: Buffer.concat(chunks), finalUrl: url }))
      res.on('error', (error) => reject(error))
    }
  )
  req.setTimeout(budget, () => req.destroy(new Error(`Timed out fetching ${url.href}.`)))
  req.on('error', (error) => reject(error))
  req.end()
  return promise
}

async function fetchIconDataUrl(iconUrl: URL, deadlineAt: number): Promise<string> {
  const response = await requestBytes(iconUrl, {
    deadlineAt,
    maxBytes: MAX_REPO_ICON_UPLOAD_BYTES,
    truncateOverflow: false,
    accept: ICON_ACCEPT
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ServerRespondedError(`${iconUrl.href} responded with status ${response.statusCode}.`)
  }
  const mimeType = sniffFaviconMimeType(response.body)
  if (!mimeType) {
    throw new ServerRespondedError(`${iconUrl.href} is not an image.`)
  }
  return `data:${mimeType};base64,${response.body.toString('base64')}`
}

async function resolveDeclaredIconUrl(origin: string, deadlineAt: number): Promise<URL | null> {
  const response = await requestBytes(new URL('/', origin), {
    deadlineAt,
    maxBytes: MAX_HTML_SNIFF_BYTES,
    truncateOverflow: true,
    accept: HTML_ACCEPT
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ServerRespondedError(`${origin}/ responded with status ${response.statusCode}.`)
  }
  const href = extractIconLinkHref(response.body.toString('utf8'))
  if (!href) {
    return null
  }
  // Resolve against the post-redirect page URL so relative hrefs land on the right host.
  const iconUrl = new URL(href, response.finalUrl)
  return ['http:', 'https:'].includes(iconUrl.protocol) ? iconUrl : null
}

/**
 * Fetches a site's favicon as an inline data URL. Per scheme (explicit scheme
 * first; https before http for bare domains): the homepage's declared
 * `<link rel~=icon>`, then /favicon.ico — tried even when the page fetch
 * fails, since WAFs often block pages but not static icons. An explicit https
 * input only falls back to http when https failed at the network level, never
 * on an HTTP error status. Never throws.
 */
export async function fetchFaviconAsDataUrl(rawDomain: string): Promise<FaviconFetchResult> {
  const target = normalizeFaviconTarget(rawDomain)
  if (!target) {
    return { ok: false, error: 'Enter a valid domain, e.g. example.com.' }
  }
  const { host, explicitScheme } = target
  const schemes: ('http:' | 'https:')[] =
    explicitScheme === 'http:' ? ['http:', 'https:'] : ['https:', 'http:']
  const deadlineAt = Date.now() + FAVICON_FETCH_BUDGET_MS
  // Prefer the first post-response failure: it names the URL the server
  // actually rejected, instead of whichever fallback happened to run last.
  let respondedError: string | null = null
  let lastError = `No favicon found for ${host}.`
  let httpsResponded = false
  for (const scheme of schemes) {
    if (scheme === 'http:' && explicitScheme === 'https:' && httpsResponded) {
      break
    }
    const origin = `${scheme}//${host}`
    for (const candidate of ['declared', 'direct'] as const) {
      if (deadlineAt - Date.now() <= 0) {
        return { ok: false, error: respondedError ?? lastError }
      }
      try {
        const iconUrl =
          candidate === 'declared'
            ? await resolveDeclaredIconUrl(origin, deadlineAt)
            : new URL('/favicon.ico', origin)
        if (!iconUrl) {
          if (scheme === 'https:') {
            httpsResponded = true
          }
          lastError = `No <link rel="icon"> declared at ${origin}/.`
          continue
        }
        return { ok: true, dataUrl: await fetchIconDataUrl(iconUrl, deadlineAt) }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (error instanceof ServerRespondedError) {
          respondedError ??= lastError
          if (scheme === 'https:') {
            httpsResponded = true
          }
        }
      }
    }
  }
  return { ok: false, error: respondedError ?? lastError }
}
