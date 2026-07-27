import type React from 'react'
import type { Components } from 'react-markdown'

import {
  ACTIVECOLLAB_CALLOUT_TAG,
  ACTIVECOLLAB_MENTION_TAG
} from './comment-markdown-activecollab-html'

/**
 * The only sanitiser widening ActiveCollab bodies get. Both tags are minted by the pre-sanitise
 * transform and allowed with no attributes, so provider HTML gains no styling surface at all.
 */
export const activeCollabMarkdownTagNames = [ACTIVECOLLAB_MENTION_TAG, ACTIVECOLLAB_CALLOUT_TAG]

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

// react-markdown keys `Components` by intrinsic tag name, and these two are ours rather than the
// DOM's, so this assertion is the whole extension point.
export const activeCollabMarkdownComponents = {
  [ACTIVECOLLAB_MENTION_TAG]: ActiveCollabMention,
  [ACTIVECOLLAB_CALLOUT_TAG]: ActiveCollabCallout
} as Components
