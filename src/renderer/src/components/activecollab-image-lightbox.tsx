// Full-size view of one attachment image, paged across the task's other images.
//
// The bytes come from the grid's already-resolved load state, so opening the lightbox reads no
// new bytes. Zoom is the editor's image surface, which is where the non-passive ctrl-wheel
// listener that makes a trackpad pinch zoom the image instead of the app lives.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, LoaderCircle, RefreshCw } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import type { ActiveCollabAttachmentImageState } from '@/components/activecollab-attachment-image-loads'
import ImageViewerPopup from '@/components/editor/ImageViewerPopup'
import { useImageViewerZoomSurface } from '@/components/editor/image-viewer-zoom-surface'
import type { ImageViewerImageDimensions } from '@/components/editor/image-viewer-zoom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'

type ActiveCollabImageLightboxProps = {
  images: ActiveCollabAttachment[]
  /** null keeps the dialog closed; the index addresses `images`. */
  openIndex: number | null
  stateFor: (attachmentId: number) => ActiveCollabAttachmentImageState
  onNavigate: (index: number) => void
  onClose: () => void
  /** The thumbnail that opened the dialog; focus goes back to it on close. */
  restoreFocusTo: HTMLElement | null
  onRetry: (attachmentId: number) => void
}

/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: zoom and measured image size describe the surface currently on screen, so paging to another attachment has to drop them in the same render rather than one frame late. */
export function ActiveCollabImageLightbox({
  images,
  openIndex,
  stateFor,
  onNavigate,
  onClose,
  restoreFocusTo,
  onRetry
}: ActiveCollabImageLightboxProps): React.JSX.Element {
  const attachment = openIndex === null ? null : (images[openIndex] ?? null)
  const attachmentId = attachment?.id ?? null
  const total = images.length

  const [imageDimensions, setImageDimensions] = useState<ImageViewerImageDimensions | null>(null)
  const surface = useImageViewerZoomSurface({
    imageDimensions,
    active: attachment !== null,
    measureKey: attachmentId
  })

  const [lastAttachmentId, setLastAttachmentId] = useState<number | null>(attachmentId)
  if (lastAttachmentId !== attachmentId) {
    setLastAttachmentId(attachmentId)
    surface.setZoom(1)
    setImageDimensions(null)
  }

  useEffect(() => {
    if (openIndex === null || total < 2) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (step === 0) {
        return
      }
      event.preventDefault()
      onNavigate((openIndex + step + total) % total)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onNavigate, openIndex, total])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose()
      }
    },
    [onClose]
  )
  // Latched, because Radix defers its unmount-autofocus to a macrotask: by the time it fires the
  // grid has already cleared the open state, and the prop is back to null.
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (restoreFocusTo) {
      openerRef.current = restoreFocusTo
    }
  }, [restoreFocusTo])
  const handleCloseAutoFocus = useCallback((event: Event) => {
    const opener = openerRef.current
    if (!opener?.isConnected) {
      return
    }
    // Radix's modal default hands focus to a DialogTrigger, and thumbnails are not triggers.
    event.preventDefault()
    opener.focus()
  }, [])

  const state = attachmentId === null ? null : stateFor(attachmentId)

  return (
    <ImageViewerPopup
      filename={attachment?.name ?? ''}
      imageLayoutStyle={state?.status === 'ready' ? surface.imageLayoutStyle : undefined}
      isOpen={attachment !== null}
      onOpenChange={handleOpenChange}
      onCloseAutoFocus={handleCloseAutoFocus}
      setSurfaceRef={surface.setSurfaceRef}
      zoomPercent={surface.zoomPercent}
      headerActions={
        openIndex !== null && total > 1 ? (
          <LightboxPager index={openIndex} total={total} onNavigate={onNavigate} />
        ) : null
      }
    >
      {attachment && state ? (
        <LightboxContent
          attachment={attachment}
          state={state}
          isSized={surface.imageLayoutSize !== null}
          onLoadDimensions={setImageDimensions}
          onRetry={onRetry}
        />
      ) : null}
    </ImageViewerPopup>
  )
}

function LightboxPager({
  index,
  total,
  onNavigate
}: {
  index: number
  total: number
  onNavigate: (index: number) => void
}): React.JSX.Element {
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onNavigate((index - 1 + total) % total)}
        aria-label={translate(
          'auto.components.activecollab.attachments.previous_image',
          'Previous image'
        )}
      >
        <ChevronLeft />
      </Button>
      <span className="tabular-nums text-xs text-muted-foreground">
        {translate(
          'auto.components.activecollab.attachments.image_position',
          '{{value0}} of {{value1}}',
          { value0: index + 1, value1: total }
        )}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onNavigate((index + 1) % total)}
        aria-label={translate('auto.components.activecollab.attachments.next_image', 'Next image')}
      >
        <ChevronRight />
      </Button>
    </>
  )
}

function LightboxContent({
  attachment,
  state,
  isSized,
  onLoadDimensions,
  onRetry
}: {
  attachment: ActiveCollabAttachment
  state: ActiveCollabAttachmentImageState
  isSized: boolean
  onLoadDimensions: (dimensions: ImageViewerImageDimensions) => void
  onRetry: (attachmentId: number) => void
}): React.JSX.Element {
  if (state.status === 'ready') {
    return (
      <img
        src={state.dataUrl}
        alt={attachment.name}
        className={cn(
          'object-contain',
          isSized ? 'block h-full w-full' : 'block max-h-full max-w-full'
        )}
        onLoad={(event) => {
          const image = event.currentTarget
          onLoadDimensions({ width: image.naturalWidth, height: image.naturalHeight })
        }}
      />
    )
  }

  if (state.status === 'failed') {
    return (
      <div
        role="alert"
        className="flex max-w-md flex-col items-center gap-3 px-6 py-10 text-center text-sm text-destructive"
      >
        <ImageOff className="size-6" />
        <span>{describeActiveCollabFailure(state.failure)}</span>
        <Button
          variant="outline"
          size="xs"
          onClick={() => onRetry(attachment.id)}
          className="gap-1 text-foreground"
        >
          <RefreshCw className="size-3" />
          {translate('auto.components.activecollab.attachments.retry', 'Retry')}
        </Button>
      </div>
    )
  }

  return (
    <div role="status" className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      <span>
        {translate('auto.components.activecollab.attachments.loading', 'Loading {{value0}}', {
          value0: attachment.name
        })}
      </span>
    </div>
  )
}
