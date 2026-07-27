// Attachments hanging off a task body or a comment.
//
// Images are inlined from bytes the MAIN process fetched with the API token: an instance URL in an
// `<img src>` cannot authenticate, and a tokenised one would leak the credential into the DOM. The
// pre-sanitise transform therefore drops instance-hosted `<img>` tags out of the body and this grid
// is the single place an ActiveCollab image renders. Non-images are named, not downloadable —
// there is no download flow in this slice.

import React, { useCallback, useState } from 'react'
import { LoaderCircle, Paperclip, RefreshCw } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import {
  useActiveCollabAttachmentImageLoads,
  type ActiveCollabAttachmentImageState
} from '@/components/activecollab-attachment-image-loads'
import { ActiveCollabImageLightbox } from '@/components/activecollab-image-lightbox'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'

/**
 * Only a resolved image is a button. A thumbnail still in flight has nothing to show full size,
 * and a failed one owns a Retry control that cannot nest inside an outer button.
 */
function ActiveCollabAttachmentThumbnail({
  attachment,
  state,
  onOpen,
  onRetry
}: {
  attachment: ActiveCollabAttachment
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
          { value0: attachment.name }
        )}
        className="block w-full cursor-zoom-in overflow-hidden rounded-md border border-border/50 bg-muted/20 transition-colors hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <img
          src={state.dataUrl}
          alt={attachment.name}
          className="aspect-video w-full object-contain"
        />
      </button>
    )
  }

  if (state.status === 'failed') {
    return (
      <div
        role="alert"
        className="flex aspect-video w-full flex-col items-start justify-center gap-1.5 overflow-hidden rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
      >
        <span className="line-clamp-3">{describeActiveCollabFailure(state.failure)}</span>
        <Button variant="outline" size="xs" onClick={onRetry} className="gap-1">
          <RefreshCw className="size-3" />
          {translate('auto.components.activecollab.attachments.retry', 'Retry')}
        </Button>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/30"
    >
      <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      <span className="sr-only">
        {translate('auto.components.activecollab.attachments.loading', 'Loading {{value0}}', {
          value0: attachment.name
        })}
      </span>
    </div>
  )
}

/**
 * Renders nothing when a task or comment has no attachments, so callers can drop it in
 * unconditionally without guarding the empty case themselves.
 */
export function ActiveCollabAttachmentGrid({
  attachments
}: {
  attachments: ActiveCollabAttachment[]
}): React.JSX.Element | null {
  const images = attachments.filter((attachment) => attachment.isImage)
  const files = attachments.filter((attachment) => !attachment.isImage)
  const { stateFor, retry } = useActiveCollabAttachmentImageLoads(
    images.map((attachment) => attachment.id)
  )
  // The opener rides along with the index so closing can put focus back on the exact thumbnail.
  const [opened, setOpened] = useState<{ index: number; opener: HTMLElement } | null>(null)
  const closeLightbox = useCallback(() => setOpened(null), [])
  const navigateLightbox = useCallback((index: number) => {
    setOpened((current) => (current ? { ...current, index } : current))
  }, [])

  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {images.map((attachment, index) => (
            <ActiveCollabAttachmentThumbnail
              key={`${attachment.id}:${index}`}
              attachment={attachment}
              state={stateFor(attachment.id)}
              onOpen={(opener) => setOpened({ index, opener })}
              onRetry={() => retry(attachment.id)}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((attachment) => (
            <li
              key={attachment.id}
              data-activecollab-attachment-chip=""
              className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[12px] text-muted-foreground"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="truncate">{attachment.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ActiveCollabImageLightbox
        images={images}
        openIndex={opened?.index ?? null}
        restoreFocusTo={opened?.opener ?? null}
        stateFor={stateFor}
        onNavigate={navigateLightbox}
        onClose={closeLightbox}
        onRetry={retry}
      />
    </div>
  )
}
