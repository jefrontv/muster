// draw.io compatibility and Pages theme for the maxGraph stylesheet, plus the palette's shapes.
import {
  DoubleEllipseShape,
  EllipseShape,
  PerimeterRegistry,
  ShapeRegistry,
  type AbstractGraph,
  type CellStyle
} from '@maxgraph/core'

export type DiagramShape = {
  id: string
  label: string
  style: CellStyle
  width: number
  height: number
  keywords: string
}

export const DIAGRAM_SHAPES: DiagramShape[] = [
  {
    id: 'rect',
    label: 'Rectangle',
    style: {},
    width: 120,
    height: 60,
    keywords: 'box process step'
  },
  {
    id: 'rounded',
    label: 'Rounded',
    style: { rounded: true },
    width: 120,
    height: 60,
    keywords: 'box process card'
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    style: { baseStyleNames: ['ellipse'] },
    width: 120,
    height: 70,
    keywords: 'oval circle'
  },
  {
    id: 'circle',
    label: 'Circle',
    style: { baseStyleNames: ['ellipse'], aspect: 'fixed' },
    width: 70,
    height: 70,
    keywords: 'round'
  },
  {
    id: 'rhombus',
    label: 'Decision',
    style: { baseStyleNames: ['rhombus'] },
    width: 110,
    height: 80,
    keywords: 'diamond if choice rhombus'
  },
  {
    id: 'triangle',
    label: 'Triangle',
    style: { baseStyleNames: ['triangle'] },
    width: 70,
    height: 80,
    keywords: 'arrow'
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    style: { shape: 'hexagon', perimeter: 'hexagonPerimeter' },
    width: 120,
    height: 70,
    keywords: 'preparation'
  },
  {
    id: 'cylinder',
    label: 'Database',
    style: { shape: 'cylinder' },
    width: 70,
    height: 90,
    keywords: 'cylinder storage db data'
  },
  {
    id: 'cloud',
    label: 'Cloud',
    style: { shape: 'cloud' },
    width: 120,
    height: 80,
    keywords: 'internet service'
  },
  {
    id: 'actor',
    label: 'Person',
    style: { shape: 'actor' },
    width: 40,
    height: 60,
    keywords: 'actor user human role'
  },
  {
    id: 'note',
    label: 'Note',
    style: { fillColor: '#fff2cc', strokeColor: '#d6b656', fontColor: '#1f1f1f' },
    width: 120,
    height: 80,
    keywords: 'sticky comment'
  },
  {
    id: 'text',
    label: 'Text',
    style: { baseStyleNames: ['text'], align: 'center' },
    width: 80,
    height: 30,
    keywords: 'label heading words'
  },
  {
    id: 'container',
    label: 'Container',
    style: { baseStyleNames: ['swimlane'] },
    width: 240,
    height: 160,
    keywords: 'group lane swimlane frame'
  },
  {
    id: 'start',
    label: 'Start',
    style: {
      shape: 'startState',
      perimeter: 'ellipsePerimeter',
      fillColor: '#1f1f1f',
      aspect: 'fixed'
    },
    width: 30,
    height: 30,
    keywords: 'begin uml initial'
  },
  {
    id: 'end',
    label: 'End',
    style: {
      shape: 'endState',
      perimeter: 'ellipsePerimeter',
      fillColor: '#1f1f1f',
      aspect: 'fixed'
    },
    width: 30,
    height: 30,
    keywords: 'finish stop uml final'
  }
]

/** One click sets fill, stroke, and text together so labels stay readable on light fills. */
export const DIAGRAM_COLOR_PRESETS = [
  { id: 'blue', fillColor: '#dae8fc', strokeColor: '#6c8ebf', fontColor: '#1f1f1f' },
  { id: 'green', fillColor: '#d5e8d4', strokeColor: '#82b366', fontColor: '#1f1f1f' },
  { id: 'orange', fillColor: '#ffe6cc', strokeColor: '#d79b00', fontColor: '#1f1f1f' },
  { id: 'yellow', fillColor: '#fff2cc', strokeColor: '#d6b656', fontColor: '#1f1f1f' },
  { id: 'red', fillColor: '#f8cecc', strokeColor: '#b85450', fontColor: '#1f1f1f' },
  { id: 'purple', fillColor: '#e1d5e7', strokeColor: '#9673a6', fontColor: '#1f1f1f' },
  { id: 'gray', fillColor: '#f5f5f5', strokeColor: '#666666', fontColor: '#1f1f1f' },
  { id: 'dark', fillColor: '#333333', strokeColor: '#1f1f1f', fontColor: '#f5f5f5' }
] as const

let registered = false

/** draw.io names maxGraph lacks: UML state shapes and extra perimeters. */
function registerDrawioShapes(): void {
  if (registered) {
    return
  }
  registered = true
  ShapeRegistry.add('startState', EllipseShape)
  ShapeRegistry.add('endState', DoubleEllipseShape)
  const rect = PerimeterRegistry.get('rectanglePerimeter')
  const hexagon = PerimeterRegistry.get('hexagonPerimeter')
  if (hexagon) {
    PerimeterRegistry.add('hexagonPerimeter2', hexagon)
  }
  if (rect) {
    for (const name of [
      'parallelogramPerimeter',
      'trapezoidPerimeter',
      'stepPerimeter',
      'calloutPerimeter'
    ]) {
      PerimeterRegistry.add(name, rect)
    }
  }
}

/** Resolves a CSS colour token to rgb(), since SVG attributes cannot read var(). */
export function tokenColor(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) {
    return fallback
  }
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) {
    return fallback
  }
  ctx.fillStyle = fallback
  ctx.fillStyle = raw
  return ctx.fillStyle
}

/** Named draw.io styles plus theme defaults; unstyled cells follow light or dark mode.
 * Shape and edge defaults match draw.io's, so imported files look the same as there. */
export function applyDiagramTheme(graph: AbstractGraph): void {
  registerDrawioShapes()
  const fg = tokenColor('--foreground', '#1f1f1f')
  const muted = tokenColor('--muted-foreground', '#737373')
  const surface = tokenColor('--card', '#ffffff')
  const background = tokenColor('--background', '#ffffff')
  const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const sheet = graph.getStylesheet()
  Object.assign(sheet.getDefaultVertexStyle(), {
    fillColor: surface,
    strokeColor: muted,
    fontColor: fg,
    fontFamily,
    fontSize: 12
  } satisfies CellStyle)
  Object.assign(sheet.getDefaultEdgeStyle(), {
    strokeColor: muted,
    fontColor: fg,
    fontFamily,
    fontSize: 11,
    endArrow: 'classic',
    labelBackgroundColor: background
  } satisfies CellStyle)
  const text: CellStyle = {
    fillColor: 'none',
    strokeColor: 'none',
    align: 'left',
    verticalAlign: 'top'
  }
  const named: Record<string, CellStyle> = {
    text,
    edgeLabel: {
      ...text,
      labelBackgroundColor: background,
      fontSize: 11,
      align: 'center',
      verticalAlign: 'middle'
    },
    label: {
      fontStyle: 1,
      align: 'left',
      verticalAlign: 'middle',
      spacing: 2,
      spacingLeft: 52,
      rounded: true
    },
    swimlane: { shape: 'swimlane', fontStyle: 1, startSize: 26, verticalAlign: 'top' },
    group: { verticalAlign: 'top', fillColor: 'none', strokeColor: 'none' },
    ellipse: { shape: 'ellipse', perimeter: 'ellipsePerimeter' },
    doubleEllipse: { shape: 'doubleEllipse', perimeter: 'ellipsePerimeter' },
    rhombus: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
    triangle: { shape: 'triangle', perimeter: 'trianglePerimeter' },
    line: { shape: 'line', strokeWidth: 4, verticalAlign: 'top', spacingTop: 8 },
    image: { shape: 'image', verticalAlign: 'top', verticalLabelPosition: 'bottom' }
  }
  for (const [name, style] of Object.entries(named)) {
    sheet.putCellStyle(name, style)
  }
}
