// Named colour themes applied to the selection, or to every shape and line when nothing is selected.
import type { Cell, CellStateStyle, Graph } from '@maxgraph/core'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

type Colours = Partial<Record<keyof CellStateStyle, string | number | undefined>>
export type DiagramTheme = { id: string; label: string; vertex: Colours; edge: Colours }

const CLEAR = {
  fillColor: undefined,
  strokeColor: undefined,
  fontColor: undefined,
  strokeWidth: undefined
}

export const diagramThemes = createLocalizedCatalog((): DiagramTheme[] => [
  {
    id: 'muster',
    label: translate(
      'auto.components.projectPages.diagram.theme.muster',
      'Muster (follows light and dark)'
    ),
    vertex: CLEAR,
    edge: {
      strokeColor: undefined,
      fontColor: undefined,
      labelBackgroundColor: undefined,
      strokeWidth: undefined
    }
  },
  {
    id: 'blueprint',
    label: translate('auto.components.projectPages.diagram.theme.blueprint', 'Blueprint'),
    vertex: {
      fillColor: '#0f2a47',
      strokeColor: '#7fb8ff',
      fontColor: '#e6f1ff',
      strokeWidth: undefined
    },
    edge: {
      strokeColor: '#7fb8ff',
      fontColor: '#e6f1ff',
      labelBackgroundColor: '#0b1f36',
      strokeWidth: undefined
    }
  },
  {
    id: 'mono',
    label: translate('auto.components.projectPages.diagram.theme.mono', 'Monochrome'),
    vertex: {
      fillColor: '#ffffff',
      strokeColor: '#1f1f1f',
      fontColor: '#1f1f1f',
      strokeWidth: undefined
    },
    edge: {
      strokeColor: '#1f1f1f',
      fontColor: '#1f1f1f',
      labelBackgroundColor: '#ffffff',
      strokeWidth: undefined
    }
  },
  {
    id: 'contrast',
    label: translate('auto.components.projectPages.diagram.theme.contrast', 'High contrast'),
    vertex: { fillColor: '#000000', strokeColor: '#ffffff', fontColor: '#ffffff', strokeWidth: 2 },
    edge: {
      strokeColor: '#ffd400',
      fontColor: '#ffffff',
      labelBackgroundColor: '#000000',
      strokeWidth: 2
    }
  }
])

const named = (cell: Cell): string[] => cell.getStyle().baseStyleNames ?? []
const isText = (cell: Cell): boolean => named(cell).some((n) => n === 'text' || n === 'edgeLabel')
const isState = (cell: Cell): boolean =>
  ['startState', 'endState'].includes(String(cell.getStyle().shape))
const isFrame = (cell: Cell): boolean => named(cell).includes('group')

function descendants(cell: Cell): Cell[] {
  return cell.getChildren().flatMap((child) => [child, ...descendants(child)])
}

function setAll(graph: Graph, cells: Cell[], colours: Colours): void {
  if (!cells.length) {
    return
  }
  for (const [key, value] of Object.entries(colours)) {
    graph.setCellStyles(key as keyof CellStateStyle, value as never, cells)
  }
}

export function applyColourTheme(graph: Graph, theme: DiagramTheme): void {
  const picked = graph.getSelectionCells()
  const cells = picked.length ? picked : descendants(graph.getDefaultParent())
  const vertices = cells.filter((c) => c.isVertex() && !isText(c) && !isState(c) && !isFrame(c))
  const text = cells.filter((c) => c.isVertex() && isText(c))
  const states = cells.filter((c) => c.isVertex() && isState(c))
  graph.batchUpdate(() => {
    setAll(graph, vertices, theme.vertex)
    setAll(
      graph,
      cells.filter((c) => c.isEdge()),
      theme.edge
    )
    setAll(graph, text, {
      fontColor: theme.vertex.fontColor,
      labelBackgroundColor: theme.edge.labelBackgroundColor
    })
    setAll(graph, states, { fillColor: theme.vertex.strokeColor ?? theme.vertex.fontColor })
  })
}
