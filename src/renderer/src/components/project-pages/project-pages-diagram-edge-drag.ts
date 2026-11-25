// A click on a selected edge's label lands on its segment handle; a press that barely moves must
// not reroute the edge, or every double-click to edit the label saves new waypoints.
import type { EdgeHandler, EventSource, InternalMouseEvent } from '@maxgraph/core'

type EdgeDragHandler = Pick<EdgeHandler, 'index' | 'startX' | 'startY' | 'mouseMove' | 'mouseUp'>

/** Edge handles stay put until the pointer travels past the tolerance; after that they drag as usual. */
export function holdEdgeHandlesUntilDrag(handler: EdgeDragHandler, tolerance: () => number): void {
  let dragging = false
  const pastTolerance = (me: InternalMouseEvent): boolean =>
    Math.max(Math.abs(me.getX() - handler.startX), Math.abs(me.getY() - handler.startY)) >=
    tolerance()
  const mouseMove = handler.mouseMove.bind(handler)
  handler.mouseMove = (sender: EventSource, me: InternalMouseEvent) => {
    if (handler.index !== null && !dragging) {
      if (!pastTolerance(me)) {
        me.consume()
        return
      }
      dragging = true
    }
    mouseMove(sender, me)
  }
  const mouseUp = handler.mouseUp.bind(handler)
  handler.mouseUp = (sender: EventSource, me: InternalMouseEvent) => {
    if (handler.index !== null && !dragging) {
      // EdgeHandler skips the change when the pointer ends where it started.
      handler.startX = me.getX()
      handler.startY = me.getY()
    }
    dragging = false
    mouseUp(sender, me)
  }
}
