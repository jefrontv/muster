// User-turn content for the chat stream. Image attachments ride the message as
// base64 content blocks (the API shape headless Claude accepts) instead of the
// PTY path-paste trick — a headless child has no terminal to paste into.

import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

/** API hard limit is ~5MB per image; stop earlier so base64 inflation fits. */
export const CHAT_STREAM_IMAGE_MAX_BYTES = 4 * 1024 * 1024

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export function chatStreamImageMediaType(path: string): string | null {
  return IMAGE_MEDIA_TYPES[extname(path).toLowerCase()] ?? null
}

export type ChatStreamContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

/** Pure assembly: images first (matches how the TUI orders pasted images), then
 *  the text block when non-empty. */
export function buildChatStreamUserContent(
  text: string,
  images: { mediaType: string; dataBase64: string }[]
): ChatStreamContentBlock[] {
  return [
    ...images.map((image) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.dataBase64 }
    })),
    ...(text.trim() !== '' ? [{ type: 'text' as const, text }] : [])
  ]
}

/** Read attachment paths into base64 image payloads. Unsupported extensions,
 *  oversized files, and read failures are skipped (reported back by path) so
 *  one bad file never blocks the send. */
export async function readChatStreamImages(
  paths: readonly string[]
): Promise<{ images: { mediaType: string; dataBase64: string }[]; skipped: string[] }> {
  const images: { mediaType: string; dataBase64: string }[] = []
  const skipped: string[] = []
  for (const path of paths) {
    const mediaType = chatStreamImageMediaType(path)
    if (!mediaType) {
      skipped.push(path)
      continue
    }
    try {
      const info = await stat(path)
      if (info.size > CHAT_STREAM_IMAGE_MAX_BYTES) {
        skipped.push(path)
        continue
      }
      images.push({ mediaType, dataBase64: (await readFile(path)).toString('base64') })
    } catch {
      skipped.push(path)
    }
  }
  return { images, skipped }
}
