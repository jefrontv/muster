// Diagram keyboard shortcuts, matching draw.io where it has one. Cmd on Mac, Ctrl elsewhere.
import { Cell, Clipboard, Geometry, type Graph } from '@maxgraph/core'
import { fitDiagram, zoomAt, type DiagramEditor } from './project-pages-diagram-graph'

const isMac = navigator.userAgent.includes('Mac')

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

export function duplicateSelection(graph: Graph): void {
  const cells = graph.getSelectionCells()
  if (cells.length) {
    graph.setSelectionCells(graph.moveCells(cells, graph.gridSize * 2, graph.gridSize * 2, true))
  }
}

function groupSelection(graph: Graph): void {
  if (graph.getSelectionCount() < 2) {
    return
  }
  const group = new Cell('', new Geometry(), { baseStyleNames: ['group'] })
  group.setVertex(true)
  group.setConnectable(false)
  graph.setSelectionCell(graph.groupCells(group, 20))
}

export function deleteSelection(graph: Graph): void {
  graph.removeCells(graph.getDeletableCells(graph.getSelectionCells()), true)
}

/** Returns true when the key was a diagram shortcut, so the caller can stop it. */
export function handleDiagramKey({ graph, undo }: DiagramEditor, event: KeyboardEvent): boolean {
  if (graph.isEditing()) {
    return false
  }
  const mod = isMac ? event.metaKey : event.ctrlKey
  const key = event.key.toLowerCase()
  const selected = graph.getSelectionCells()
  if (mod && key === 'z') {
    if (event.shiftKey) {
      undo.redo()
    } else {
      undo.undo()
    }
  } else if (mod && key === 'y') {
    undo.redo()
  } else if (mod && key === 'a') {
    graph.selectAll()
  } else if (mod && key === 'd') {
    duplicateSelection(graph)
  } else if (mod && key === 'c') {
    Clipboard.copy(graph)
  } else if (mod && key === 'x') {
    Clipboard.cut(graph)
  } else if (mod && key === 'g') {
    if (event.shiftKey) {
      graph.ungroupCells()
    } else {
      groupSelection(graph)
    }
  } else if (mod && (key === '=' || key === '+')) {
    zoomAt(graph, 1.2)
  } else if (mod && key === '-') {
    zoomAt(graph, 1 / 1.2)
  } else if (mod && key === '0') {
    zoomAt(graph, 1 / graph.getView().scale)
  } else if (event.shiftKey && event.code === 'Digit1') {
    fitDiagram(graph)
  } else if (mod) {
    return false
  } else if (key === 'delete' || key === 'backspace') {
    deleteSelection(graph)
  } else if (NUDGE[event.key] && selected.length) {
    const step = event.shiftKey ? graph.gridSize : 1
    graph.moveCells(selected, NUDGE[event.key][0] * step, NUDGE[event.key][1] * step)
  } else if ((key === 'enter' || key === 'f2') && selected.length === 1) {
    graph.startEditingAtCell(selected[0])
  } else if (key === 'escape') {
    graph.clearSelection()
  } else {
    return false
  }
  return true
}
