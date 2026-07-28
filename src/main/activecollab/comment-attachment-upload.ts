// Getting local files onto an ActiveCollab comment.
//
// ActiveCollab has exactly one route that accepts a file — `POST /upload-files` — and it answers
// with an upload CODE per file. Every other route attaches by quoting those codes, so a comment
// with attachments is always two calls IN THIS ORDER: upload, then post. `mutations.ts::postComment`
// is the second half.
//
// HTTP 200 IS NOT SUCCESS HERE. Handed a badly encoded multipart request, a self-hosted instance
// answers 200 with a body of `[]` — no error, no code, and the attachment then vanishes without
// anything failing (stackoverflow.com/questions/75594560, reported against 7.3 self-hosted; the
// instance this ships against is 8.0.31). Every response is therefore checked for one record
// carrying a non-empty `code`, and anything else is a refusal, not a success.
//
// The bytes are read HERE, in main, from a path the user chose, and never cross IPC: base64 through
// the bridge inflates a payload by a third and holds the whole file in two processes — the same
// reason attachment-download.ts spools the other direction straight to disk.

import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import type {
  ActiveCollabStagedFile,
  ActiveCollabUploadedFile
} from '../../shared/activecollab-api-types'
import { acIsRecord } from './codecs'
import { ActiveCollabAttachmentError } from './attachment-image'
import type { AcHttpClient } from './http'
import { AC_UPLOAD_FILE_FIELD } from './multipart'

/**
 * 64 MiB per file. Comfortably above the screenshots, mockups and archives a comment actually
 * carries, and low enough that one upload's bytes are a bounded allocation in main. Checked twice:
 * against `stat` so an oversized file is refused before it is read at all, and again against the
 * bytes ACTUALLY read, because a file can grow between the two.
 */
export const AC_MAX_COMMENT_ATTACHMENT_BYTES = 64 * 1024 * 1024

/**
 * 128 MiB across one comment. A per-file cap alone would let fifty files at the limit through, and
 * every one of them is buffered and posted before the comment lands.
 */
export const AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES = 128 * 1024 * 1024

/** One request per file, so this is also the request count a single post can spend. */
export const AC_MAX_COMMENT_ATTACHMENTS = 20

// Only what a comment plausibly carries; anything else travels as a generic stream and
// ActiveCollab types it from the filename, which is what it does with a curl upload anyway.
const AC_ATTACHMENT_MIME_BY_EXTENSION: Record<string, string | undefined> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.txt': 'text/plain'
}

/**
 * Describe one path without reading it. A directory, a broken symlink and a permission refusal all
 * answer `unreadable` rather than throwing: the caller is describing a whole drop, and one bad
 * entry must not cost the user the rest of the gesture.
 */
async function describeOne(path: string): Promise<ActiveCollabStagedFile> {
  const name = basename(path)
  try {
    const info = await stat(path)
    if (!info.isFile()) {
      return { path, name, size: 0, rejected: 'unreadable' }
    }
    return {
      path,
      name,
      size: info.size,
      rejected: info.size > AC_MAX_COMMENT_ATTACHMENT_BYTES ? 'too-large' : null
    }
  } catch {
    return { path, name, size: 0, rejected: 'unreadable' }
  }
}

export function describeAcCommentAttachments(
  paths: readonly string[]
): Promise<ActiveCollabStagedFile[]> {
  return Promise.all(paths.map(describeOne))
}

/**
 * The upload code the instance minted, or a refusal.
 *
 * One part went up, so exactly one record must come back wearing a code. An empty array is the
 * documented self-hosted symptom of a request the instance could not read; a record without a code
 * is the same failure wearing a body. Neither is allowed to look like success.
 */
function acUploadCode(payload: unknown, fileName: string): string {
  const records = Array.isArray(payload) ? payload : []
  if (records.length !== 1) {
    throw new ActiveCollabAttachmentError(
      `ActiveCollab rejected the upload of "${fileName}": it accepted the request but returned ` +
        `${records.length} upload records instead of 1.`
    )
  }
  const first = records[0]
  const code = acIsRecord(first) && typeof first.code === 'string' ? first.code.trim() : ''
  if (code === '') {
    throw new ActiveCollabAttachmentError(
      `ActiveCollab rejected the upload of "${fileName}": it accepted the request but returned no ` +
        'upload code.'
    )
  }
  return code
}

/** Refuse the whole batch before a single byte is read. */
function assertUploadable(staged: readonly ActiveCollabStagedFile[]): void {
  if (staged.length > AC_MAX_COMMENT_ATTACHMENTS) {
    throw new ActiveCollabAttachmentError(
      `A comment can carry at most ${AC_MAX_COMMENT_ATTACHMENTS} attachments.`
    )
  }
  for (const file of staged) {
    if (file.rejected === 'too-large') {
      throw new ActiveCollabAttachmentError(
        `"${file.name}" is ${file.size} bytes, past the ${AC_MAX_COMMENT_ATTACHMENT_BYTES}-byte limit for one attachment.`
      )
    }
    if (file.rejected !== null) {
      throw new ActiveCollabAttachmentError(`"${file.name}" could not be read from disk.`)
    }
  }
  const total = staged.reduce((sum, file) => sum + file.size, 0)
  if (total > AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES) {
    throw new ActiveCollabAttachmentError(
      `Those attachments total ${total} bytes, past the ${AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES}-byte limit for one comment.`
    )
  }
}

/**
 * Upload every path, in order, answering one code per file.
 *
 * Sequential rather than parallel: the ceilings are enforced against a running total of the bytes
 * actually READ, which only means anything if a file is read after the ones before it have been
 * counted. It also keeps peak memory at one file rather than all of them.
 */
export async function uploadAcCommentAttachments(args: {
  http: AcHttpClient
  paths: readonly string[]
}): Promise<ActiveCollabUploadedFile[]> {
  const staged = await describeAcCommentAttachments(args.paths)
  assertUploadable(staged)

  const uploaded: ActiveCollabUploadedFile[] = []
  let total = 0
  for (const file of staged) {
    const bytes = await readFile(file.path)
    total += bytes.byteLength
    // Re-checked on what arrived, not on what `stat` promised: the file may have grown since.
    if (bytes.byteLength > AC_MAX_COMMENT_ATTACHMENT_BYTES) {
      throw new ActiveCollabAttachmentError(
        `"${file.name}" grew past the ${AC_MAX_COMMENT_ATTACHMENT_BYTES}-byte limit for one attachment while it was being read.`
      )
    }
    if (total > AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES) {
      throw new ActiveCollabAttachmentError(
        `Those attachments grew past the ${AC_MAX_COMMENT_ATTACHMENT_TOTAL_BYTES}-byte limit for one comment while they were being read.`
      )
    }
    const response = await args.http.request<unknown>('upload-files', {
      method: 'POST',
      multipart: [
        {
          field: AC_UPLOAD_FILE_FIELD,
          fileName: file.name,
          mimeType:
            AC_ATTACHMENT_MIME_BY_EXTENSION[extname(file.name).toLowerCase()] ??
            'application/octet-stream',
          bytes
        }
      ]
    })
    uploaded.push({
      path: file.path,
      name: file.name,
      size: bytes.byteLength,
      code: acUploadCode(response.data, file.name)
    })
  }
  return uploaded
}
