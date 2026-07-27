// Pre-sanitise rewrite of ActiveCollab body and comment HTML.
//
// ActiveCollab marks mentions and callouts with `class`, and `commentMarkdownSanitizeSchema` strips
// `class` from every element. Widening that would hand provider HTML the app's entire utility
// vocabulary, so the classes are consumed HERE — before sanitisation — and re-emitted as two
// dedicated tag names the schema allows with ZERO attributes. `class` stays banned everywhere, and
// scripts, event handlers and `javascript:` URLs still meet the unchanged sanitiser behind this.

/** Minted only by this module, allowed by the schema with no attributes, styled by React. */
export const ACTIVECOLLAB_MENTION_TAG = 'ac-mention'
export const ACTIVECOLLAB_CALLOUT_TAG = 'ac-callout'

/** ActiveCollab hands out attachment URLs with these literal sentinels instead of an address. */
const ATTACHMENT_URL_SENTINELS = ['--DOWNLOAD-TOKEN--', '--PREVIEW-TOKEN--', '--THUMBNAIL-TOKEN--']

/** Stands in for the instance origin when the connection has not reported one yet. */
const UNKNOWN_INSTANCE_ORIGIN = 'https://activecollab.invalid'

export type ActiveCollabHtmlOptions = {
  /** Instance origin. Distinguishes an unauthenticable instance image from a third-party one. */
  instanceUrl: string | null
}

// Structural stand-in for hast. The walk only needs tag name, class list, `src` and children, and a
// local shape keeps this module off `@types/hast`, which the project does not depend on directly.
type HtmlNode = {
  type: string
  tagName?: string
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
  if (node.tagName === ACTIVECOLLAB_MENTION_TAG || node.tagName === ACTIVECOLLAB_CALLOUT_TAG) {
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
    if (
      child.tagName === 'img' &&
      isUnauthenticableInstanceImage(child.properties?.src, instanceUrl)
    ) {
      continue
    }
    retagActiveCollabElement(child)
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
