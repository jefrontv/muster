// Saving a non-image ActiveCollab attachment to disk.
//
// The bytes are streamed from the authenticated endpoint straight into a file HERE, in main, and
// never cross IPC. This deliberately does NOT reuse the inline path in attachment-image.ts: base64
// through the bridge inflates a payload by a third and holds it whole in two processes, and that
// module's 12 MiB image cap would refuse an ordinary .zip.
//
// Auth is the same `X-Angie-AuthApiToken` header the image read uses. The signed `download_url` in
// attachment metadata is still refused for the same reason it always was — it carries a literal
// `--DOWNLOAD-TOKEN--` sentinel that only resolves once the raw API token sits in a query string.

import { randomUUID } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { dirname, extname, join, posix, resolve } from 'node:path'

import { sanitizeLocalDownloadFilename } from '../local-download-filename'
import { ActiveCollabAttachmentError } from './attachment-image'
import type { AcHttpClient } from './http'

/**
 * 2 GiB. Not a product limit — no ActiveCollab attachment comes close — but an unbounded stream
 * from a wedged or hostile instance must not be able to fill the user's disk. Counted against the
 * bytes that ACTUALLY arrive, never a declared `size` or Content-Length, and crossing it FAILS the
 * transfer: the part file is removed rather than promoted, so nobody is left holding a truncated
 * archive that looks complete.
 */
export const AC_MAX_ATTACHMENT_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024

/** Room for any real attachment name, short enough to keep the save dialog legible. */
const AC_MAX_ATTACHMENT_FILENAME = 120

/**
 * An attachment name is attacker-influenced text from a third-party server, so it is reduced to a
 * bare basename before the house sanitiser runs.
 *
 * Backslashes are folded to `/` first and `posix.basename` is used on the result: plain `basename`
 * on a POSIX host treats `..\..\evil` as one filename, and this must behave the same everywhere.
 * The sanitiser then handles control characters and NUL, the Windows-illegal set, trailing dots and
 * spaces, and reserved device names, and answers `download` when nothing usable survives.
 */
export function acAttachmentFileName(name: string): string {
  const bare = posix.basename(name.replace(/\\/g, '/').replace(/\/+$/, '')).trim()
  // Truncating keeps the extension so the OS still recognises the file.
  const extension = extname(bare).slice(0, 16)
  const capped =
    bare.length <= AC_MAX_ATTACHMENT_FILENAME
      ? bare
      : `${bare.slice(0, AC_MAX_ATTACHMENT_FILENAME - extension.length)}${extension}`
  return sanitizeLocalDownloadFilename(capped)
}

/**
 * The seed the save dialog opens on: the sanitised name inside `directory`.
 *
 * The containment check is belt and braces — `acAttachmentFileName` leaves no separator behind —
 * because this is the single place where a remote name becomes a path, and a silent escape here
 * would retarget the dialog at a directory the user never chose.
 */
export function acAttachmentSavePath(directory: string, name: string): string {
  const parent = resolve(directory)
  const target = resolve(parent, acAttachmentFileName(name))
  if (dirname(target) !== parent) {
    throw new ActiveCollabAttachmentError(
      'That attachment name does not resolve inside the download directory.'
    )
  }
  return target
}

/**
 * Drain the body into `partPath` one chunk at a time, so peak memory is one chunk rather than the
 * whole file. Bounded on bytes RECEIVED, matching the discipline the inline read uses.
 */
async function spoolToFile(
  body: ReadableStream<Uint8Array> | null,
  partPath: string,
  maxBytes: number
): Promise<number> {
  // `wx`: a part path that already exists is a collision to fail on, never something to clobber.
  const handle = await open(partPath, 'wx')
  const reader = body?.getReader() ?? null
  let total = 0
  try {
    while (reader !== null) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      total += chunk.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new ActiveCollabAttachmentError(
          `Attachment is larger than the ${maxBytes}-byte download limit.`
        )
      }
      await handle.write(chunk.value)
    }
  } finally {
    reader?.releaseLock()
    await handle.close()
  }
  return total
}

/**
 * Fetch one attachment into `destinationPath`, answering the number of bytes written.
 *
 * Nothing partial is ever visible at the destination: the transfer lands in a hidden sibling part
 * file and is promoted by a single rename only once every byte is on disk. A failure — transport,
 * size cap, empty body — removes the part file and leaves whatever was already at the destination
 * untouched.
 */
export async function downloadAcAttachment(args: {
  http: AcHttpClient
  attachmentId: number
  destinationPath: string
  maxBytes?: number
}): Promise<number> {
  const { body } = await args.http.requestStream(`attachments/${args.attachmentId}/download`)
  // A sibling of the destination so the promoting rename stays on one volume.
  const partPath = join(dirname(args.destinationPath), `.${randomUUID()}.acdownload`)
  try {
    const written = await spoolToFile(
      body,
      partPath,
      args.maxBytes ?? AC_MAX_ATTACHMENT_DOWNLOAD_BYTES
    )
    if (written === 0) {
      throw new ActiveCollabAttachmentError(`Attachment ${args.attachmentId} came back empty.`)
    }
    await rename(partPath, args.destinationPath)
    return written
  } catch (error) {
    await rm(partPath, { force: true }).catch(() => {})
    throw error
  }
}
