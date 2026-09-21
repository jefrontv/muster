// Which host to ask, and which hosts may be named to an outside service.

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

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/

// Names that only ever resolve on someone's own network; their existence is not public knowledge.
const PRIVATE_TLDS = new Set([
  'local',
  'localhost',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'test',
  'invalid',
  'example',
  'arpa'
])

/** An explicit port, an IP literal, or a single label names one machine, not a site. */
function isSpecificMachine(host: string): boolean {
  return host.includes(':') || IPV4_RE.test(host) || !host.includes('.')
}

/**
 * The apex and www spellings of a host, in the order to try them. Sites that
 * answer on only one of the two are common enough that trying just the typed
 * spelling is why a working site reports "no favicon found".
 */
export function faviconHostVariants(host: string): string[] {
  if (isSpecificMachine(host)) {
    return [host]
  }
  if (host.startsWith('www.')) {
    const apex = host.slice(4)
    return apex.includes('.') ? [host, apex] : [host]
  }
  return [host, `www.${host}`]
}

/** Whether this host's name may be sent to an external icon service. Private names never leave. */
export function allowsThirdPartyIconLookup(host: string): boolean {
  if (isSpecificMachine(host)) {
    return false
  }
  const tld = host.slice(host.lastIndexOf('.') + 1)
  return tld.length > 0 && !PRIVATE_TLDS.has(tld)
}
