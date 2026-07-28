// @vitest-environment happy-dom
//
// Real pointer events against a real surface: pointer capture, the scroll offsets a drag writes,
// and whether a press still reads as a click are only observable through the DOM.

import { act, useRef, type JSX } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useImageSurfaceDragPan } from './image-viewer-drag-pan'

const onTargetClick = vi.fn()

let container: HTMLDivElement
let root: Root

function PanHarness({ enabled }: { enabled: boolean }): JSX.Element {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const panProps = useImageSurfaceDragPan(surfaceRef, enabled)

  return (
    <div ref={surfaceRef} data-testid="surface" {...panProps}>
      <button type="button" data-testid="target" onClick={onTargetClick} />
    </div>
  )
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  onTargetClick.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

/** happy-dom reports every box as zero, so the scroll range a drag clamps against is stated here. */
function mountSurface({
  enabled = true,
  content = { width: 1000, height: 800 },
  viewport = { width: 400, height: 300 }
}: {
  enabled?: boolean
  content?: { width: number; height: number }
  viewport?: { width: number; height: number }
} = {}): HTMLDivElement {
  act(() => {
    root.render(<PanHarness enabled={enabled} />)
  })
  const surface = container.querySelector<HTMLDivElement>('[data-testid="surface"]')
  if (!surface) {
    throw new Error('surface not rendered')
  }

  Object.defineProperty(surface, 'scrollWidth', { value: content.width, configurable: true })
  Object.defineProperty(surface, 'scrollHeight', { value: content.height, configurable: true })
  Object.defineProperty(surface, 'clientWidth', { value: viewport.width, configurable: true })
  Object.defineProperty(surface, 'clientHeight', { value: viewport.height, configurable: true })
  return surface
}

function target(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('[data-testid="target"]')
  if (!button) {
    throw new Error('target not rendered')
  }
  return button
}

function pointer(
  type: string,
  element: Element,
  x: number,
  y: number,
  { pointerId = 1, button = 0 }: { pointerId?: number; button?: number } = {}
): void {
  act(() => {
    element.dispatchEvent(
      new PointerEvent(type, {
        pointerId,
        button,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true
      })
    )
  })
}

function clickTarget(): void {
  act(() => {
    target().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('useImageSurfaceDragPan', () => {
  it('moves the surface with the pointer while dragging', () => {
    const surface = mountSurface()

    pointer('pointerdown', surface, 200, 150)
    pointer('pointermove', surface, 160, 120)

    // Content follows the pointer, so dragging up-left scrolls down-right by the same amount.
    expect(surface.scrollLeft).toBe(40)
    expect(surface.scrollTop).toBe(30)
  })

  it('captures the pointer for the drag and gives it back on release', () => {
    const surface = mountSurface()

    pointer('pointerdown', surface, 200, 150)
    expect(surface.hasPointerCapture(1)).toBe(true)

    pointer('pointermove', surface, 160, 120)
    pointer('pointerup', surface, 160, 120)
    expect(surface.hasPointerCapture(1)).toBe(false)
  })

  it('reads as grab at rest and grabbing mid-drag', () => {
    const surface = mountSurface()
    expect(surface.style.cursor).toBe('grab')

    pointer('pointerdown', surface, 200, 150)
    expect(surface.style.cursor).toBe('grabbing')

    pointer('pointerup', surface, 200, 150)
    expect(surface.style.cursor).toBe('grab')
  })

  it('ends the gesture and releases capture when the pointer is cancelled', () => {
    const surface = mountSurface()

    pointer('pointerdown', surface, 200, 150)
    pointer('pointercancel', surface, 200, 150)

    expect(surface.hasPointerCapture(1)).toBe(false)
    expect(surface.style.cursor).toBe('grab')
  })

  it('stops at the ends of the scroll range instead of losing the image', () => {
    const surface = mountSurface()

    pointer('pointerdown', surface, 200, 150)
    pointer('pointermove', surface, -5000, -5000)
    // scrollWidth 1000 - clientWidth 400, scrollHeight 800 - clientHeight 300.
    expect(surface.scrollLeft).toBe(600)
    expect(surface.scrollTop).toBe(500)
    pointer('pointerup', surface, -5000, -5000)

    pointer('pointerdown', surface, 200, 150)
    pointer('pointermove', surface, 5000, 5000)
    expect(surface.scrollLeft).toBe(0)
    expect(surface.scrollTop).toBe(0)
  })

  it('keeps an image smaller than the surface centred rather than draggable', () => {
    const surface = mountSurface({
      content: { width: 300, height: 200 },
      viewport: { width: 400, height: 300 }
    })

    pointer('pointerdown', surface, 200, 150)
    pointer('pointermove', surface, 50, 20)
    expect(surface.scrollLeft).toBe(0)
    expect(surface.scrollTop).toBe(0)

    pointer('pointermove', surface, 350, 280)
    expect(surface.scrollLeft).toBe(0)
    expect(surface.scrollTop).toBe(0)
  })

  it('still lets a press that never moved count as a click', () => {
    const surface = mountSurface()

    pointer('pointerdown', target(), 200, 150)
    pointer('pointerup', surface, 200, 150)
    clickTarget()

    expect(onTargetClick).toHaveBeenCalledTimes(1)
  })

  it('does not turn the end of a drag into a click', () => {
    const surface = mountSurface()

    pointer('pointerdown', target(), 200, 150)
    pointer('pointermove', surface, 100, 150)
    pointer('pointerup', surface, 100, 150)
    clickTarget()

    expect(onTargetClick).not.toHaveBeenCalled()
    // The swallow is spent on that one click, not latched over the next real one.
    clickTarget()
    expect(onTargetClick).toHaveBeenCalledTimes(1)
  })

  it('ignores a non-primary button and a second pointer joining a live drag', () => {
    const surface = mountSurface()

    pointer('pointerdown', surface, 200, 150, { button: 2 })
    pointer('pointermove', surface, 100, 150)
    expect(surface.scrollLeft).toBe(0)

    pointer('pointerdown', surface, 200, 150)
    pointer('pointerdown', surface, 900, 900, { pointerId: 2 })
    pointer('pointermove', surface, 160, 150)
    expect(surface.scrollLeft).toBe(40)
  })

  it('wires nothing at all when the surface has not opted in', () => {
    const surface = mountSurface({ enabled: false })

    pointer('pointerdown', surface, 200, 150)
    pointer('pointermove', surface, 100, 100)

    expect(surface.style.cursor).toBe('')
    expect(surface.hasPointerCapture(1)).toBe(false)
    expect(surface.scrollLeft).toBe(0)
  })
})
