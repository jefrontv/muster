// Display-side parsing of composer @-references. Sends carry attached files as
// `@"path"` / `@/path` tokens in the prompt text (that's what the agent reads);
// the chat surface lifts them back out so a sent message shows attachment chips
// instead of raw paths.

const QUOTED_REFERENCE = /(^|\s)@"((?:[^"\\]|\\.)+)"/g
const BARE_REFERENCE = /(^|\s)@((?:\/|~\/)[^\s"]+)/g

export type NativeChatParsedFileReferences = {
  /** Referenced paths, in order of appearance. */
  files: string[]
  /** The prompt text with the references removed — the chips carry the files. */
  text: string
}

// Image attachments ride chat-thread sends as base64 blocks, which carry no
// filesystem identity — the agent can see the image but cannot attach, move,
// or reference the file. This note line gives it the path; the chat surface
// strips it (the thumbnail already shows the image).
const IMAGE_PATH_NOTE_RE = /^\[attached image: .*\]$/gm

export function formatNativeChatImagePathNote(path: string): string {
  return `[attached image: ${path}]`
}

export function stripNativeChatImagePathNotes(text: string): string {
  if (!text.includes('[attached image: ')) {
    return text
  }
  return text
    .replace(IMAGE_PATH_NOTE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseNativeChatFileReferences(text: string): NativeChatParsedFileReferences {
  const files: string[] = []
  let next = text.replace(QUOTED_REFERENCE, (_match, lead: string, escaped: string) => {
    files.push(escaped.replace(/\\"/g, '"'))
    return lead
  })
  next = next.replace(BARE_REFERENCE, (_match, lead: string, path: string) => {
    files.push(path)
    return lead
  })
  if (files.length === 0) {
    return { files, text }
  }
  return { files, text: next.replace(/[^\S\n]{2,}/g, ' ').trim() }
}
