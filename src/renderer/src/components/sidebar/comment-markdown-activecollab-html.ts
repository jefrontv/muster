// Pre-sanitise rewrite of ActiveCollab body and comment HTML.
//
// ActiveCollab marks mentions and callouts with `class`, and `commentMarkdownSanitizeSchema` strips
// `class` from every element. Widening that would hand provider HTML the app's entire utility
// vocabulary, so the classes are consumed HERE — before sanitisation — and re-emitted as
// dedicated tag names the schema allows with ZERO attributes. Inline attachment images join them:
// the `<img>` states its attachment id, so it becomes a private tag carrying that id as TEXT and
// still needs no attribute allowance. `class` stays banned everywhere, and scripts, event handlers
// and `javascript:` URLs still meet the unchanged sanitiser behind this.

/** Minted only by this module, allowed by the schema with no attributes, styled by React. */
export const ACTIVECOLLAB_MENTION_TAG = 'ac-mention'
export const ACTIVECOLLAB_CALLOUT_TAG = 'ac-callout'
/** Carries its attachment id as TEXT, so it needs no attribute allowance either. */
export const ACTIVECOLLAB_IMAGE_TAG = 'ac-image'

/** ActiveCollab hands out attachment URLs with these literal sentinels instead of an address. */
const ATTACHMENT_URL_SENTINELS = ['--DOWNLOAD-TOKEN--', '--PREVIEW-TOKEN--', '--THUMBNAIL-TOKEN--']

/** Stands in for the instance origin when the connection has not reported one yet. */
const UNKNOWN_INSTANCE_ORIGIN = 'https://activecollab.invalid'

/** ActiveCollab states the attachment id on the tag itself, so no URL is ever parsed for it. */
const ATTACHMENT_IMAGE_TYPE = 'attachment'

/** Collapsible whitespace draws no line box; U+00A0 is what keeps a blank paragraph one line tall. */
const NON_BREAKING_SPACE = '\u00a0'

export type ActiveCollabHtmlOptions = {
  /** Instance origin. Distinguishes an unauthenticable instance image from a third-party one. */
  instanceUrl: string | null
}

// Structural stand-in for hast. The walk only needs tag name, class list, `src` and children, and a
// local shape keeps this module off `@types/hast`, which the project does not depend on directly.
type HtmlNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HtmlNode[]
}

/**
 * True when an `<img>` points at the ActiveCollab instance. Those need the API token, which the
 * renderer deliberately never holds, so they can only ever paint a broken-image icon — the
 * authenticated attachment grid renders the same bytes instead. Third-party and already-inlined
 * sources are none of this module's business and are left alone.
 */
export function isUnauthenticableInstanceImage(src: unknown, instanceUrl: string | null): boolean {
  if (typeof src !== 'string') {
    return true
  }
  const value = src.trim()
  if (!value) {
    return true
  }
  const lower = value.toLowerCase()
  if (lower.startsWith('data:') || lower.startsWith('blob:')) {
    return false
  }
  if (ATTACHMENT_URL_SENTINELS.some((sentinel) => value.includes(sentinel))) {
    return true
  }
  // Resolving against the instance folds both cases into one comparison: a relative src lands on
  // the instance host, an absolute third-party src keeps its own. With no instance reported yet the
  // placeholder origin still catches relative sources without claiming a real third-party host.
  const base = instanceUrl ?? UNKNOWN_INSTANCE_ORIGIN
  try {
    return new URL(value, base).host === new URL(base).host
  } catch {
    return true
  }
}

function retagActiveCollabElement(node: HtmlNode): void {
  // `ac-*` is this module's private namespace: a provider body that ships one of those tags gets
  // demoted first, so hostile HTML cannot mint a mention chip by naming the output tag.
  if (
    node.tagName === ACTIVECOLLAB_MENTION_TAG ||
    node.tagName === ACTIVECOLLAB_CALLOUT_TAG ||
    node.tagName === ACTIVECOLLAB_IMAGE_TAG
  ) {
    node.tagName = 'span'
  }
  const rawClass = node.properties?.className
  const classes = Array.isArray(rawClass)
    ? rawClass.map(String)
    : String(rawClass ?? '').split(/\s+/)
  if (node.tagName === 'span' && classes.includes('mention')) {
    node.tagName = ACTIVECOLLAB_MENTION_TAG
    node.properties = {}
  } else if (node.tagName === 'aside' && classes.includes('callout-wrapper')) {
    node.tagName = ACTIVECOLLAB_CALLOUT_TAG
    node.properties = {}
  }
}

/**
 * Rewrites an attachment-backed `<img>` into `<ac-image>`, whose only content is `id` — or
 * `id alt` when the tag names the file. Text needs no attribute allowance, so the sanitiser gains
 * one tag name and still zero attributes, and React can read the id back and fetch the bytes over
 * the authenticated bridge. Answers false for anything without a stated attachment id.
 */
function retagAttachmentImage(node: HtmlNode): boolean {
  const properties = node.properties
  if (String(properties?.['image-type'] ?? '') !== ATTACHMENT_IMAGE_TYPE) {
    return false
  }
  const attachmentId = Number(String(properties?.['object-id'] ?? '').trim())
  if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
    return false
  }
  const alt = String(properties?.alt ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  node.tagName = ACTIVECOLLAB_IMAGE_TAG
  node.properties = {}
  node.children = [{ type: 'text', value: alt ? `${attachmentId} ${alt}` : String(attachmentId) }]
  return true
}

/**
 * ActiveCollab writes a blank line as a paragraph holding one space. A paragraph whose only
 * content is collapsible whitespace draws no line box at all, so the author's blank line would
 * disappear; refilling it with an NBSP makes it exactly one line tall, no margin rule involved.
 */
function fillBlankParagraph(node: HtmlNode): void {
  const children = node.children ?? []
  if (node.tagName !== 'p' || children.some((child) => child.type !== 'text')) {
    return
  }
  if (
    children
      .map((child) => child.value ?? '')
      .join('')
      .trim() === ''
  ) {
    node.children = [{ type: 'text', value: NON_BREAKING_SPACE }]
  }
}

function transformChildren(node: HtmlNode, instanceUrl: string | null): void {
  const children = node.children
  if (!children) {
    return
  }
  const kept: HtmlNode[] = []
  for (const child of children) {
    if (child.type !== 'element') {
      kept.push(child)
      continue
    }
    if (child.tagName === 'img') {
      // An attachment image is re-emitted for the authenticated fetch. Anything else pointing at
      // the instance still cannot authenticate, so it is dropped rather than painted broken.
      if (
        retagAttachmentImage(child) ||
        !isUnauthenticableInstanceImage(child.properties?.src, instanceUrl)
      ) {
        kept.push(child)
      }
      continue
    }
    retagActiveCollabElement(child)
    fillBlankParagraph(child)
    transformChildren(child, instanceUrl)
    kept.push(child)
  }
  node.children = kept
}

/** Runs between `rehype-raw` and `rehype-sanitize`, mirroring `remarkGitHubReferences`'s shape. */
export function rehypeActiveCollabHtml(
  options: ActiveCollabHtmlOptions
): () => (tree: HtmlNode) => void {
  return () => (tree) => transformChildren(tree, options.instanceUrl)
}
