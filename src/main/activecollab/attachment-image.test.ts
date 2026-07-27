import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  AC_MAX_ATTACHMENT_IMAGE_BYTES,
  ActiveCollabAttachmentError,
  getAttachmentImage
} from './attachment-image'
import { ActiveCollabApiError, createAcHttp, type AcFetch, type AcHttpClient } from './http'

const BASE = 'https://projects.efront.com.au'
// Distinctive on purpose: no other string here contains it, so "the token leaked" cannot pass by
// coincidence.
const TOKEN = 'ac-secret-token-Zq7'

// A real PNG signature plus bytes that survive neither UTF-8 nor JSON round-tripping, so a
// base64 that merely "looks right" cannot pass.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7f])

const MIB = 1024 * 1024

type Call = { url: string; init: RequestInit }

type Stub = { calls: Call[]; http: AcHttpClient }

function stubHttp(respond: () => Response): Stub {
  const calls: Call[] = []
  const fetchImpl: AcFetch = async (url, init) => {
    calls.push({ url, init })
    return respond()
  }
  return { calls, http: createAcHttp({ baseUrl: BASE, token: TOKEN, fetchImpl }) }
}

type CountingBody = { response: Response; pulls: () => number; cancelled: () => boolean }

/**
 * A body that reports how far it was read. `highWaterMark: 0` suppresses the spec's eager
 * pre-fill, so a pull count of zero really does mean "not one byte was buffered".
 */
function countingBody(chunk: Uint8Array, mimeType: string, extra?: HeadersInit): CountingBody {
  let pulls = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      }
    },
    { highWaterMark: 0 }
  )
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'content-type': mimeType, ...extra }
    }),
    pulls: () => pulls,
    cancelled: () => cancelled
  }
}

function decode(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  return new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), 'base64'))
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('Expected the call to reject')
}

describe('getAttachmentImage', () => {
  it('reads the authenticated download endpoint and inlines the bytes as a data URL', async () => {
    const stub = stubHttp(
      () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
    )

    const image = await getAttachmentImage({ http: stub.http, attachmentId: 249087 })

    expect(image.mimeType).toBe('image/png')
    expect(image.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    // The bytes must survive the round trip exactly; a truncated or re-encoded body is a broken
    // image the renderer cannot detect.
    expect(decode(image.dataUrl)).toEqual(PNG)
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0].url).toBe(`${BASE}/api/v1/attachments/249087/download`)
    // Strategy 1 from the reference client: the plain auth header, no signed URL.
    const headers = stub.calls[0].init.headers as Record<string, string>
    expect(headers['X-Angie-AuthApiToken']).toBe(TOKEN)
    expect(headers.Accept).toBe('*/*')
  })

  it('names the mime type from the essence, dropping Content-Type parameters and case', async () => {
    const stub = stubHttp(
      () =>
        new Response(PNG, {
          status: 200,
          headers: { 'content-type': 'image/JPEG; charset=binary' }
        })
    )

    const image = await getAttachmentImage({ http: stub.http, attachmentId: 249086 })

    expect(image.mimeType).toBe('image/jpeg')
    expect(image.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('refuses a non-image without buffering a single body byte', async () => {
    const body = countingBody(new Uint8Array(MIB), 'application/pdf')
    const stub = stubHttp(() => body.response)

    const error = await rejection(getAttachmentImage({ http: stub.http, attachmentId: 7 }))

    expect(error).toBeInstanceOf(ActiveCollabAttachmentError)
    expect(error.message).toContain('not an inlineable image')
    expect(error.message).toContain('application/pdf')
    // The whole point of checking the header first: a 200 MB PDF must cost nothing to reject.
    expect(body.pulls()).toBe(0)
    expect(body.cancelled()).toBe(true)
  })

  it('refuses a body that outgrows the cap and stops pulling instead of buffering it', async () => {
    // One shared buffer, enqueued repeatedly: an endless body the reader has to walk away from.
    const body = countingBody(new Uint8Array(MIB), 'image/jpeg')
    const stub = stubHttp(() => body.response)

    const error = await rejection(getAttachmentImage({ http: stub.http, attachmentId: 8 }))

    expect(error).toBeInstanceOf(ActiveCollabAttachmentError)
    expect(error.message).toContain(`${AC_MAX_ATTACHMENT_IMAGE_BYTES}-byte inline limit`)
    // Stops one chunk past the cap rather than draining a stream that never ends.
    expect(body.pulls()).toBe(AC_MAX_ATTACHMENT_IMAGE_BYTES / MIB + 1)
    expect(body.cancelled()).toBe(true)
  })

  it('caps on the bytes that arrive, not on a Content-Length that lies', async () => {
    // The header swears this is an 11-byte thumbnail; the stream never stops.
    const body = countingBody(new Uint8Array(MIB), 'image/png', { 'content-length': '11' })
    const stub = stubHttp(() => body.response)

    const error = await rejection(getAttachmentImage({ http: stub.http, attachmentId: 9 }))

    expect(error).toBeInstanceOf(ActiveCollabAttachmentError)
    expect(error.message).toContain('inline limit')
    expect(body.pulls()).toBe(AC_MAX_ATTACHMENT_IMAGE_BYTES / MIB + 1)
  })

  it('refuses an empty body rather than emitting a data URL with no payload', async () => {
    const stub = stubHttp(
      () =>
        new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'image/png' } })
    )

    const error = await rejection(getAttachmentImage({ http: stub.http, attachmentId: 10 }))

    expect(error).toBeInstanceOf(ActiveCollabAttachmentError)
    expect(error.message).toContain('came back empty')
  })

  it('reports a rejected token as an auth error, not a policy refusal', async () => {
    const stub = stubHttp(
      () =>
        new Response(JSON.stringify({ message: 'Authentication failed' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
    )

    const error = await rejection(getAttachmentImage({ http: stub.http, attachmentId: 11 }))

    expect(error).toBeInstanceOf(ActiveCollabApiError)
    expect((error as ActiveCollabApiError).status).toBe(401)
    expect((error as ActiveCollabApiError).isAuthError).toBe(true)
  })

  it('keeps the token out of the returned value and out of every error message', async () => {
    const success = stubHttp(
      () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
    )
    const image = await getAttachmentImage({ http: success.http, attachmentId: 12 })
    expect(JSON.stringify(image)).not.toContain(TOKEN)

    // The instance itself echoing the token back is the one path redaction has to catch.
    const echoed = stubHttp(
      () =>
        new Response(JSON.stringify({ message: `Invalid token ${TOKEN} on this instance` }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
    )
    const authError = await rejection(getAttachmentImage({ http: echoed.http, attachmentId: 13 }))
    expect(authError.message).not.toContain(TOKEN)
    expect(authError.message).toContain('***')

    const refused = stubHttp(
      () =>
        new Response(new Uint8Array(4), { status: 200, headers: { 'content-type': 'video/mp4' } })
    )
    const policyError = await rejection(
      getAttachmentImage({ http: refused.http, attachmentId: 14 })
    )
    expect(policyError.message).not.toContain(TOKEN)
  })
})
