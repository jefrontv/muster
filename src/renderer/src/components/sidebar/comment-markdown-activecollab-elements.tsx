import type React from 'react'
import type { Components } from 'react-markdown'

import { ActiveCollabInlineImage } from '@/components/activecollab-inline-image'
import {
  ACTIVECOLLAB_BLANK_TAG,
  ACTIVECOLLAB_CALLOUT_TAG,
  ACTIVECOLLAB_IMAGE_TAG,
  ACTIVECOLLAB_MENTION_TAG
} from './comment-markdown-activecollab-html'

/**
 * The only sanitiser widening ActiveCollab bodies get. All four are minted by the pre-sanitise
 * transform and allowed with no attributes, so provider HTML gains no styling surface at all.
 */
export const activeCollabMarkdownTagNames = [
  ACTIVECOLLAB_MENTION_TAG,
  ACTIVECOLLAB_CALLOUT_TAG,
  ACTIVECOLLAB_IMAGE_TAG,
  ACTIVECOLLAB_BLANK_TAG
]

type ActiveCollabElementProps = { children?: React.ReactNode }

function ActiveCollabMention({ children }: ActiveCollabElementProps): React.JSX.Element {
  return (
    <span
      data-activecollab-mention=""
      className="rounded-sm bg-primary/10 px-1 py-px font-medium text-primary"
    >
      {children}
    </span>
  )
}

/**
 * ActiveCollab bodies are block HTML, but the compact variant renders `<p>` as an inline span that
 * only becomes block-level when a host surface opts in. Provider paragraphs therefore ran together
 * into one line; a real paragraph restores the author's breaks — and their blank lines — on both
 * variants, at ordinary paragraph rhythm rather than an inflated margin.
 */
function ActiveCollabParagraph({ children }: ActiveCollabElementProps): React.JSX.Element {
  return <p className="my-2 first:mt-0 last:mb-0">{children}</p>
}

function ActiveCollabCallout({ children }: ActiveCollabElementProps): React.JSX.Element {
  return (
    <aside
      data-activecollab-callout=""
      className="my-3 rounded-md border border-l-2 border-border/60 border-l-primary/60 bg-muted/40 px-3 py-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
    >
      {children}
    </aside>
  )
}

/**
 * ActiveCollab's blank-line separator, rendered as a SHORT spacer rather than a full paragraph.
 *
 * It used to be a `<p>` holding an NBSP, which cost a whole line box plus a margin on each side —
 * so a single authored blank line opened a gap roughly three times the one the author saw in
 * ActiveCollab. A fixed half-line spacer keeps the separation the author intended without the
 * paragraph rhythm being dictated by an empty node.
 */
function ActiveCollabBlankLine(): React.JSX.Element {
  // The data attribute mirrors `data-activecollab-mention` above: these rendered ActiveCollab
  // primitives are identifiable without depending on their utility classes.
  return <span aria-hidden="true" data-activecollab-blank="" className="block h-2" />
}

// react-markdown keys `Components` by intrinsic tag name, and the `ac-*` ones are ours rather than
// the DOM's, so this assertion is the whole extension point. `p` is a plain override: it wins over
// the variant's own paragraph because this map is spread last.
export const activeCollabMarkdownComponents = {
  p: ActiveCollabParagraph,
  [ACTIVECOLLAB_MENTION_TAG]: ActiveCollabMention,
  [ACTIVECOLLAB_CALLOUT_TAG]: ActiveCollabCallout,
  [ACTIVECOLLAB_IMAGE_TAG]: ActiveCollabInlineImage,
  [ACTIVECOLLAB_BLANK_TAG]: ActiveCollabBlankLine
} as Components
