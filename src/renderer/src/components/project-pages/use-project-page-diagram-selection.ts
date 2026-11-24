// Tracks the diagram selection and view so the format panel, quick-connect arrows, and grid follow along.
import { InternalEvent, type Cell, type Graph } from '@maxgraph/core'
import { useEffect, useState } from 'react'

export type DiagramBox = { x: number; y: number; width: number; height: number }

export type DiagramSelection = {
  cells: Cell[]
  /** Screen box of a lone selected shape, for the quick-connect arrows. */
  box: DiagramBox | null
  scale: number
  translate: { x: number; y: number }
  canUndo: boolean
  canRedo: boolean
  /** A drag, resize, or pan is under way, so screen boxes are stale until it ends. */
  moving: boolean
}

const EMPTY: DiagramSelection = {
  cells: [],
  box: null,
  scale: 1,
  translate: { x: 0, y: 0 },
  canUndo: false,
  canRedo: false,
  moving: false
}

export function useProjectPageDiagramSelection(
  graph: Graph | null,
  undo: { canUndo: () => boolean; canRedo: () => boolean } | null
): DiagramSelection {
  const [state, setState] = useState<DiagramSelection>(EMPTY)

  useEffect(() => {
    if (!graph) {
      return
    }
    const update = (): void => {
      const cells = graph.getSelectionCells()
      const view = graph.getView()
      const lone = cells.length === 1 && cells[0].isVertex() ? view.getState(cells[0]) : null
      setState((before) => ({
        moving: before.moving,
        cells,
        box: lone ? { x: lone.x, y: lone.y, width: lone.width, height: lone.height } : null,
        scale: view.scale,
        translate: { x: view.translate.x, y: view.translate.y },
        canUndo: undo?.canUndo() ?? false,
        canRedo: undo?.canRedo() ?? false
      }))
    }
    const setMoving = (moving: boolean): void =>
      setState((before) => (before.moving === moving ? before : { ...before, moving }))
    const gesture = {
      mouseDown: () => {},
      mouseMove: () => {
        if (graph.isMouseDown) {
          setMoving(true)
        }
      },
      mouseUp: () => setMoving(false)
    }
    graph.addMouseListener(gesture)
    const selection = graph.getSelectionModel()
    const model = graph.getDataModel()
    const view = graph.getView()
    selection.addListener(InternalEvent.CHANGE, update)
    model.addListener(InternalEvent.CHANGE, update)
    for (const name of [
      InternalEvent.SCALE,
      InternalEvent.TRANSLATE,
      InternalEvent.SCALE_AND_TRANSLATE
    ]) {
      view.addListener(name, update)
    }
    update()
    return () => {
      selection.removeListener(update)
      model.removeListener(update)
      view.removeListener(update)
      graph.removeMouseListener(gesture)
    }
  }, [graph, undo])

  return state
}
