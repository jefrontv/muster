import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashLocalFileSha256 } from './file-sha256'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'muster-sha256-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('hashLocalFileSha256', () => {
  it('computes the exact SHA-256 digest and byte count', async () => {
    const content = Buffer.alloc(192 * 1024, 0x61)
    const filePath = join(dir, 'sample.bin')
    writeFileSync(filePath, content)

    const digest = await hashLocalFileSha256(filePath)
    expect(digest).toEqual({
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.byteLength
    })
  })

  it('returns null when the file does not exist', async () => {
    expect(await hashLocalFileSha256(join(dir, 'missing.bin'))).toBeNull()
  })
})
