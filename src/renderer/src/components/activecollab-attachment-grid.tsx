// Attachments hanging off a task body or a comment.
//
// Images are inlined from bytes the MAIN process fetched with the API token: an instance URL in an
// `<img src>` cannot authenticate, and a tokenised one would leak the credential into the DOM. The
// pre-sanitise transform therefore drops instance-hosted `<img>` tags out of the body and this grid
// is the single place an ActiveCollab image renders. Non-images are named, not downloadable —
// there is no download flow in this slice.

import React, { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Paperclip, RefreshCw } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'

type AttachmentImageState =
  | { status: 'loading' }
  | { status: 'ready'; dataUrl: string }
  | { status: 'failed'; failure: ActiveCollabFailure }

function ActiveCollabAttachmentImage({
  attachment
}: {
  attachment: ActiveCollabAttachment
}): React.JSX.Element {
  const fetchImage = useAppStore((s) => s.fetchActiveCollabAttachmentImage)
  const [state, setState] = useState<AttachmentImageState>({ status: 'loading' })
  // The grid keys each thumbnail by attachment id, so a different attachment is a different
  // instance with its own fresh state; only a retry re-enters loading.
  const [attempt, setAttempt] = useState(0)
  const attachmentId = attachment.id
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    let live = true
    void fetchImage({ attachmentId }).then((result) => {
      if (!live) {
        return
      }
      setState(
        result.ok
          ? { status: 'ready', dataUrl: result.value.dataUrl }
          : { status: 'failed', failure: result }
      )
    })
    return () => {
      live = false
    }
  }, [attachmentId, attempt, fetchImage])

  if (state.status === 'ready') {
    return (
      <img
        src={state.dataUrl}
        alt={attachment.name}
        className="aspect-video w-full rounded-md border border-border/50 bg-muted/20 object-contain"
      />
    )
  }

  if (state.status === 'failed') {
    return (
      <div
        role="alert"
        className="flex aspect-video w-full flex-col items-start justify-center gap-1.5 overflow-hidden rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
      >
        <span className="line-clamp-3">{describeActiveCollabFailure(state.failure)}</span>
        <Button variant="outline" size="xs" onClick={retry} className="gap-1">
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
  if (attachments.length === 0) {
    return null
  }
  const images = attachments.filter((attachment) => attachment.isImage)
  const files = attachments.filter((attachment) => !attachment.isImage)

  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {images.map((attachment) => (
            <ActiveCollabAttachmentImage key={attachment.id} attachment={attachment} />
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
    </div>
  )
}
