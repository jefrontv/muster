// What the bytes actually are, since servers routinely label a 404 page image/x-icon.

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
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('utf8').replace(/^﻿/, '').trimStart()
  if (SVG_DOCUMENT_RE.test(head)) {
    return 'image/svg+xml'
  }
  return null
}
