import { MAX_REPO_ICON_UPLOAD_BYTES } from '../shared/repo-icon'
import {
  allowsThirdPartyIconLookup,
  faviconHostVariants,
  normalizeFaviconTarget
} from './favicon-host-target'
import { requestBytes, ServerRespondedError, type RequestOptions } from './favicon-http-reader'
import {
  extractIconLinkHrefs,
  extractManifestHref,
  extractManifestIconSrcs
} from './favicon-icon-links'
import { sniffFaviconMimeType } from './favicon-image-sniff'

export type { FaviconFetchTarget } from './favicon-host-target'
export {
  allowsThirdPartyIconLookup,
  faviconHostVariants,
  normalizeFaviconTarget
} from './favicon-host-target'
export {
  extractIconLinkHref,
  extractIconLinkHrefs,
  extractManifestHref,
  extractManifestIconSrcs
} from './favicon-icon-links'
export { sniffFaviconMimeType } from './favicon-image-sniff'

export type FaviconFetchResult = { ok: true; dataUrl: string } | { ok: false; error: string }

// Total budget across every candidate URL. Generous because a cold WordPress
// homepage on shared hosting routinely spends several seconds before its first byte.
const FAVICON_FETCH_BUDGET_MS = 15_000
// Backstop for pages that never close <head>; the early stop normally fires first.
const MAX_HTML_SNIFF_BYTES = 256 * 1024
// A manifest is small; a multi-megabyte one is not a manifest.
const MAX_MANIFEST_BYTES = 128 * 1024
// Pages listing every size of every icon must not spend the budget on near-duplicates.
const MAX_DECLARED_ICON_CANDIDATES = 4
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
const ICON_ACCEPT = 'image/*,text/html;q=0.9,*/*;q=0.5'
const MANIFEST_ACCEPT = 'application/manifest+json,application/json;q=0.9,*/*;q=0.5'
const HEAD_END_RE = /<\/head\s*>/i

/** Tried in order once the page declares nothing usable. */
const WELL_KNOWN_ICON_PATHS = [
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/favicon.png',
  '/favicon.svg'
]

const textRead = (
  deadlineAt: number,
  maxBytes: number,
  accept: string,
  stopAt?: RegExp
): RequestOptions => ({
  deadlineAt,
  maxBytes,
  truncateOverflow: true,
  accept,
  decompress: true,
  stopAt
})

async function fetchIconDataUrl(iconUrl: URL, deadlineAt: number): Promise<string> {
  const response = await requestBytes(iconUrl, {
    deadlineAt,
    maxBytes: MAX_REPO_ICON_UPLOAD_BYTES,
    truncateOverflow: false,
    accept: ICON_ACCEPT,
    overflowMessage: 'Favicon is larger than 256KB.'
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

function absoluteIconUrls(hrefs: readonly string[], base: URL): URL[] {
  const urls: URL[] = []
  for (const href of hrefs) {
    try {
      const url = new URL(href, base)
      if (['http:', 'https:'].includes(url.protocol)) {
        urls.push(url)
      }
    } catch {
      // A malformed href is one dead candidate, not a dead page.
    }
  }
  return urls
}

/** The manifest's icons, or nothing: a missing manifest costs the page's other candidates nothing. */
async function manifestIconUrls(manifestUrl: URL, deadlineAt: number): Promise<URL[]> {
  try {
    const manifest = await requestBytes(
      manifestUrl,
      textRead(deadlineAt, MAX_MANIFEST_BYTES, MANIFEST_ACCEPT)
    )
    return absoluteIconUrls(
      extractManifestIconSrcs(manifest.body.toString('utf8')).slice(
        0,
        MAX_DECLARED_ICON_CANDIDATES
      ),
      manifestUrl
    )
  } catch {
    return []
  }
}

/** Icon URLs the homepage declares, best first: `<link rel=icon>` then the web app manifest. */
async function resolveDeclaredIconUrls(origin: string, deadlineAt: number): Promise<URL[]> {
  const response = await requestBytes(
    new URL('/', origin),
    textRead(deadlineAt, MAX_HTML_SNIFF_BYTES, HTML_ACCEPT, HEAD_END_RE)
  )
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ServerRespondedError(`${origin}/ responded with status ${response.statusCode}.`)
  }
  const html = response.body.toString('utf8')
  // Resolve against the post-redirect page URL so relative hrefs land on the right host.
  const urls = absoluteIconUrls(
    extractIconLinkHrefs(html).slice(0, MAX_DECLARED_ICON_CANDIDATES),
    response.finalUrl
  )
  const manifestHref = extractManifestHref(html)
  const [manifestUrl] = manifestHref ? absoluteIconUrls([manifestHref], response.finalUrl) : []
  return manifestUrl ? [...urls, ...(await manifestIconUrls(manifestUrl, deadlineAt))] : urls
}

/** Public icon services, tried only after every direct attempt failed. */
function thirdPartyIconUrls(host: string): URL[] {
  return [
    new URL(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`),
    new URL(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`)
  ]
}

/**
 * Fetches a site's favicon as an inline data URL. Per host (as typed, then the
 * apex/www counterpart) and per scheme (explicit scheme first; https before
 * http for bare domains): the homepage's declared `<link rel~=icon>` in ranked
 * order, then its web app manifest, then the well-known paths — tried even when
 * the page fetch fails, since WAFs often block pages but not static icons. An
 * explicit https input only falls back to http when https failed at the network
 * level, never on an HTTP error status. A public domain that resolves nothing
 * directly falls back to an external icon service; private and local names
 * never do. Never throws.
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
  const expired = (): boolean => deadlineAt - Date.now() <= 0

  const record = (error: unknown): boolean => {
    lastError = error instanceof Error ? error.message : String(error)
    if (error instanceof ServerRespondedError) {
      respondedError ??= lastError
      return true
    }
    return false
  }

  const attempt = async (iconUrl: URL): Promise<string | null> => {
    try {
      return await fetchIconDataUrl(iconUrl, deadlineAt)
    } catch (error) {
      record(error)
      return null
    }
  }

  for (const variant of faviconHostVariants(host)) {
    let httpsResponded = false
    for (const scheme of schemes) {
      if (scheme === 'http:' && explicitScheme === 'https:' && httpsResponded) {
        break
      }
      const origin = `${scheme}//${variant}`
      let declared: URL[] = []
      if (!expired()) {
        try {
          declared = await resolveDeclaredIconUrls(origin, deadlineAt)
          if (declared.length === 0) {
            lastError = `No <link rel="icon"> declared at ${origin}/.`
          }
          httpsResponded ||= scheme === 'https:'
        } catch (error) {
          httpsResponded ||= record(error) && scheme === 'https:'
        }
      }
      const candidates = [...declared, ...WELL_KNOWN_ICON_PATHS.map((p) => new URL(p, origin))]
      for (const iconUrl of candidates) {
        if (expired()) {
          return { ok: false, error: respondedError ?? lastError }
        }
        const dataUrl = await attempt(iconUrl)
        if (dataUrl) {
          return { ok: true, dataUrl }
        }
      }
    }
  }

  if (allowsThirdPartyIconLookup(host)) {
    for (const iconUrl of thirdPartyIconUrls(host)) {
      if (expired()) {
        break
      }
      const dataUrl = await attempt(iconUrl)
      if (dataUrl) {
        return { ok: true, dataUrl }
      }
    }
  }
  return { ok: false, error: respondedError ?? lastError }
}
