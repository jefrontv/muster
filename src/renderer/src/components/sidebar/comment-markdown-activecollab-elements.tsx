import type React from 'react'
import type { Components } from 'react-markdown'

import { ActiveCollabInlineImage } from '@/components/activecollab-inline-image'
import {
  ACTIVECOLLAB_CALLOUT_TAG,
  ACTIVECOLLAB_IMAGE_TAG,
  ACTIVECOLLAB_MENTION_TAG
} from './comment-markdown-activecollab-html'

/**
 * The only sanitiser widening ActiveCollab bodies get. All three are minted by the pre-sanitise
 * transform and allowed with no attributes, so provider HTML gains no styling surface at all.
 */
export const activeCollabMarkdownTagNames = [
  ACTIVECOLLAB_MENTION_TAG,
  ACTIVECOLLAB_CALLOUT_TAG,
  ACTIVECOLLAB_IMAGE_TAG
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

// react-markdown keys `Components` by intrinsic tag name, and the `ac-*` ones are ours rather than
// the DOM's, so this assertion is the whole extension point. `p` is a plain override: it wins over
// the variant's own paragraph because this map is spread last.
export const activeCollabMarkdownComponents = {
  p: ActiveCollabParagraph,
  [ACTIVECOLLAB_MENTION_TAG]: ActiveCollabMention,
  [ACTIVECOLLAB_CALLOUT_TAG]: ActiveCollabCallout,
  [ACTIVECOLLAB_IMAGE_TAG]: ActiveCollabInlineImage
} as Components
