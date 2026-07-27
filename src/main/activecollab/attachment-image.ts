// Inlining an ActiveCollab image attachment.
//
// The bytes are fetched HERE, in main, and handed to the renderer as a data URL. The reference
// client tries the API endpoint first and then falls back to the signed URLs in attachment
// metadata; those fallbacks are deliberately NOT implemented:
//   - `download_url`, `preview_url` and `thumbnail_url` each carry a literal `--DOWNLOAD-TOKEN--`
//     sentinel that only becomes a working URL once the raw API token is pasted into it. Every one
//     of them therefore ends with the credential in a URL — the exact exposure this design exists
//     to prevent — and a fetch that fails still leaves the token in whatever logged the attempt.
//   - `GET attachments/{id}/download` with the normal auth header is verified working first-try on
//     the target instance, so the fallbacks would be dead code guarding a case we have never seen.
// If a future instance really does reject header auth, the honest fix is a signed-URL endpoint,
// not smuggling the token through a query string.

import { Buffer } from 'node:buffer'
import type { ActiveCollabAttachmentImage } from '../../shared/activecollab-api-types'
import { AC_INLINE_IMAGE_MIME } from './codecs'
import type { AcHttpClient } from './http'

/**
 * 12 MiB — comfortably above a pasted screenshot (a few hundred KB) or a full-resolution phone
 * photo (~5 MB), and far below a video or a layered design file. Enforced against the bytes that
 * actually arrive, never against the declared `size` or a Content-Length either of which can lie.
 */
export const AC_MAX_ATTACHMENT_IMAGE_BYTES = 12 * 1024 * 1024

/** A policy refusal, never a transport fault — mapped to an `invalid-request` failure. */
export class ActiveCollabAttachmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActiveCollabAttachmentError'
  }
}

export async function getAttachmentImage(args: {
  http: AcHttpClient
  attachmentId: number
}): Promise<ActiveCollabAttachmentImage> {
  const response = await args.http.requestBinary(`attachments/${args.attachmentId}/download`, {
    maxBytes: AC_MAX_ATTACHMENT_IMAGE_BYTES,
    acceptMime: (mimeType) => AC_INLINE_IMAGE_MIME[mimeType] === true
  })
  if (!response.ok) {
    throw new ActiveCollabAttachmentError(
      response.reason === 'too-large'
        ? `Attachment ${args.attachmentId} is larger than the ${AC_MAX_ATTACHMENT_IMAGE_BYTES}-byte inline limit.`
        : `Attachment ${args.attachmentId} is ${response.mimeType || 'of an unknown type'}, which is not an inlineable image.`
    )
  }
  if (response.bytes.byteLength === 0) {
    throw new ActiveCollabAttachmentError(`Attachment ${args.attachmentId} came back empty.`)
  }
  // A Buffer VIEW, not a copy: base64 already doubles the payload. The mime type came off the
  // allowlist, so it cannot carry a `;` or otherwise break out of the data-URL preamble.
  const base64 = Buffer.from(
    response.bytes.buffer,
    response.bytes.byteOffset,
    response.bytes.byteLength
  ).toString('base64')
  return { dataUrl: `data:${response.mimeType};base64,${base64}`, mimeType: response.mimeType }
}
