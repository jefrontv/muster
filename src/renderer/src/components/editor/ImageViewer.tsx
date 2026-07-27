/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: image surface size is measured with ResizeObserver and DOM refs, which are external layout systems outside render derivation. */
import { Image as ImageIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { type JSX, useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import ImageViewerPopup from './ImageViewerPopup'
import PdfViewer from './PdfViewer'
import { useImageViewerZoomSurface } from './image-viewer-zoom-surface'
import {
  IMAGE_VIEWER_ZOOM_STEP,
  MAX_IMAGE_VIEWER_ZOOM,
  MIN_IMAGE_VIEWER_ZOOM,
  type ImageViewerImageDimensions
} from './image-viewer-zoom'
import { translate } from '@/i18n/i18n'
import { buildImageDataUri } from '../../../../shared/image-data-uri'

const FALLBACK_IMAGE_MIME_TYPE = 'image/png'

type ImageViewerProps = {
  content: string
  filePath: string
  mimeType?: string
  layout?: 'fill' | 'intrinsic'
}

export default function ImageViewer({
  content,
  filePath,
  mimeType = FALLBACK_IMAGE_MIME_TYPE,
  layout = 'fill'
}: ImageViewerProps): JSX.Element {
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<ImageViewerImageDimensions | null>(null)
  const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null)

  const filename = useMemo(() => filePath.split(/[/\\]/).pop() || filePath, [filePath])
  const cleanedContent = useMemo(() => content.replace(/\s/g, ''), [content])
  const isIntrinsicLayout = layout === 'intrinsic'
  const previewSrc = useMemo(
    () => buildImageDataUri(mimeType, cleanedContent),
    [cleanedContent, mimeType]
  )

  const inlineSurface = useImageViewerZoomSurface({
    imageDimensions,
    fitToSurface: !isIntrinsicLayout,
    measureKey: previewSrc
  })
  const popupSurface = useImageViewerZoomSurface({ imageDimensions, active: isPopupOpen })

  const imageStateKey = `${filePath}\n${mimeType}\n${cleanedContent}`
  const [lastImageStateKey, setLastImageStateKey] = useState(imageStateKey)
  if (lastImageStateKey !== imageStateKey) {
    setLastImageStateKey(imageStateKey)
    inlineSurface.setZoom(1)
    popupSurface.setZoom(1)
    setImageDimensions(null)
  }
  const isPdf = mimeType === 'application/pdf'
  const imageError =
    (previewSrc === null && cleanedContent.length > 0) ||
    (previewSrc !== null && failedPreviewSrc === previewSrc)
  const estimatedSize = useMemo(() => {
    const bytes = Math.floor((cleanedContent.length * 3) / 4)
    if (bytes < 1024) {
      return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [cleanedContent])
  const inlineZoom = inlineSurface.zoom
  const applyInlineZoomChange = inlineSurface.applyZoomChange
  const setPopupZoom = popupSurface.setZoom
  const openPopup = useCallback(() => {
    setPopupZoom(inlineZoom)
    setIsPopupOpen(true)
  }, [inlineZoom, setPopupZoom])
  const handlePopupOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setPopupZoom(inlineZoom)
      }
      setIsPopupOpen(open)
    },
    [inlineZoom, setPopupZoom]
  )

  if (isPdf) {
    return <PdfViewer content={cleanedContent} filePath={filePath} />
  }

  if (imageError) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 bg-muted/20 p-8 text-sm text-muted-foreground',
          isIntrinsicLayout ? 'min-h-64' : 'h-full'
        )}
      >
        <ImageIcon size={40} />
        <div>
          {translate(
            'auto.components.editor.ImageViewer.d9d2944855',
            'Failed to load file preview'
          )}
        </div>
        <div className="max-w-md break-all text-center text-xs">{filename}</div>
      </div>
    )
  }

  if (!previewSrc) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-muted-foreground text-sm',
          isIntrinsicLayout ? 'min-h-64' : 'h-full'
        )}
      >
        {translate('auto.components.editor.ImageViewer.3ef9551ba2', 'Loading preview...')}
      </div>
    )
  }

  return (
    <>
      <div className={cn('flex min-h-0 flex-col', isIntrinsicLayout ? 'h-auto' : 'h-full')}>
        <div
          ref={inlineSurface.setSurfaceRef}
          className={cn(
            'cursor-pointer bg-muted/20',
            isIntrinsicLayout
              ? 'flex justify-center overflow-visible p-4'
              : 'flex-1 overflow-auto scrollbar-editor'
          )}
          onClick={openPopup}
          title={translate('auto.components.editor.ImageViewer.77bfc9b35a', 'Open image in popup')}
        >
          <div
            className={cn(
              'flex justify-center',
              isIntrinsicLayout
                ? 'max-w-full items-start'
                : 'h-max min-h-full w-max min-w-full items-center p-4'
            )}
          >
            <div
              className="flex items-center justify-center"
              style={
                isIntrinsicLayout
                  ? { transform: `scale(${inlineZoom})`, transformOrigin: 'center center' }
                  : inlineSurface.imageLayoutStyle
              }
            >
              <img
                src={previewSrc}
                alt={filename}
                className={cn(
                  'object-contain',
                  isIntrinsicLayout
                    ? 'block h-auto max-h-none max-w-full'
                    : inlineSurface.imageLayoutSize
                      ? 'block h-full w-full'
                      : 'block max-h-full max-w-full'
                )}
                onLoad={(event) => {
                  const img = event.currentTarget
                  setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                  setFailedPreviewSrc(null)
                }}
                // Why: track the failed source identity, not a boolean, so a new
                // image retries immediately without waiting for an Effect reset.
                onError={() => setFailedPreviewSrc(previewSrc)}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={() =>
                applyInlineZoomChange((currentZoom) => currentZoom / IMAGE_VIEWER_ZOOM_STEP)
              }
              disabled={inlineZoom <= MIN_IMAGE_VIEWER_ZOOM}
              title={translate('auto.components.editor.ImageViewer.be27304574', 'Zoom out')}
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={() => applyInlineZoomChange(() => 1)}
              disabled={inlineZoom === 1}
              title={translate('auto.components.editor.ImageViewer.6c89c73d9f', 'Reset zoom')}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={() =>
                applyInlineZoomChange((currentZoom) => currentZoom * IMAGE_VIEWER_ZOOM_STEP)
              }
              disabled={inlineZoom >= MAX_IMAGE_VIEWER_ZOOM}
              title={translate('auto.components.editor.ImageViewer.3c9217f5a6', 'Zoom in')}
            >
              <ZoomIn size={14} />
            </button>
            <span className="ml-1 tabular-nums">{inlineSurface.zoomPercent}%</span>
          </div>
          <span className="min-w-0 truncate" title={filename}>
            {filename}
          </span>
          {imageDimensions && (
            <span>
              {imageDimensions.width} x {imageDimensions.height}
            </span>
          )}
          <span>{estimatedSize}</span>
        </div>
      </div>
      <ImageViewerPopup
        filename={filename}
        imageLayoutStyle={popupSurface.imageLayoutStyle}
        isOpen={isPopupOpen}
        onOpenChange={handlePopupOpenChange}
        setSurfaceRef={popupSurface.setSurfaceRef}
        zoomPercent={popupSurface.zoomPercent}
      >
        <img
          src={previewSrc}
          alt={filename}
          className={cn(
            'object-contain',
            popupSurface.imageLayoutSize ? 'block h-full w-full' : 'block max-h-full max-w-full'
          )}
        />
      </ImageViewerPopup>
    </>
  )
}
