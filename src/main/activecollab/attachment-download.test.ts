// Hermetic: the HTTP layer is a stub `fetchImpl`, and every write lands in a per-test temp
// directory that is removed afterwards. No network, and nothing is written outside os.tmpdir().

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AC_MAX_ATTACHMENT_DOWNLOAD_BYTES,
  acAttachmentFileName,
  acAttachmentSavePath,
  downloadAcAttachment
} from './attachment-download'
import { ActiveCollabAttachmentError } from './attachment-image'
import { ActiveCollabApiError, createAcHttp, type AcFetch, type AcHttpClient } from './http'

const BASE = 'https://projects.example.com'
// Distinctive on purpose: nothing else here contains it, so "the token leaked" cannot pass by
// coincidence.
const TOKEN = 'ac-secret-token-Zq7'

// Bytes that survive neither UTF-8 nor JSON round-tripping, so a write that merely "looks right"
// cannot pass.
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x7f, 0x80, 0x0a])

let directory: string

type Call = { url: string; init: RequestInit }

function stubHttp(respond: () => Response): { calls: Call[]; http: AcHttpClient } {
  const calls: Call[] = []
  const fetchImpl: AcFetch = async (url, init) => {
    calls.push({ url, init })
    return respond()
  }
  return { calls, http: createAcHttp({ baseUrl: BASE, token: TOKEN, fetchImpl }) }
}

/** A body that hands over `chunks` and then either ends or errors, so a mid-transfer fault is real. */
function streamed(chunks: Uint8Array[], failAfter?: string): Response {
  let index = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index])
          index += 1
          return
        }
        if (failAfter !== undefined) {
          controller.error(new Error(failAfter))
          return
        }
        controller.close()
      }
    }),
    { status: 200, headers: { 'content-type': 'application/zip' } }
  )
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('Expected the call to reject')
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ac-attachment-download-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('acAttachmentFileName', () => {
  it('keeps an ordinary name intact', () => {
    expect(acAttachmentFileName('WOTS - Find a Service - 270726.xlsx')).toBe(
      'WOTS - Find a Service - 270726.xlsx'
    )
  })

  it('strips every traversal shape down to a bare basename', () => {
    expect(acAttachmentFileName('../../../etc/passwd')).toBe('passwd')
    // Backslashes are folded first, so a Windows-shaped traversal cannot survive on POSIX.
    expect(acAttachmentFileName('..\\..\\Windows\\System32\\evil.dll')).toBe('evil.dll')
    expect(acAttachmentFileName('/etc/shadow')).toBe('shadow')
    expect(acAttachmentFileName('C:\\Users\\me\\.ssh\\id_rsa')).toBe('id_rsa')
  })

  it('never answers a name that is itself a traversal token', () => {
    expect(acAttachmentFileName('..')).toBe('download')
    expect(acAttachmentFileName('.')).toBe('download')
    expect(acAttachmentFileName('')).toBe('download')
    expect(acAttachmentFileName('   ')).toBe('download')
    expect(acAttachmentFileName('../')).toBe('download')
  })

  it('replaces control characters and NUL rather than passing them to the filesystem', () => {
    const sanitized = acAttachmentFileName('re\u0000port\nnotes.zip')
    expect(sanitized).toBe('re_port_notes.zip')
    expect(sanitized).not.toContain('\u0000')
  })

  it('refuses to answer a reserved Windows device name', () => {
    expect(acAttachmentFileName('CON.txt')).toBe('download')
    expect(acAttachmentFileName('lpt1')).toBe('download')
  })

  it('caps a pathological name while keeping its extension recognisable', () => {
    const capped = acAttachmentFileName(`${'a'.repeat(4_000)}.xlsx`)
    expect(capped.length).toBeLessThanOrEqual(120)
    expect(capped.endsWith('.xlsx')).toBe(true)
  })
})

describe('acAttachmentSavePath', () => {
  it('seeds the dialog inside the download directory', () => {
    expect(acAttachmentSavePath(directory, 'brief.pdf')).toBe(join(directory, 'brief.pdf'))
  })

  it('cannot be walked out of the download directory by a traversal-shaped name', () => {
    for (const hostile of [
      '../../../etc/passwd',
      '..\\..\\evil.exe',
      '/etc/shadow',
      '....//....//escape.sh',
      'sub/dir/nested.txt'
    ]) {
      const target = acAttachmentSavePath(directory, hostile)
      expect(target.startsWith(`${directory}/`), hostile).toBe(true)
      expect(target.slice(directory.length + 1)).not.toContain('/')
    }
  })
})

describe('downloadAcAttachment', () => {
  it('streams the bytes onto disk and reports how many landed', async () => {
    const stub = stubHttp(() => streamed([ZIP.slice(0, 4), ZIP.slice(4)]))
    const destinationPath = join(directory, 'icons.zip')

    const written = await downloadAcAttachment({
      http: stub.http,
      attachmentId: 249087,
      destinationPath
    })

    expect(written).toBe(ZIP.byteLength)
    expect(new Uint8Array(await readFile(destinationPath))).toEqual(ZIP)
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0].url).toBe(`${BASE}/api/v1/attachments/249087/download`)
    // Header auth, never a tokenised query string: the signed `download_url` is deliberately unused.
    expect((stub.calls[0].init.headers as Record<string, string>)['X-Angie-AuthApiToken']).toBe(
      TOKEN
    )
    expect(stub.calls[0].url).not.toContain(TOKEN)
    // Promoted by rename: nothing partial is left beside it.
    expect(await readdir(directory)).toEqual(['icons.zip'])
  })

  /**
   * The streaming claim, proved without measuring memory: the body is inspected from inside its own
   * `pull`, so each assertion runs while the transfer is still open. A buffering implementation
   * would show an empty part file until the last chunk. `highWaterMark: 0` suppresses the spec's
   * eager pre-fill so a pull really does mean "the reader asked for the next chunk".
   */
  it('writes each chunk as it arrives, and shows nothing at the destination until it is done', async () => {
    const destinationPath = join(directory, 'icons.zip')
    const midFlight: { entries: string[]; partBytes: number }[] = []
    let pulls = 0
    const stub = stubHttp(
      () =>
        new Response(
          new ReadableStream<Uint8Array>(
            {
              async pull(controller) {
                if (pulls > 0) {
                  const entries = await readdir(directory)
                  midFlight.push({
                    entries,
                    partBytes: (await readFile(join(directory, entries[0]))).byteLength
                  })
                }
                if (pulls === 3) {
                  controller.close()
                  return
                }
                controller.enqueue(new Uint8Array(1_024))
                pulls += 1
              }
            },
            { highWaterMark: 0 }
          ),
          { status: 200, headers: { 'content-type': 'application/zip' } }
        )
    )

    const written = await downloadAcAttachment({
      http: stub.http,
      attachmentId: 9,
      destinationPath
    })

    expect(written).toBe(3_072)
    // Growing on every pull, so no chunk waited for the end of the body.
    expect(midFlight.map((sample) => sample.partBytes)).toEqual([1_024, 2_048, 3_072])
    // And the only thing on disk mid-transfer was the hidden part file, never the destination.
    for (const sample of midFlight) {
      expect(sample.entries).toHaveLength(1)
      expect(sample.entries[0].endsWith('.acdownload')).toBe(true)
    }
    expect(await readdir(directory)).toEqual(['icons.zip'])
  })

  it('leaves no partial file at the destination when the transfer dies mid-stream', async () => {
    const stub = stubHttp(() => streamed([ZIP.slice(0, 4)], 'connection reset'))
    const destinationPath = join(directory, 'icons.zip')

    await expect(
      downloadAcAttachment({ http: stub.http, attachmentId: 249087, destinationPath })
    ).rejects.toThrow('connection reset')

    // Neither the destination nor the part file survives a failure.
    expect(await readdir(directory)).toEqual([])
  })

  it('does not damage a file already at the destination when the transfer fails', async () => {
    const destinationPath = join(directory, 'icons.zip')
    await writeFile(destinationPath, 'the copy I already had')
    const stub = stubHttp(() => streamed([ZIP], 'connection reset'))

    await expect(
      downloadAcAttachment({ http: stub.http, attachmentId: 249087, destinationPath })
    ).rejects.toThrow('connection reset')

    expect(await readFile(destinationPath, 'utf8')).toBe('the copy I already had')
    expect(await readdir(directory)).toEqual(['icons.zip'])
  })

  it('replaces a file already at the destination on success', async () => {
    const destinationPath = join(directory, 'icons.zip')
    await writeFile(destinationPath, 'the stale copy')
    const stub = stubHttp(() => streamed([ZIP]))

    await downloadAcAttachment({ http: stub.http, attachmentId: 249087, destinationPath })

    expect(new Uint8Array(await readFile(destinationPath))).toEqual(ZIP)
    expect(await readdir(directory)).toEqual(['icons.zip'])
  })

  it('fails cleanly past the size ceiling rather than saving a truncated file', async () => {
    const stub = stubHttp(() => streamed([new Uint8Array(8), new Uint8Array(8)]))
    const destinationPath = join(directory, 'huge.zip')

    const error = await rejection(
      downloadAcAttachment({ http: stub.http, attachmentId: 3, destinationPath, maxBytes: 10 })
    )

    expect(error).toBeInstanceOf(ActiveCollabAttachmentError)
    expect(error.message).toContain('10-byte download limit')
    expect(await readdir(directory)).toEqual([])
  })

  it('bounds on the bytes that arrive, not on a lying Content-Length', async () => {
    const stub = stubHttp(() => {
      const response = streamed([new Uint8Array(64)])
      response.headers.set('content-length', '1')
      return response
    })

    await expect(
      downloadAcAttachment({
        http: stub.http,
        attachmentId: 4,
        destinationPath: join(directory, 'liar.zip'),
        maxBytes: 16
      })
    ).rejects.toThrow('download limit')
    expect(await readdir(directory)).toEqual([])
  })

  it('treats an empty body as a failure rather than saving a zero-byte file', async () => {
    const stub = stubHttp(
      () => new Response(null, { status: 200, headers: { 'content-type': 'application/zip' } })
    )

    const error = await rejection(
      downloadAcAttachment({
        http: stub.http,
        attachmentId: 5,
        destinationPath: join(directory, 'empty.zip')
      })
    )

    expect(error).toBeInstanceOf(ActiveCollabAttachmentError)
    expect(error.message).toContain('came back empty')
    expect(await readdir(directory)).toEqual([])
  })

  it('surfaces a rejected token as an auth error so the UI prompts a reconnect', async () => {
    const stub = stubHttp(
      () =>
        new Response(JSON.stringify({ message: 'Token expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
    )

    const error = await rejection(
      downloadAcAttachment({
        http: stub.http,
        attachmentId: 6,
        destinationPath: join(directory, 'denied.zip')
      })
    )

    expect(error).toBeInstanceOf(ActiveCollabApiError)
    expect((error as ActiveCollabApiError).status).toBe(401)
    expect((error as ActiveCollabApiError).isAuthError).toBe(true)
    expect(await readdir(directory)).toEqual([])
  })

  it('keeps the token out of every answer and every error message', async () => {
    const destinationPath = join(directory, 'ok.zip')
    const success = stubHttp(() => streamed([ZIP]))
    const written = await downloadAcAttachment({
      http: success.http,
      attachmentId: 7,
      destinationPath
    })
    expect(JSON.stringify({ written, destinationPath })).not.toContain(TOKEN)

    // The instance echoing the token back is the one path redaction has to catch.
    const echoed = stubHttp(
      () =>
        new Response(JSON.stringify({ message: `Bad token ${TOKEN}` }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
    )
    const authError = await rejection(
      downloadAcAttachment({
        http: echoed.http,
        attachmentId: 8,
        destinationPath: join(directory, 'denied.zip')
      })
    )
    expect(authError.message).not.toContain(TOKEN)
    expect(authError.message).toContain('***')
  })

  it('states a ceiling generous enough that no real attachment meets it', () => {
    expect(AC_MAX_ATTACHMENT_DOWNLOAD_BYTES).toBe(2 * 1024 * 1024 * 1024)
  })
})
