// Attachments hanging off a task body or a comment.
//
// Images are inlined from bytes the MAIN process fetched with the API token: an instance URL in an
// `<img src>` cannot authenticate, and a tokenised one would leak the credential into the DOM. The
// pre-sanitise transform therefore drops instance-hosted `<img>` tags out of the body and this grid
// is the single place an ActiveCollab image renders.
//
// A non-image cannot be inlined, so its chip is a download button instead: main streams the bytes
// to a file the user picks and answers with the path. An image is NOT also a download — its
// thumbnail is already a button that opens the lightbox, and a second control nested inside that
// button would be invalid markup and an ambiguous click target.

import React, { useCallback, useState } from 'react'
import { Download, LoaderCircle, Paperclip, RefreshCw } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import {
  useActiveCollabAttachmentImageLoads,
  type ActiveCollabAttachmentImageState
} from '@/components/activecollab-attachment-image-loads'
import { ActiveCollabImageLightbox } from '@/components/activecollab-image-lightbox'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'
import { activeCollabDownloadAttachment } from '@/runtime/runtime-activecollab-client'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'

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

type ActiveCollabDownloadState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'saved'; directory: string }
  | { status: 'failed'; failure: ActiveCollabFailure }

/**
 * One downloadable non-image attachment.
 *
 * State is per chip rather than lifted, so a slow transfer disables only its own button and leaves
 * the rest of the pane — and every sibling attachment — live. Dismissing the save dialog returns
 * the chip to idle: the user changed their mind, which is not a failure to announce.
 */
function ActiveCollabAttachmentDownloadChip({
  attachment
}: {
  attachment: ActiveCollabAttachment
}): React.JSX.Element {
  const [state, setState] = useState<ActiveCollabDownloadState>({ status: 'idle' })
  const running = state.status === 'running'
  const { id, name } = attachment

  const start = useCallback(() => {
    setState({ status: 'running' })
    void activeCollabDownloadAttachment({ attachmentId: id, name })
      .then((result) => {
        if (!result.ok) {
          setState({ status: 'failed', failure: result })
          return
        }
        setState(
          result.value.status === 'saved'
            ? { status: 'saved', directory: result.value.directory }
            : { status: 'idle' }
        )
      })
      .catch((error: unknown) => {
        // The client contract is result-typed, so a rejection here is a transport bug — but the
        // spinner must still stop, or the chip is stuck busy for the rest of the session.
        console.warn('[activecollab] attachment download failed:', error)
        setState({
          status: 'failed',
          failure: {
            ok: false,
            kind: 'unknown',
            error: error instanceof Error ? error.message : String(error),
            status: null
          }
        })
      })
  }, [id, name])

  return (
    <li
      data-activecollab-attachment-chip=""
      className="inline-flex min-w-0 max-w-full flex-col items-start gap-0.5"
    >
      <button
        type="button"
        onClick={start}
        disabled={running}
        aria-busy={running}
        aria-label={translate(
          'auto.components.activecollab.attachments.download',
          'Download {{value0}}',
          { value0: name }
        )}
        className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-progress disabled:opacity-70"
      >
        <Paperclip className="size-3 shrink-0" />
        <span className="truncate">{name}</span>
        {running ? (
          <LoaderCircle className="size-3 shrink-0 animate-spin" />
        ) : (
          <Download className="size-3 shrink-0" />
        )}
      </button>
      {running ? (
        <span role="status" className="px-2 text-[11px] text-muted-foreground">
          {translate('auto.components.activecollab.attachments.downloading', 'Downloading…')}
        </span>
      ) : null}
      {state.status === 'saved' ? (
        <span role="status" className="px-2 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.activecollab.attachments.download_saved',
            'Saved to {{value0}}',
            { value0: state.directory }
          )}
        </span>
      ) : null}
      {state.status === 'failed' ? (
        <span role="alert" className="px-2 text-[11px] text-destructive">
          {describeActiveCollabFailure(state.failure)}
        </span>
      ) : null}
    </li>
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
        <ul className="flex flex-wrap items-start gap-1.5">
          {files.map((attachment, index) => (
            <ActiveCollabAttachmentDownloadChip
              key={`${attachment.id}:${index}`}
              attachment={attachment}
            />
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
