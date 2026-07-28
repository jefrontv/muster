// @vitest-environment happy-dom
//
// The wheel gate is proved here with a stub event that records who called preventDefault. Inside a
// mounted dialog the scroll-lock layer calls preventDefault on the same event, so asserting
// `defaultPrevented` there would pass even with this handler missing.

import { describe, expect, it, vi, type Mock } from 'vitest'

import { applyImageSurfaceWheel } from './image-viewer-dom-zoom'
import type { ApplyImageViewerZoomChange } from './image-viewer-dom-zoom'

type StubbedWheel = {
  event: WheelEvent
  preventDefault: Mock<() => void>
  stopPropagation: Mock<() => void>
}

function surfaceAt(left: number, top: number): HTMLDivElement {
  const surface = document.createElement('div')
  surface.getBoundingClientRect = () =>
    ({ left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top }) as DOMRect
  return surface
}

function wheelOn(
  surface: HTMLDivElement,
  init: { deltaY: number; ctrlKey?: boolean; clientX?: number; clientY?: number }
): StubbedWheel {
  const preventDefault = vi.fn()
  const stopPropagation = vi.fn()
  const event = {
    deltaY: init.deltaY,
    deltaMode: 0,
    ctrlKey: init.ctrlKey ?? false,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    currentTarget: surface,
    preventDefault,
    stopPropagation
  } as unknown as WheelEvent

  return { event, preventDefault, stopPropagation }
}

describe('applyImageSurfaceWheel', () => {
  it('leaves a plain wheel to native scrolling unless the surface opted in', () => {
    const applyZoomChange = vi.fn<ApplyImageViewerZoomChange>()
    const { event, preventDefault } = wheelOn(surfaceAt(0, 0), { deltaY: -120 })

    applyImageSurfaceWheel(event, applyZoomChange)

    expect(applyZoomChange).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('zooms in on a plain wheel and takes the event once opted in', () => {
    const applyZoomChange = vi.fn<ApplyImageViewerZoomChange>()
    const { event, preventDefault, stopPropagation } = wheelOn(surfaceAt(0, 0), { deltaY: -120 })

    applyImageSurfaceWheel(event, applyZoomChange, true)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(applyZoomChange.mock.calls[0][0](1)).toBeGreaterThan(1)
  })

  it('zooms out on a downward plain wheel', () => {
    const applyZoomChange = vi.fn<ApplyImageViewerZoomChange>()
    const { event } = wheelOn(surfaceAt(0, 0), { deltaY: 120 })

    applyImageSurfaceWheel(event, applyZoomChange, true)

    expect(applyZoomChange.mock.calls[0][0](1)).toBeLessThan(1)
  })

  it('keeps a ctrl-wheel pinch off the app without any opt-in', () => {
    const applyZoomChange = vi.fn<ApplyImageViewerZoomChange>()
    const { event, preventDefault } = wheelOn(surfaceAt(0, 0), { deltaY: -120, ctrlKey: true })

    applyImageSurfaceWheel(event, applyZoomChange)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(applyZoomChange.mock.calls[0][0](1)).toBeGreaterThan(1)
  })

  it('anchors the zoom where the pointer sits inside the surface', () => {
    const applyZoomChange = vi.fn<ApplyImageViewerZoomChange>()
    const { event } = wheelOn(surfaceAt(40, 30), { deltaY: -120, clientX: 140, clientY: 130 })

    applyImageSurfaceWheel(event, applyZoomChange, true)

    expect(applyZoomChange.mock.calls[0][1]).toEqual({ x: 100, y: 100 })
  })
})
