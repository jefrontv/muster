// An attachment image the author placed inside the prose of a task body or comment.
//
// The bytes come from the same store-cached authenticated read the attachment grid uses, keyed by
// attachment id, so an image that is ALSO listed in the grid below is fetched exactly once.
//
// It stays in the grid on purpose. The grid is the manifest of what is attached, and an attachment
// that vanished from it because the author happened to embed it would make that list lie; the two
// are different affordances, and sharing one cache entry makes the second render free.

import React, { useCallback, useMemo, useState } from 'react'
import { ImageOff, LoaderCircle } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import {
  useActiveCollabAttachmentImageLoads,
  type ActiveCollabAttachmentImageState
} from '@/components/activecollab-attachment-image-loads'
import { ActiveCollabImageLightbox } from '@/components/activecollab-image-lightbox'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'

/** `<ac-image>` is allowed no attributes, so its text is `{id}`, or `{id} {alt}` when named. */
const INLINE_IMAGE_TEXT = /^(\d+)(?:[ ]([\s\S]*))?$/

export function ActiveCollabInlineImage({
  children
}: {
  children?: React.ReactNode
}): React.JSX.Element | null {
  const text = React.Children.toArray(children)
    .filter((child): child is string => typeof child === 'string')
    .join('')
  const parsed = INLINE_IMAGE_TEXT.exec(text)
  const attachmentId = parsed ? Number(parsed[1]) : 0
  const name =
    parsed?.[2]?.trim() ||
    translate('auto.components.activecollab.inline_image.fallback_name', 'Attached image')

  const ids = useMemo(() => (attachmentId > 0 ? [attachmentId] : []), [attachmentId])
  const { stateFor, retry } = useActiveCollabAttachmentImageLoads(ids)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const closeLightbox = useCallback(() => setOpener(null), [])
  const noop = useCallback(() => {}, [])

  // The lightbox reads only `id` and `name`; the body HTML states neither size nor mime type.
  const attachment = useMemo<ActiveCollabAttachment>(
    () => ({ id: attachmentId, name, mimeType: '', size: 0, isImage: true }),
    [attachmentId, name]
  )
  const images = useMemo(() => [attachment], [attachment])

  if (attachmentId <= 0) {
    return null
  }

  const state = stateFor(attachmentId)

  return (
    <>
      <ActiveCollabInlineImageSurface
        name={name}
        state={state}
        onOpen={setOpener}
        onRetry={() => retry(attachmentId)}
      />
      <ActiveCollabImageLightbox
        images={images}
        openIndex={opener ? 0 : null}
        restoreFocusTo={opener}
        stateFor={stateFor}
        onNavigate={noop}
        onClose={closeLightbox}
        onRetry={retry}
      />
    </>
  )
}

/**
 * Every branch is inline-level and keeps a line box, so a slow or dead image never collapses the
 * sentence around it. Width is capped at the comment's own measure rather than the 800px the
 * provider URL asks for.
 */
function ActiveCollabInlineImageSurface({
  name,
  state,
  onOpen,
  onRetry
}: {
  name: string
  state: ActiveCollabAttachmentImageState
  onOpen: (opener: HTMLElement) => void
  onRetry: () => void
}): React.JSX.Element {
  if (state.status === 'ready') {
    return (
      <button
        type="button"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-label={translate(
          'auto.components.activecollab.attachments.open_image',
          'Open {{value0}}',
          { value0: name }
        )}
        className="my-1 block max-w-full cursor-zoom-in overflow-hidden rounded-md border border-border/50 bg-muted/20 transition-colors hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <img src={state.dataUrl} alt={name} className="block h-auto max-w-full" />
      </button>
    )
  }

  if (state.status === 'failed') {
    return (
      <span
        role="alert"
        className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
      >
        <ImageOff className="size-3 shrink-0" />
        <span className="truncate">{describeActiveCollabFailure(state.failure)}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 underline underline-offset-2 hover:no-underline"
        >
          {translate('auto.components.activecollab.attachments.retry', 'Retry')}
        </button>
      </span>
    )
  }

  return (
    <span
      role="status"
      className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
    >
      <LoaderCircle className="size-3 shrink-0 animate-spin" />
      <span className="truncate">
        {translate('auto.components.activecollab.attachments.loading', 'Loading {{value0}}', {
          value0: name
        })}
      </span>
    </span>
  )
}
