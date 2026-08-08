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
