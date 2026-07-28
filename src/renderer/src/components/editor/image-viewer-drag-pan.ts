// Drag-to-pan for a scrollable image surface.
//
// Pointer capture is what makes the gesture survive leaving the window: the surface keeps
// receiving moves and gets the release wherever it happens, so a drag is never left stuck on.
// Panning writes the surface's own scroll offsets, so a drag and its scrollbars stay in agreement.

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'

import { IMAGE_VIEWER_DRAG_CLICK_THRESHOLD, clampImageViewerPanOffset } from './image-viewer-zoom'

/** Spread onto the scroll surface; undefined when the caller has not opted into panning. */
export type ImageSurfacePanProps = {
  style: CSSProperties
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void
  onDragStart: (event: ReactDragEvent<HTMLDivElement>) => void
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
}

type ActiveDrag = {
  pointerId: number
  pointerX: number
  pointerY: number
  scrollLeft: number
  scrollTop: number
  moved: boolean
}

export function useImageSurfaceDragPan(
  surfaceRef: { current: HTMLDivElement | null },
  enabled: boolean
): ImageSurfacePanProps | undefined {
  const [isPanning, setIsPanning] = useState(false)
  const dragRef = useRef<ActiveDrag | null>(null)
  const swallowClickRef = useRef(false)

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const surface = surfaceRef.current
      // Left button only, and a second pointer must not hijack a drag already in flight.
      if (!surface || event.button !== 0 || dragRef.current) {
        return
      }

      swallowClickRef.current = false
      dragRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        scrollLeft: surface.scrollLeft,
        scrollTop: surface.scrollTop,
        moved: false
      }
      surface.setPointerCapture(event.pointerId)
      setIsPanning(true)
    },
    [surfaceRef]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      const surface = surfaceRef.current
      if (!drag || !surface || event.pointerId !== drag.pointerId) {
        return
      }

      const deltaX = event.clientX - drag.pointerX
      const deltaY = event.clientY - drag.pointerY
      if (Math.abs(deltaX) + Math.abs(deltaY) > IMAGE_VIEWER_DRAG_CLICK_THRESHOLD) {
        drag.moved = true
      }
      // Content follows the pointer, so the surface scrolls against it.
      surface.scrollLeft = clampImageViewerPanOffset({
        offset: drag.scrollLeft - deltaX,
        contentSize: surface.scrollWidth,
        viewportSize: surface.clientWidth
      })
      surface.scrollTop = clampImageViewerPanOffset({
        offset: drag.scrollTop - deltaY,
        contentSize: surface.scrollHeight,
        viewportSize: surface.clientHeight
      })
    },
    [surfaceRef]
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }

      dragRef.current = null
      // A drag that travelled must not also read as a click; a still press must.
      swallowClickRef.current = drag.moved
      const surface = surfaceRef.current
      if (surface?.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId)
      }
      setIsPanning(false)
    },
    [surfaceRef]
  )

  const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClickRef.current) {
      return
    }

    swallowClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const style = useMemo<CSSProperties>(
    () => ({
      cursor: isPanning ? 'grabbing' : 'grab',
      userSelect: isPanning ? 'none' : undefined
    }),
    [isPanning]
  )

  const panProps = useMemo<ImageSurfacePanProps>(
    () => ({
      style,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      // Why: an <img> under the pointer would otherwise start a native HTML5 drag mid-pan.
      onDragStart: (event) => event.preventDefault(),
      onClickCapture: handleClickCapture
    }),
    [endDrag, handleClickCapture, handlePointerDown, handlePointerMove, style]
  )

  return enabled ? panProps : undefined
}
