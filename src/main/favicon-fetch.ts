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

/** Accepts bare domains, host:port, or full URLs; returns the lowercased host or null. */
export function normalizeFaviconDomain(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  try {
    // Why: prefix a scheme so `foo.local:10004` parses as host:port, not scheme:path.
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return null
    }
    // Keep an explicit port (LocalWP maps sites to odd ports); drop creds/path/query.
    return url.host.toLowerCase()
  } catch {
    return null
  }
}

const LINK_TAG_RE = /<link\b[^>]*>/gi
const REL_ATTR_RE = /\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const HREF_ATTR_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i

/**
 * Returns the href of the last `<link rel~=icon>` in the document, or null.
 * Last wins: sites commonly list icons smallest-first, so the last declared
 * candidate is the largest — good enough without parsing `sizes`.
 */
export function extractIconLinkHref(html: string): string | null {
  let href: string | null = null
  for (const [tag] of html.matchAll(LINK_TAG_RE)) {
    const rel = REL_ATTR_RE.exec(tag)
    const relValue = rel?.[2] ?? rel?.[3] ?? rel?.[4] ?? ''
    if (!relValue.toLowerCase().split(/\s+/).includes('icon')) {
      continue
    }
    const link = HREF_ATTR_RE.exec(tag)
    const linkValue = link?.[2] ?? link?.[3] ?? link?.[4] ?? ''
    if (linkValue) {
      href = linkValue
    }
  }
  return href
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

type ResponseBytes = { statusCode: number; body: Buffer; finalUrl: URL }

function requestBytes(
  url: URL,
  options: { deadlineAt: number; maxBytes: number; truncateOverflow: boolean },
  redirectsLeft = MAX_REDIRECT_HOPS
): Promise<ResponseBytes> {
  const { promise, resolve, reject } = Promise.withResolvers<ResponseBytes>()
  const budget = options.deadlineAt - Date.now()
  if (budget <= 0) {
    reject(new Error('Timed out fetching favicon.'))
    return promise
  }
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
  const req = transport(
    url,
    {
      // Why: LocalWP serves *.local sites over https with a self-signed cert.
      // Tolerate invalid certs ONLY for .local hosts — never globally.
      rejectUnauthorized: !url.hostname.endsWith('.local'),
      headers: { Accept: 'image/*,text/html;q=0.9,*/*;q=0.5' }
    },
    (res: IncomingMessage) => {
      const { statusCode = 0 } = res
      const location = res.headers.location
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects.'))
          return
        }
        let next: URL
        try {
          next = new URL(location, url)
        } catch {
          reject(new Error('Invalid redirect location.'))
          return
        }
        if (!['http:', 'https:'].includes(next.protocol)) {
          reject(new Error('Redirected to a non-http URL.'))
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
            reject(new Error('Favicon is larger than 256KB.'))
          }
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve({ statusCode, body: Buffer.concat(chunks), finalUrl: url }))
      res.on('error', (error) => reject(error))
    }
  )
  req.setTimeout(budget, () => req.destroy(new Error('Timed out fetching favicon.')))
  req.on('error', (error) => reject(error))
  req.end()
  return promise
}

async function fetchIconDataUrl(iconUrl: URL, deadlineAt: number): Promise<string> {
  const response = await requestBytes(iconUrl, {
    deadlineAt,
    maxBytes: MAX_REPO_ICON_UPLOAD_BYTES,
    truncateOverflow: false
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${iconUrl.href} responded with status ${response.statusCode}.`)
  }
  const mimeType = sniffFaviconMimeType(response.body)
  if (!mimeType) {
    throw new Error(`${iconUrl.href} is not an image.`)
  }
  return `data:${mimeType};base64,${response.body.toString('base64')}`
}

async function resolveDeclaredIconUrl(origin: string, deadlineAt: number): Promise<URL | null> {
  const response = await requestBytes(new URL('/', origin), {
    deadlineAt,
    maxBytes: MAX_HTML_SNIFF_BYTES,
    truncateOverflow: true
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${origin}/ responded with status ${response.statusCode}.`)
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
 * Fetches a site's favicon as an inline data URL. Resolution order, per scheme
 * (https first, then plain http for .local sites that only answer over http):
 * /favicon.ico, then the homepage's declared <link rel~=icon>. Never throws.
 */
export async function fetchFaviconAsDataUrl(rawDomain: string): Promise<FaviconFetchResult> {
  const host = normalizeFaviconDomain(rawDomain)
  if (!host) {
    return { ok: false, error: 'Enter a valid domain, e.g. example.com.' }
  }
  const deadlineAt = Date.now() + FAVICON_FETCH_BUDGET_MS
  let lastError = `No favicon found for ${host}.`
  for (const origin of [`https://${host}`, `http://${host}`]) {
    for (const candidate of ['direct', 'declared'] as const) {
      if (deadlineAt - Date.now() <= 0) {
        return { ok: false, error: lastError }
      }
      try {
        const iconUrl =
          candidate === 'direct'
            ? new URL('/favicon.ico', origin)
            : await resolveDeclaredIconUrl(origin, deadlineAt)
        if (!iconUrl) {
          lastError = `No <link rel="icon"> declared at ${origin}/.`
          continue
        }
        return { ok: true, dataUrl: await fetchIconDataUrl(iconUrl, deadlineAt) }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }
  }
  return { ok: false, error: lastError }
}
