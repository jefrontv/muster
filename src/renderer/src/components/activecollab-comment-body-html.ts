// Turning the composer's document into the HTML ActiveCollab stores.
//
// The READ and WRITE formats for a mention are DIFFERENT, and only one of them notifies anybody.
// The server hands back `<span class="mention mention-user">Name</span>`; POSTing that same markup
// produces inert text and pings nobody. A mention that actually reaches a person has to be written
// as `<span class="new_mention" data-user-id="ID" data-type="user">Name</span>` — the contract
// quoted from the ActiveCollab server source by the reference client
// (active-collab-notifications, CollabBarCore/ACClient.swift:222).
//
// This emits by explicit case over the ProseMirror document rather than reserialising
// `editor.getHTML()`. Two reasons. A rich editor can hold more than ActiveCollab renders, and this
// body is posted to a shared instance other people read, so the output tag set has to be a closed
// list somebody can read off the page — see ACTIVECOLLAB_COMMENT_ALLOWED_TAGS. And every string
// that reaches the output goes through `escapeCommentHtml` on the way, so a typed `<b>`, a display
// name containing markup, and a pasted attribute are all text by construction rather than by a
// sanitiser's opinion.
//
// dompurify was evaluated as a belt-and-braces final pass and rejected: under this repo's happy-dom
// test environment it silently no-ops (it left `<h1>` and a `javascript:` href intact at v3.4.12),
// so the emitted string would differ between test and Chromium. A wire format whose exact bytes
// cannot be pinned by a test is worse than one gate that is verified.

import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model'

import {
  ACTIVECOLLAB_MENTION_NODE_NAME,
  readActiveCollabMentionAttributes
} from './activecollab-comment-mention-node'

/**
 * Every tag this module can emit. Paragraphs and breaks for structure, `strong`/`em` for the two
 * emphases the composer offers, `a` for links, and `span` solely for the mention. Nothing else can
 * be produced: unknown nodes contribute their children or nothing at all.
 */
export const ACTIVECOLLAB_COMMENT_ALLOWED_TAGS = ['a', 'br', 'em', 'p', 'span', 'strong'] as const

/** Every attribute this module can emit. `class` is only ever the literal `new_mention`. */
export const ACTIVECOLLAB_COMMENT_ALLOWED_ATTRIBUTES = [
  'class',
  'data-type',
  'data-user-id',
  'href'
] as const

const SAFE_LINK_PROTOCOLS: Record<string, true> = {
  'http:': true,
  'https:': true,
  'mailto:': true
}

/**
 * Only used to give the URL parser something to resolve a relative href against, so `/tasks/1`
 * still reads as http(s). Never emitted — the author's original href is what gets posted.
 */
const LINK_RESOLUTION_BASE = 'https://activecollab.invalid/'

function escapeCommentHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The author's href if it addresses something a browser may navigate to, else null.
 *
 * Parsed rather than pattern-matched because the danger is entirely in the scheme and the scheme is
 * exactly what obfuscation attacks: `java\tscript:` and a leading control character both survive a
 * regex and both collapse to `javascript:` in the URL parser, which is the thing that will actually
 * decide what the href means.
 */
export function safeActiveCollabCommentHref(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }
  try {
    if (SAFE_LINK_PROTOCOLS[new URL(trimmed, LINK_RESOLUTION_BASE).protocol] !== true) {
      return null
    }
  } catch {
    return null
  }
  return trimmed
}

/**
 * An unaddressable mention degrades to its plain name rather than to a span pointing at nobody:
 * the author's words survive, and the instance never stores a mention that notifies no one.
 */
function serializeMention(node: ProseMirrorNode): string {
  const { userId, name } = readActiveCollabMentionAttributes(node)
  const escaped = escapeCommentHtml(name)
  if (userId === 0) {
    return escaped
  }
  return `<span class="new_mention" data-user-id="${userId}" data-type="user">${escaped}</span>`
}

/**
 * Fixed nesting, innermost first, so the same marks always produce the same bytes: `em` inside
 * `strong` inside `a`. An unsafe href drops the anchor and keeps the label — losing a link is
 * recoverable, posting a `javascript:` one to a shared instance is not.
 */
function wrapCommentMarks(html: string, marks: readonly Mark[]): string {
  let wrapped = html
  if (marks.some((mark) => mark.type.name === 'italic')) {
    wrapped = `<em>${wrapped}</em>`
  }
  if (marks.some((mark) => mark.type.name === 'bold')) {
    wrapped = `<strong>${wrapped}</strong>`
  }
  const href = safeActiveCollabCommentHref(
    marks.find((mark) => mark.type.name === 'link')?.attrs.href
  )
  return href === null ? wrapped : `<a href="${escapeCommentHtml(href)}">${wrapped}</a>`
}

function serializeInline(node: ProseMirrorNode): string {
  if (node.isText) {
    return wrapCommentMarks(escapeCommentHtml(node.text ?? ''), node.marks)
  }
  if (node.type.name === ACTIVECOLLAB_MENTION_NODE_NAME) {
    return wrapCommentMarks(serializeMention(node), node.marks)
  }
  if (node.type.name === 'hardBreak') {
    return '<br>'
  }
  // Anything else emits nothing. The schema should make this unreachable; it is the backstop for
  // when it does not.
  return ''
}

/**
 * The comment body as ActiveCollab stores it.
 *
 * Blank paragraphs are dropped rather than posted as `<p></p>`: they are the author pressing Enter,
 * not content, and the instance renders them as stray gaps in the thread. Each paragraph's edges
 * are trimmed for the same reason the old plain-text composer trimmed its draft — a trailing space
 * left behind by accepting a mention is not something anybody typed on purpose.
 */
export function activeCollabCommentBodyHtml(doc: ProseMirrorNode): string {
  const paragraphs: string[] = []
  doc.forEach((block) => {
    if (block.type.name !== 'paragraph') {
      return
    }
    let inner = ''
    block.forEach((child) => {
      inner += serializeInline(child)
    })
    const trimmed = inner.trim()
    if (trimmed !== '') {
      paragraphs.push(`<p>${trimmed}</p>`)
    }
  })
  return paragraphs.join('')
}
