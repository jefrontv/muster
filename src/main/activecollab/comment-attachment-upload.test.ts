// Hermetic: every file lives under a per-test temp directory and `fetch` is injected, so nothing
// here touches the network and nothing reads a path the test did not create.
//
// The size ceilings are exercised against REAL files rather than a stubbed `stat`. `truncate` makes
// a sparse file of any declared length for free, which is exactly what the pre-read refusal reads —
// and it keeps the test honest: if the refusal ever moved to after the read, this file would
// suddenly be pulling 192 MiB through memory.
//
// The multipart encoding is not asserted by eyeballing an object either. Each captured `RequestInit`
// is handed to a real `Request`, which serialises it the way the transport would, and the wire bytes
// are read back. That is the only check that proves what actually leaves the process — and the
// encoding is what decides whether a self-hosted instance answers with upload records or with `[]`.

import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AC_MAX_COMMENT_ATTACHMENT_BYTES,
  AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES,
  describeAcCommentAttachments,
  uploadAcCommentAttachments
} from './comment-attachment-upload'
import { createAcHttp, type AcFetch, type AcHttpClient } from './http'

const TOKEN = 'ac-secret-token-Zq7'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CODE = 'FVz6RyPOo4mwh4NUVxoPLjg0tcHuBQt8AS2ggGVv'
const UPLOAD_URL = 'https://projects.example.com/api/v1/upload-files'

let directory: string
let sent: { url: string; init: RequestInit }[]

function httpAnswering(...bodies: unknown[]): AcHttpClient {
  let call = 0
  const fetchImpl: AcFetch = async (url, init) => {
    sent.push({ url, init })
    const body = bodies[Math.min(call, bodies.length - 1)]
    call += 1
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return createAcHttp({ baseUrl: 'https://projects.example.com', token: TOKEN, fetchImpl })
}

async function write(name: string, bytes: Uint8Array): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, bytes)
  return path
}

/** A file that REPORTS `size` bytes without occupying them. */
async function sparse(name: string, size: number): Promise<string> {
  const path = await write(name, new Uint8Array(0))
  await truncate(path, size)
  return path
}

/** The bytes the transport would actually put on the wire for a captured request. */
async function wireBody(index: number): Promise<string> {
  return new Request(UPLOAD_URL, { method: 'POST', body: sent[index].init.body }).text()
}

async function refusalFrom(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('Expected the upload to be refused')
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ac-upload-'))
  sent = []
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('describeAcCommentAttachments', () => {
  it('answers a name and a real size for each path, with nothing rejected', async () => {
    const path = await write('ac.png', PNG)

    expect(await describeAcCommentAttachments([path])).toEqual([
      { path, name: 'ac.png', size: PNG.byteLength, rejected: null }
    ])
  })

  it('marks a directory and a missing path unreadable instead of losing the whole gesture', async () => {
    const good = await write('brief.pdf', PNG)

    const staged = await describeAcCommentAttachments([
      good,
      directory,
      join(directory, 'gone.zip')
    ])

    expect(staged.map((file) => file.rejected)).toEqual([null, 'unreadable', 'unreadable'])
    expect(staged[0]).toEqual({
      path: good,
      name: 'brief.pdf',
      size: PNG.byteLength,
      rejected: null
    })
  })

  it('marks a file past the per-file ceiling too-large, reporting its real size', async () => {
    const path = await sparse('huge.bin', AC_MAX_COMMENT_ATTACHMENT_BYTES + 1)

    expect(await describeAcCommentAttachments([path])).toEqual([
      { path, name: 'huge.bin', size: AC_MAX_COMMENT_ATTACHMENT_BYTES + 1, rejected: 'too-large' }
    ])
  })
})

describe('uploadAcCommentAttachments', () => {
  it('answers one code per file, in the order given', async () => {
    const first = await write('ac.png', PNG)
    const second = await write('brief.pdf', PNG)
    const http = httpAnswering(
      [{ code: CODE, name: 'ac.png', mime_type: 'image/png', size: PNG.byteLength }],
      [{ code: 'second-code', name: 'brief.pdf' }]
    )

    const uploaded = await uploadAcCommentAttachments({ http, paths: [first, second] })

    expect(uploaded).toEqual([
      { path: first, name: 'ac.png', size: PNG.byteLength, code: CODE },
      { path: second, name: 'brief.pdf', size: PNG.byteLength, code: 'second-code' }
    ])
    expect(sent).toHaveLength(2)
    expect(sent[0].url).toBe(UPLOAD_URL)
    expect(sent[0].init.method).toBe('POST')
  })

  it('sends real multipart/form-data on the wire, boundary and all', async () => {
    const path = await write('ac.png', PNG)

    await uploadAcCommentAttachments({ http: httpAnswering([{ code: CODE }]), paths: [path] })

    // We must NOT name the content type ourselves: doing so drops the boundary, which is the
    // documented way to make a self-hosted instance answer 200 with `[]`.
    const headers = sent[0].init.headers as Record<string, string>
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('content-type')
    expect(headers['X-Angie-AuthApiToken']).toBe(TOKEN)
    expect(sent[0].init.body).toBeInstanceOf(FormData)

    const wire = await wireBody(0)
    expect(wire).toContain('Content-Disposition: form-data; name="file"; filename="ac.png"')
    expect(wire).toContain('Content-Type: image/png')
    // A boundary opens the body and the file's own bytes are inside it.
    expect(wire).toMatch(/^--[-\w]+\r\n/)
    expect(wire).toContain('PNG')
  })

  it('types the part from the file extension, defaulting to a generic stream', async () => {
    const path = await write('archive.wotsfas', PNG)

    await uploadAcCommentAttachments({ http: httpAnswering([{ code: CODE }]), paths: [path] })

    expect(await wireBody(0)).toContain('Content-Type: application/octet-stream')
  })

  it('treats an HTTP 200 carrying an empty array as a refusal, never as success', async () => {
    // The self-hosted symptom this module exists to catch: 200, no error, no code, and an
    // attachment that silently never existed.
    const path = await write('ac.png', PNG)

    const message = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([]), paths: [path] })
    )

    expect(message).toContain('rejected the upload of "ac.png"')
    expect(message).toContain('0 upload records')
  })

  it('treats a record with no code, and a blank code, as refusals', async () => {
    const path = await write('ac.png', PNG)

    const missing = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([{ name: 'ac.png' }]), paths: [path] })
    )
    const blank = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([{ code: '   ' }]), paths: [path] })
    )

    expect(missing).toContain('rejected the upload of "ac.png"')
    expect(missing).toContain('no upload code')
    expect(blank).toContain('no upload code')
  })

  it('refuses a file past the per-file ceiling BEFORE anything is read or sent', async () => {
    const path = await sparse('huge.bin', AC_MAX_COMMENT_ATTACHMENT_BYTES + 1)

    const message = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([{ code: CODE }]), paths: [path] })
    )

    expect(message).toContain('"huge.bin"')
    expect(message).toContain(String(AC_MAX_COMMENT_ATTACHMENT_BYTES))
    expect(sent).toHaveLength(0)
  })

  it('refuses a batch past the per-comment ceiling before any of it is sent', async () => {
    // Three files, each inside the per-file ceiling, together past the per-comment one: the case a
    // per-file cap alone would wave straight through.
    const paths = await Promise.all(
      ['a.bin', 'b.bin', 'c.bin'].map((name) => sparse(name, AC_MAX_COMMENT_ATTACHMENT_BYTES))
    )

    const message = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([{ code: CODE }]), paths })
    )

    expect(message).toContain(String(AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES))
    expect(sent).toHaveLength(0)
  })

  it('refuses an unreadable path rather than uploading the readable half of the batch', async () => {
    const good = await write('ac.png', PNG)

    const message = await refusalFrom(() =>
      uploadAcCommentAttachments({
        http: httpAnswering([{ code: CODE }]),
        paths: [good, join(directory, 'gone.zip')]
      })
    )

    expect(message).toContain('"gone.zip" could not be read')
    expect(sent).toHaveLength(0)
  })

  it('stops on the first refusal instead of uploading the rest of the batch', async () => {
    const first = await write('ac.png', PNG)
    const second = await write('brief.pdf', PNG)

    await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([]), paths: [first, second] })
    )

    expect(sent).toHaveLength(1)
  })

  it('keeps the token out of the result and out of every refusal', async () => {
    const path = await write('ac.png', PNG)

    const uploaded = await uploadAcCommentAttachments({
      http: httpAnswering([{ code: CODE }]),
      paths: [path]
    })
    expect(JSON.stringify(uploaded)).not.toContain(TOKEN)

    const refused = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: httpAnswering([]), paths: [path] })
    )
    expect(refused).not.toContain(TOKEN)

    // A transport fault carries the message verbatim, which is where a token would ride along.
    const failing = createAcHttp({
      baseUrl: 'https://projects.example.com',
      token: TOKEN,
      fetchImpl: async () => {
        throw new Error(`connect ECONNREFUSED with ${TOKEN}`)
      }
    })
    const transport = await refusalFrom(() =>
      uploadAcCommentAttachments({ http: failing, paths: [path] })
    )
    expect(transport).not.toContain(TOKEN)
    expect(transport).toContain('***')
  })
})
