// Zoom state for one scrollable image surface: the level, the measured surface, the native
// ctrl-wheel listener, and the layout box the zoom resolves to.
//
// Every zoomable image surface in the app is one of these, so the ctrl-wheel wiring is written
// once. Chromium reports a trackpad pinch as a ctrl-wheel event, and only a non-passive listener
// can call preventDefault on it, so a surface that misses this hook pinch-zooms the whole app.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction
} from 'react'

import {
  applyAnchoredImageViewerZoomChange,
  applyImageSurfaceWheel,
  getElementSurfaceSize,
  getImageLayoutStyle,
  type ApplyImageViewerZoomChange
} from './image-viewer-dom-zoom'
import { useImageSurfaceDragPan, type ImageSurfacePanProps } from './image-viewer-drag-pan'
import {
  getZoomedImageLayoutSize,
  type ImageViewerImageDimensions,
  type ImageViewerSurfaceSize
} from './image-viewer-zoom'

export type ImageViewerZoomSurface = {
  zoom: number
  zoomPercent: number
  setZoom: Dispatch<SetStateAction<number>>
  applyZoomChange: ApplyImageViewerZoomChange
  setSurfaceRef: (surface: HTMLDivElement | null) => void
  imageLayoutSize: ImageViewerImageDimensions | null
  imageLayoutStyle: CSSProperties | undefined
  /** Undefined unless `wheelZoomAndDragPan` is on; spread onto the scroll surface. */
  panProps: ImageSurfacePanProps | undefined
  /** Puts the pan back where a fresh image starts, which zoom state alone cannot do. */
  scrollToOrigin: () => void
}

export function useImageViewerZoomSurface({
  imageDimensions,
  active = true,
  fitToSurface = true,
  measureKey,
  wheelZoomAndDragPan = false
}: {
  imageDimensions: ImageViewerImageDimensions | null
  /** False parks the surface — a closed popup has no box to measure. */
  active?: boolean
  /** False when the caller scales with a CSS transform and wants no layout box. */
  fitToSurface?: boolean
  /** Re-measures when it changes; a new image can resize the surface without resizing the window. */
  measureKey?: unknown
  /**
   * Opt-in photo-viewer gestures: a plain wheel zooms at the pointer instead of scrolling, and
   * dragging pans. Off by default so a document surface keeps plain-wheel scrolling.
   */
  wheelZoomAndDragPan?: boolean
}): ImageViewerZoomSurface {
  const [zoom, setZoom] = useState(1)
  const [surfaceSize, setSurfaceSize] = useState<ImageViewerSurfaceSize | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  const applyZoomChange = useCallback<ApplyImageViewerZoomChange>((getNextZoom, anchor) => {
    applyAnchoredImageViewerZoomChange(surfaceRef.current, setZoom, getNextZoom, anchor)
  }, [])
  const handleSurfaceWheel = useCallback(
    (event: WheelEvent) => {
      applyImageSurfaceWheel(event, applyZoomChange, wheelZoomAndDragPan)
    },
    [applyZoomChange, wheelZoomAndDragPan]
  )
  const panProps = useImageSurfaceDragPan(surfaceRef, wheelZoomAndDragPan)
  const scrollToOrigin = useCallback(() => {
    const surface = surfaceRef.current
    if (surface) {
      surface.scrollLeft = 0
      surface.scrollTop = 0
    }
  }, [])
  const setSurfaceRef = useCallback(
    (surface: HTMLDivElement | null) => {
      if (surfaceRef.current) {
        surfaceRef.current.removeEventListener('wheel', handleSurfaceWheel)
      }
      surfaceRef.current = surface
      if (!surface) {
        setSurfaceSize(null)
        return
      }
      setSurfaceSize(getElementSurfaceSize(surface))
      // Why: Chromium exposes trackpad pinch as ctrl-wheel and requires a
      // native non-passive listener to stop browser/app zoom.
      surface.addEventListener('wheel', handleSurfaceWheel, { passive: false })
    },
    [handleSurfaceWheel]
  )

  useEffect(() => {
    const surface = surfaceRef.current
    if (!active || !surface) {
      setSurfaceSize(null)
      return
    }

    const updateSize = (): void => setSurfaceSize(getElementSurfaceSize(surface))
    updateSize()
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [active, measureKey])

  const imageLayoutSize = useMemo(
    () => (fitToSurface ? getZoomedImageLayoutSize({ imageDimensions, surfaceSize, zoom }) : null),
    [fitToSurface, imageDimensions, surfaceSize, zoom]
  )
  const imageLayoutStyle = useMemo(() => getImageLayoutStyle(imageLayoutSize), [imageLayoutSize])

  return {
    zoom,
    zoomPercent: Math.round(zoom * 100),
    setZoom,
    applyZoomChange,
    setSurfaceRef,
    imageLayoutSize,
    imageLayoutStyle,
    panProps,
    scrollToOrigin
  }
}
