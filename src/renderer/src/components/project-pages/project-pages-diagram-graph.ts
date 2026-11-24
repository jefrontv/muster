// Sets up a maxGraph editor the way draw.io behaves: guides, grid, drag-to-connect, undo, wheel pan/zoom.
import {
  getDefaultPlugins,
  Graph,
  InternalEvent,
  RubberBandHandler,
  styleUtils,
  UndoManager,
  VertexHandler,
  type Cell,
  type CellEditorHandler,
  type CellStyle,
  type ConnectionHandler,
  type EventObject,
  type EventSource,
  type PanningHandler,
  type SelectionCellsHandler,
  type SelectionHandler
} from '@maxgraph/core'
import DOMPurify from 'dompurify'
import { applyDiagramTheme } from './project-pages-diagram-styles'

export type DiagramEditor = {
  graph: Graph
  undo: UndoManager
  destroy: () => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 4

/** Zooms so the graph point under (clientX, clientY) stays put. */
export function zoomAt(graph: Graph, factor: number, clientX?: number, clientY?: number): void {
  const view = graph.getView()
  const rect = graph.container.getBoundingClientRect()
  const px = clientX === undefined ? rect.width / 2 : clientX - rect.left
  const py = clientY === undefined ? rect.height / 2 : clientY - rect.top
  const scale = view.scale
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
  const gx = px / scale - view.translate.x
  const gy = py / scale - view.translate.y
  view.scaleAndTranslate(next, px / next - gx, py / next - gy)
}

/** Fits the whole diagram with a margin, never zooming past 100%. */
export function fitDiagram(graph: Graph): void {
  const view = graph.getView()
  const bounds = graph.getGraphBounds()
  const rect = graph.container.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) {
    view.scaleAndTranslate(1, 40, 40)
    return
  }
  const scale = view.scale
  const w = bounds.width / scale
  const h = bounds.height / scale
  const x = bounds.x / scale - view.translate.x
  const y = bounds.y / scale - view.translate.y
  const next = Math.max(MIN_SCALE, Math.min(1, (rect.width - 80) / w, (rect.height - 80) / h))
  view.scaleAndTranslate(next, (rect.width / next - w) / 2 - x, (rect.height / next - h) / 2 - y)
}

/** Starts dragging a connector out of a shape; dropping on empty canvas adds a new shape there. */
export function startConnector(graph: Graph, cell: Cell, clientX: number, clientY: number): void {
  const state = graph.getView().getState(cell)
  if (!state || !graph.container) {
    return
  }
  const connector = graph.getPlugin<ConnectionHandler>('ConnectionHandler')!
  const point = styleUtils.convertPoint(graph.container, clientX, clientY)
  connector.setEnabled(true)
  connector.start(state, point.x, point.y)
  // The press landed on an overlay button, so route the rest of the gesture to the graph.
  graph.isMouseDown = true
}

export function createDiagramEditor(container: HTMLElement, onChange: () => void): DiagramEditor {
  InternalEvent.disableContextMenu(container)
  const graph = new Graph(container, undefined, [...getDefaultPlugins(), RubberBandHandler])
  graph.setHtmlLabels(true)
  graph.setConnectable(true)
  graph.setPanning(true)
  graph.setGridEnabled(true)
  graph.setDropEnabled(true)
  graph.setSplitEnabled(false)
  graph.gridSize = 10
  // Leaving the text editor (e.g. for the format panel) commits it, so formatting shows at once.
  graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.blurEnabled = true
  const selection = graph.getPlugin<SelectionHandler>('SelectionHandler')!
  selection.guidesEnabled = true
  // Drag and resize the shapes themselves, as draw.io does, instead of a dashed outline.
  selection.maxLivePreview = 200
  const cells = graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')!
  const createHandler = cells.createHandler.bind(cells)
  cells.createHandler = (state) => {
    const handler = createHandler(state)
    if (handler instanceof VertexHandler) {
      handler.livePreview = true
    }
    return handler
  }
  const connector = graph.getPlugin<ConnectionHandler>('ConnectionHandler')!
  connector.createTarget = true
  // A press anywhere on a shape moves it; connectors start only from the arrows (startConnector).
  connector.setEnabled(false)
  connector.addListener(InternalEvent.RESET, () => connector.setEnabled(false))
  const panning = graph.getPlugin<PanningHandler>('PanningHandler')!

  // HTML labels render with innerHTML, so every label passes DOMPurify first.
  const getLabel = graph.getLabel.bind(graph)
  graph.getLabel = (cell) => {
    const label = getLabel(cell)
    return typeof label === 'string' && cell && graph.isHtmlLabel(cell)
      ? DOMPurify.sanitize(label)
      : label
  }

  // Edges drawn here say elbow explicitly: draw.io treats an edge with no edgeStyle as straight.
  const createEdge = graph.createEdge.bind(graph)
  graph.createEdge = (parent, id, value, source, target, style) =>
    createEdge(parent, id, value, source, target, {
      edgeStyle: 'orthogonalEdgeStyle',
      rounded: true,
      html: 1,
      ...style
    } as CellStyle)

  applyDiagramTheme(graph)
  const theme = new MutationObserver(() => {
    applyDiagramTheme(graph)
    graph.refresh()
  })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })

  const undo = new UndoManager()
  const record = (_sender: EventSource, evt: EventObject): void =>
    undo.undoableEditHappened(evt.getProperty('edit'))
  graph.getDataModel().addListener(InternalEvent.UNDO, record)
  graph.getView().addListener(InternalEvent.UNDO, record)
  graph.getDataModel().addListener(InternalEvent.CHANGE, () => onChange())

  // A shape grows taller to fit its text when typing ends; it never shrinks on its own.
  graph.addListener(InternalEvent.LABEL_CHANGED, (_sender: EventSource, evt: EventObject) => {
    const cell = evt.getProperty('cell') as Cell
    const geometry = cell.getGeometry()
    if (!cell.isVertex() || !geometry || cell.getChildCount() > 0) {
      return
    }
    const wrap = graph.getCellStyle(cell).whiteSpace === 'wrap'
    const size = graph.getPreferredSizeForCell(cell, wrap ? geometry.width : null)
    if (!size || size.height <= geometry.height) {
      return
    }
    const grown = geometry.clone()
    grown.height = Math.ceil(size.height / graph.gridSize) * graph.gridSize
    graph.getDataModel().setGeometry(cell, grown)
  })

  // Trackpad: two-finger scroll pans, pinch (ctrlKey wheel) zooms at the cursor.
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      zoomAt(graph, Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY)
      return
    }
    const view = graph.getView()
    view.setTranslate(
      view.translate.x - event.deltaX / view.scale,
      view.translate.y - event.deltaY / view.scale
    )
  }
  // Hold space to drag the canvas with the left button.
  const onSpace = (event: KeyboardEvent): void => {
    if (event.code === 'Space' && !graph.isEditing()) {
      panning.useLeftButtonForPanning = event.type === 'keydown'
      container.style.cursor = event.type === 'keydown' ? 'grab' : ''
    }
  }
  container.addEventListener('wheel', onWheel, { passive: false })
  container.addEventListener('keydown', onSpace)
  container.addEventListener('keyup', onSpace)

  return {
    graph,
    undo,
    destroy: () => {
      theme.disconnect()
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('keydown', onSpace)
      container.removeEventListener('keyup', onSpace)
      graph.destroy()
    }
  }
}
