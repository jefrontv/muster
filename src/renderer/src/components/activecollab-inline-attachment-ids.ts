// Attachment ids already rendered INLINE inside an ActiveCollab body's HTML.
// The attachment grid below a body filters these out — an image embedded in
// the description showing again as a thumbnail read as a duplicate attachment.

const IMG_TAG = /<img\b[^>]*>/gi
const IMAGE_TYPE = /\bimage-type\s*=\s*["']?attachment["']?/i
const OBJECT_ID = /\bobject-id\s*=\s*["']?(\d+)["']?/i

export function inlineActiveCollabAttachmentIds(bodyHtml: string): Set<number> {
  const ids = new Set<number>()
  for (const tag of bodyHtml.match(IMG_TAG) ?? []) {
    if (!IMAGE_TYPE.test(tag)) {
      continue
    }
    const id = Number(OBJECT_ID.exec(tag)?.[1])
    if (Number.isSafeInteger(id) && id > 0) {
      ids.add(id)
    }
  }
  return ids
}

/** The grid's list with inline-rendered attachments removed. */
export function attachmentsNotInlinedInBody<T extends { id: number }>(
  attachments: readonly T[],
  bodyHtml: string
): T[] {
  const inline = inlineActiveCollabAttachmentIds(bodyHtml)
  if (inline.size === 0) {
    return [...attachments]
  }
  return attachments.filter((attachment) => !inline.has(attachment.id))
}
