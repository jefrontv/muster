import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractIconLinkHref,
  fetchFaviconAsDataUrl,
  normalizeFaviconDomain,
  sniffFaviconMimeType
} from './favicon-fetch'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
)
const SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>'

describe('normalizeFaviconDomain', () => {
  it('accepts bare domains and lowercases them', () => {
    expect(normalizeFaviconDomain('Example.COM')).toBe('example.com')
  })

  it('strips scheme, path, query, and credentials from pasted URLs', () => {
    expect(normalizeFaviconDomain('https://user:pw@Example.com/some/path?q=1#frag')).toBe(
      'example.com'
    )
  })

  it('keeps an explicit port', () => {
    expect(normalizeFaviconDomain('foo.local:10004')).toBe('foo.local:10004')
    expect(normalizeFaviconDomain('http://foo.local:10004/wp-admin')).toBe('foo.local:10004')
  })

  it('rejects empty, non-http, and unparseable input', () => {
    expect(normalizeFaviconDomain('')).toBeNull()
    expect(normalizeFaviconDomain('   ')).toBeNull()
    expect(normalizeFaviconDomain('ftp://example.com')).toBeNull()
    expect(normalizeFaviconDomain('not a domain')).toBeNull()
  })
})

describe('extractIconLinkHref', () => {
  it('returns the last declared icon link', () => {
    const html = `<head>
      <link rel="icon" href="/small.png" sizes="16x16">
      <link rel="icon" href="/large.png" sizes="512x512">
    </head>`
    expect(extractIconLinkHref(html)).toBe('/large.png')
  })

  it('accepts the legacy shortcut icon rel and single quotes', () => {
    expect(extractIconLinkHref(`<link rel='shortcut icon' href='/fav.ico'>`)).toBe('/fav.ico')
  })

  it('matches rel as a token, not a substring', () => {
    expect(extractIconLinkHref('<link rel="apple-touch-icon" href="/touch.png">')).toBeNull()
  })

  it('returns null when no icon link exists', () => {
    expect(extractIconLinkHref('<link rel="stylesheet" href="/a.css"><p>hi</p>')).toBeNull()
    expect(extractIconLinkHref('<link rel="icon">')).toBeNull()
  })
})

describe('sniffFaviconMimeType', () => {
  it('detects raster formats by magic bytes', () => {
    expect(sniffFaviconMimeType(PNG_1X1)).toBe('image/png')
    expect(sniffFaviconMimeType(Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]))).toBe(
      'image/x-icon'
    )
    expect(sniffFaviconMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffFaviconMimeType(Buffer.from('GIF89a'))).toBe('image/gif')
    expect(sniffFaviconMimeType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '))).toBe('image/webp')
  })

  it('detects svg documents, with or without an xml prolog', () => {
    expect(sniffFaviconMimeType(Buffer.from(SVG_ICON))).toBe('image/svg+xml')
    expect(sniffFaviconMimeType(Buffer.from(`<?xml version="1.0"?>\n${SVG_ICON}`))).toBe(
      'image/svg+xml'
    )
  })

  it('rejects HTML error pages and empty payloads', () => {
    expect(sniffFaviconMimeType(Buffer.from('<!doctype html><html><body>404</body></html>'))).toBe(
      null
    )
    expect(sniffFaviconMimeType(Buffer.alloc(0))).toBeNull()
  })
})

describe('fetchFaviconAsDataUrl', () => {
  let server: Server | null = null

  afterEach(() => {
    server?.close()
    server = null
  })

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
    server = createServer(handler)
    const { promise, resolve } = Promise.withResolvers<string>()
    server.listen(0, '127.0.0.1', () => {
      const address = server!.address()
      resolve(typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '')
    })
    return promise
  }

  it('rejects an invalid domain without any network call', async () => {
    const result = await fetchFaviconAsDataUrl('not a domain')
    expect(result).toEqual({ ok: false, error: 'Enter a valid domain, e.g. example.com.' })
  })

  it('fetches /favicon.ico directly and returns a sniffed data url', async () => {
    const host = await listen((req, res) => {
      if (req.url === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end(PNG_1X1)
        return
      }
      res.writeHead(404).end()
    })
    const result = await fetchFaviconAsDataUrl(host)
    expect(result).toEqual({
      ok: true,
      dataUrl: `data:image/png;base64,${PNG_1X1.toString('base64')}`
    })
  })

  it('falls back to the homepage <link rel=icon> when /favicon.ico is missing', async () => {
    const host = await listen((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><head><link rel="icon" href="/brand.svg"></head></html>')
        return
      }
      if (req.url === '/brand.svg') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
        res.end(SVG_ICON)
        return
      }
      res.writeHead(404).end()
    })
    const result = await fetchFaviconAsDataUrl(host)
    expect(result).toEqual({
      ok: true,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(SVG_ICON).toString('base64')}`
    })
  })

  it('rejects icons larger than 256KB', async () => {
    const oversized = Buffer.concat([PNG_1X1, Buffer.alloc(256 * 1024)])
    const host = await listen((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><head><link rel="icon" href="/big.png"></head></html>')
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(oversized)
    })
    const result = await fetchFaviconAsDataUrl(host)
    expect(result).toEqual({ ok: false, error: 'Favicon is larger than 256KB.' })
  })

  it('rejects HTML masquerading as an icon', async () => {
    const host = await listen((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><head><link rel="icon" href="/soft-404.html"></head></html>')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<!doctype html><html><body>not found</body></html>')
    })
    const result = await fetchFaviconAsDataUrl(host)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('is not an image')
    }
  })
})
