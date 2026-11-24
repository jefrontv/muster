// Labels with no colour of their own follow the app theme, which leaves white text on the pastel
// fills common in draw.io files opened in dark mode. Such labels flip to a colour that reads.
import type { Cell, CellStyle, Graph } from '@maxgraph/core'

const DARK_TEXT = '#1f1f1f'
const LIGHT_TEXT = '#f5f5f5'

/** Relative luminance (0 to 1) of a #rgb or #rrggbb colour; null for anything else. */
export function luminance(color: string): number | null {
  const hex = color.trim().replace(/^#/, '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return null
  }
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The text colour to draw on a fill, or the current one when it already reads. */
export function readableLabelColor(fill: string, font: string): string {
  const back = luminance(fill)
  const front = luminance(font)
  if (back === null || front === null) {
    return font
  }
  const contrast = (Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05)
  if (contrast >= 3) {
    return font
  }
  return back > 0.18 ? DARK_TEXT : LIGHT_TEXT
}

export function keepLabelsReadable(graph: Graph): void {
  const base = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell: Cell): CellStyle => {
    const style = base(cell)
    const fill = style.fillColor
    // A faint fill shows the canvas through it, so the theme colour already reads.
    const faint = Number(style.fillOpacity ?? 100) < 50 || Number(style.opacity ?? 100) < 50
    if (
      !faint &&
      cell.isVertex() &&
      fill &&
      fill !== 'none' &&
      style.fontColor &&
      !cell.getStyle().fontColor
    ) {
      style.fontColor = readableLabelColor(fill, style.fontColor)
    }
    return style
  }
}
