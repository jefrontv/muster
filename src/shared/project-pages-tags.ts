// #tags in page markdown, Obsidian style: #word or #nested/word, at least one non-digit.

const TAG_BODY = '[\\p{L}\\p{N}_][\\p{L}\\p{N}_/-]{0,48}'
/** Matches a tag with the character before it, so a word or URL fragment never counts. */
export const TAG_PATTERN = new RegExp(`(^|[^\\p{L}\\p{N}_&/#\\]])#(${TAG_BODY})`, 'gu')

export type PageTag = { key: string; label: string }

/** A tag body cleaned up, or null when it is not a tag (all digits, e.g. an issue number). */
export function tagLabel(body: string): string | null {
  const label = body.replace(/[/-]+$/, '')
  return /[^\d_/-]/u.test(label) ? label : null
}

export function tagKey(label: string): string {
  return label.toLowerCase()
}

/** Text with code, link targets and URLs blanked out, so tags are only read from prose. */
function proseOnly(markdown: string): string {
  return markdown
    .replace(/^\s{0,3}(`{3,}|~{3,})[\s\S]*?^\s{0,3}\1/gm, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\]\([^)]*\)/g, '] ')
    .replace(/<[^>\s]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
}

/** Tags in this markdown, once each, in first-seen spelling. */
export function extractTags(markdown: string): PageTag[] {
  const tags = new Map<string, PageTag>()
  for (const match of proseOnly(markdown).matchAll(TAG_PATTERN)) {
    const label = tagLabel(match[2])
    if (label && !tags.has(tagKey(label))) {
      tags.set(tagKey(label), { key: tagKey(label), label })
    }
  }
  return [...tags.values()]
}
