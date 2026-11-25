// Double-click edits the label under the pointer, or adds a rounded box on empty canvas.
import {
  InternalEvent,
  styleUtils,
  type EventObject,
  type EventSource,
  type Graph
} from '@maxgraph/core'
import { insertShape } from './project-pages-diagram-actions'
import { DIAGRAM_SHAPES } from './project-pages-diagram-styles'

export function installDiagramDoubleClick(graph: Graph): void {
  graph.addListener(InternalEvent.DOUBLE_CLICK, (_sender: EventSource, evt: EventObject) => {
    const event = evt.getProperty('event') as MouseEvent | undefined
    if (evt.getProperty('cell') || !event) {
      return
    }
    // A selected edge's label and segment handles overlap, so the two clicks can land on
    // different handles and report no cell; hit-test instead of adding a box over the edge.
    const at = styleUtils.convertPoint(graph.container, event.clientX, event.clientY)
    const hit = graph.getCellAt(at.x, at.y)
    if (hit) {
      evt.consume()
      if (graph.isCellEditable(hit)) {
        graph.startEditingAtCell(hit, event)
      }
      return
    }
    const point = graph.getPointForEvent(event)
    const shape = DIAGRAM_SHAPES.find((s) => s.id === 'rounded')!
    graph.startEditingAtCell(insertShape(graph, shape, point.x, point.y))
  })
}
