// The multipart body for the one ActiveCollab route that accepts a file: `POST /upload-files`.
//
// Built as a `FormData` and handed to fetch UNSERIALISED, so the runtime picks the boundary, writes
// the matching `Content-Type` header, and escapes the filename inside each part's
// Content-Disposition. That delegation is the whole point. A hand-rolled encoder — or a caller that
// sets Content-Type itself and so loses the boundary — is exactly how a self-hosted instance ends
// up answering HTTP 200 with a body of `[]` instead of upload records: the reported fix for that
// symptom on 7.3 self-hosted was to send a real `multipart/form-data` request
// (stackoverflow.com/questions/75594560), and `file` is the field name from the request that
// worked there.

export const AC_UPLOAD_FILE_FIELD = 'file'

export type AcMultipartPart = {
  /** Form field name. ActiveCollab reads the upload off {@link AC_UPLOAD_FILE_FIELD}. */
  field: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

export function acMultipartBody(parts: readonly AcMultipartPart[]): FormData {
  const body = new FormData()
  for (const part of parts) {
    // `BlobPart` narrows a view to an ArrayBuffer-backed one. These bytes come from `fs.readFile`,
    // which never hands back a SharedArrayBuffer view, so the view goes straight through instead of
    // being copied a second time purely to satisfy the type.
    const view = part.bytes as Uint8Array<ArrayBuffer>
    // The third argument is what puts `filename=` in the part's Content-Disposition. A Blob
    // appended without one travels as the literal name "blob", and that is what gets stored.
    body.append(part.field, new Blob([view], { type: part.mimeType }), part.fileName)
  }
  return body
}
