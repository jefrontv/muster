// Paints the page map on a canvas. Colours come from the theme tokens, so it follows light/dark.
import type { MapSim, SimNode } from './project-pages-map-model'

/** Screen = layout * k + (x, y), in CSS pixels. */
export type MapView = { x: number; y: number; k: number }

export type MapPalette = { edge: string; page: string; strong: string; tag: string; font: string }

export function readMapPalette(element: HTMLElement): MapPalette {
  const style = getComputedStyle(element)
  const token = (name: string): string => style.getPropertyValue(name).trim()
  return {
    edge: token('--border'),
    page: token('--muted-foreground'),
    strong: token('--foreground'),
    tag: token('--chart-2') || token('--primary'),
    font: style.fontFamily
  }
}

export type MapPaint = {
  sim: MapSim
  view: MapView
  width: number
  height: number
  palette: MapPalette
  /** Hovered node and its neighbours; everything else is dimmed. */
  lit: Set<string> | null
  /** Nodes matching the filter box, when it has text. */
  match: Set<string> | null
  current: string | null
}

const DIM = 0.14

function shown(id: string, paint: MapPaint): boolean {
  return (!paint.lit || paint.lit.has(id)) && (!paint.match || paint.match.has(id))
}

function wantsLabel(node: SimNode, paint: MapPaint): boolean {
  const { id } = node.node
  return (
    paint.sim.nodes.length <= 60 ||
    paint.view.k >= 1.2 ||
    id === paint.current ||
    Boolean(paint.lit?.has(id)) ||
    Boolean(paint.match?.has(id)) ||
    node.node.degree >= 4
  )
}

export function drawMap(ctx: CanvasRenderingContext2D, paint: MapPaint): void {
  const { sim, view, palette } = paint
  ctx.clearRect(0, 0, paint.width, paint.height)
  ctx.save()
  ctx.translate(view.x, view.y)
  ctx.scale(view.k, view.k)

  ctx.lineWidth = 1 / view.k
  for (const link of sim.links) {
    const a = sim.nodes[link.a]
    const b = sim.nodes[link.b]
    const on = shown(a.node.id, paint) && shown(b.node.id, paint)
    ctx.globalAlpha = (on ? 1 : DIM) * (link.kind === 'link' ? 0.9 : 0.45)
    ctx.strokeStyle = paint.lit && on ? palette.page : palette.edge
    ctx.setLineDash(link.kind === 'child' ? [4 / view.k, 3 / view.k] : [])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  for (const node of sim.nodes) {
    const { id, kind } = node.node
    ctx.globalAlpha = shown(id, paint) ? 1 : DIM
    ctx.fillStyle =
      kind === 'tag'
        ? palette.tag
        : id === paint.current || paint.lit?.has(id)
          ? palette.strong
          : palette.page
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.fill()
    if (id === paint.current) {
      ctx.strokeStyle = palette.strong
      ctx.lineWidth = 1.5 / view.k
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r + 3 / view.k, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.font = `${11 / view.k}px ${palette.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const node of sim.nodes) {
    if (!wantsLabel(node, paint)) {
      continue
    }
    ctx.globalAlpha = shown(node.node.id, paint) ? 1 : DIM
    ctx.fillStyle = node.node.kind === 'tag' ? palette.tag : palette.strong
    const label = node.node.kind === 'tag' ? `#${node.node.label}` : node.node.label
    ctx.fillText(
      label.length > 40 ? `${label.slice(0, 39)}…` : label,
      node.x,
      node.y + node.r + 3 / view.k
    )
  }
  ctx.restore()
}

/** A view that fits every node, with some margin. */
export function fitView(sim: MapSim, width: number, height: number): MapView {
  if (sim.nodes.length === 0) {
    return { x: width / 2, y: height / 2, k: 1 }
  }
  const xs = sim.nodes.map((n) => n.x)
  const ys = sim.nodes.map((n) => n.y)
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys)
  ]
  const k = Math.min(
    2,
    Math.max(0.2, Math.min(width / (maxX - minX + 160), height / (maxY - minY + 160)))
  )
  return { x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k, k }
}
