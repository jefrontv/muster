// What a page's <head> declares about its icons: `<link rel~=icon>` tags and the web app manifest.

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
 * Every icon href declared via `<link rel~=icon|apple-touch-icon>`, best first.
 * Larger declared sizes win, then png/svg over ico; ties go to the later
 * declaration since sites commonly list icons smallest-first. Returning all of
 * them rather than only the winner is what lets a 404 on the best icon fall
 * through to the next one instead of skipping straight to /favicon.ico.
 */
export function extractIconLinkHrefs(html: string): string[] {
  const found: { href: string; size: number; format: number; order: number }[] = []
  let order = 0
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
    found.push({
      href,
      size: iconSizeScore(attrValue(SIZES_ATTR_RE, tag), isAppleTouch),
      format: iconFormatScore(attrValue(TYPE_ATTR_RE, tag), href),
      order: order++
    })
  }
  found.sort((a, b) => b.size - a.size || b.format - a.format || b.order - a.order)
  const ranked: string[] = []
  for (const entry of found) {
    if (!ranked.includes(entry.href)) {
      ranked.push(entry.href)
    }
  }
  return ranked
}

/** The single best declared icon href, or null. */
export function extractIconLinkHref(html: string): string | null {
  return extractIconLinkHrefs(html)[0] ?? null
}

/** The `<link rel="manifest">` href, or null. Modern sites keep their best icon there. */
export function extractManifestHref(html: string): string | null {
  for (const [tag] of html.matchAll(LINK_TAG_RE)) {
    if (attrValue(REL_ATTR_RE, tag).toLowerCase().split(/\s+/).includes('manifest')) {
      const href = attrValue(HREF_ATTR_RE, tag)
      if (href) {
        return href
      }
    }
  }
  return null
}

/** Manifest `icons[]` srcs, largest first. Invalid JSON yields nothing rather than throwing. */
export function extractManifestIconSrcs(json: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  const icons = (parsed as { icons?: unknown })?.icons
  if (!Array.isArray(icons)) {
    return []
  }
  return icons
    .flatMap((icon) => {
      const entry = icon as { src?: unknown; sizes?: unknown; type?: unknown }
      if (typeof entry?.src !== 'string' || !entry.src) {
        return []
      }
      return [
        {
          src: entry.src,
          size: iconSizeScore(typeof entry.sizes === 'string' ? entry.sizes : '', false),
          format: iconFormatScore(typeof entry.type === 'string' ? entry.type : '', entry.src)
        }
      ]
    })
    .sort((a, b) => b.size - a.size || b.format - a.format)
    .map((entry) => entry.src)
}
