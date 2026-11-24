// File and link naming for moving pages in and out of plain markdown folders.

const UNSAFE = /[<>:"/\\|?*]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const NOTION_ID = /\s+[0-9a-f]{32}$/i
const MARKDOWN_LINK = /(\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g

/** A title made safe as a file name on every platform. */
export function safeFileName(title: string): string {
  const printable = [...title].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')
  let name = printable.replace(UNSAFE, '-').replace(/\s+/g, ' ').trim().slice(0, 100)
  name = name.replace(/[. ]+$/, '')
  if (!name) {
    name = 'Untitled'
  }
  return RESERVED.test(name) ? `${name}_` : name
}

/** The name, or the name with " (2)" and up when a sibling already has it; case-insensitive. */
export function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    candidate = `${name} (${i})`
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

/** Page title from an imported file or folder name, without the id Notion appends. */
export function titleFromImportName(fileName: string): string {
  return fileName.replace(/\.md$/i, '').replace(NOTION_ID, '').trim() || 'Untitled'
}

/** Rewrites the target of every inline markdown link; return null to keep a link as it is. */
export function rewriteMarkdownLinks(
  markdown: string,
  rewrite: (href: string) => string | null
): string {
  return markdown.replace(MARKDOWN_LINK, (whole, open: string, href: string, close: string) => {
    const bare = href.startsWith('<') ? href.slice(1, -1) : href
    const next = rewrite(bare)
    return next === null ? whole : `${open}${next}${close}`
  })
}

/** A relative path as a link target: forward slashes, spaces and brackets encoded. */
export function linkPath(relative: string): string {
  return relative
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/%2E/g, '.'))
    .join('/')
}
