// Streaming local SHA-256 digest without buffering whole files in memory.

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export type LocalFileDigest = {
  sha256: string
  bytes: number
}

/** Streams `filePath` into SHA-256 and counts bytes, resolving null when the file cannot be read. */
export function hashLocalFileSha256(filePath: string): Promise<LocalFileDigest | null> {
  const { promise, resolve } = Promise.withResolvers<LocalFileDigest | null>()
  const hash = createHash('sha256')
  let bytes = 0
  let settled = false
  const stream = createReadStream(filePath)
  stream.on('data', (chunk: string | Buffer) => {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    bytes += buffer.byteLength
    hash.update(buffer)
  })
  stream.on('error', () => {
    if (!settled) {
      settled = true
      resolve(null)
    }
  })
  stream.on('end', () => {
    if (!settled) {
      settled = true
      resolve({ sha256: hash.digest('hex'), bytes })
    }
  })
  return promise
}
