// Places shapes an agent added without coordinates. A diagram or container whose shapes are all new
// gets a flow layout; otherwise each new shape goes in the first free spot beside what it connects to.
import type { Cell, Graph } from '@maxgraph/core'
import { flowLayout } from './project-pages-diagram-layout'

const GAP = 60
const MARGIN = 16

type Box = { x: number; y: number; width: number; height: number }

const boxOf = (cell: Cell): Box => {
  const g = cell.getGeometry()!
  return { x: g.x, y: g.y, width: g.width, height: g.height }
}

const touches = (a: Box, b: Box, margin = MARGIN): boolean =>
  a.x < b.x + b.width + margin &&
  b.x < a.x + a.width + margin &&
  a.y < b.y + b.height + margin &&
  b.y < a.y + a.height + margin

const depth = (cell: Cell): number => {
  let d = 0
  for (let c = cell.getParent(); c; c = c.getParent()) {
    d++
  }
  return d
}

const shapesIn = (parent: Cell): Cell[] => parent.getChildren().filter((c) => c.isVertex())

/** Shapes beside cell (same parent) that an edge joins it to, through nested containers. */
function neighbours(cell: Cell): Cell[] {
  const parent = cell.getParent()
  const lift = (end: Cell | null): Cell | null => {
    let current = end
    while (current && current.getParent() !== parent) {
      current = current.getParent()
    }
    return current
  }
  const ends = [cell, ...cell.getChildren()].flatMap((c) =>
    c.edges.flatMap((edge) => [lift(edge.getTerminal(true)), lift(edge.getTerminal(false))])
  )
  return ends.filter((end): end is Cell => !!end && end !== cell)
}

function freeSpot(
  size: Box,
  anchor: Box | null,
  taken: Box[],
  inContainer: boolean
): [number, number] {
  const fits = (x: number, y: number): boolean =>
    (!inContainer || (x >= 10 && y >= 34)) && !taken.some((box) => touches({ ...size, x, y }, box))
  if (anchor) {
    const cx = anchor.x + anchor.width / 2 - size.width / 2
    const cy = anchor.y + anchor.height / 2 - size.height / 2
    for (let ring = 0; ring < 5; ring++) {
      const below = anchor.y + anchor.height + GAP + ring * (size.height + GAP)
      const right = anchor.x + anchor.width + GAP + ring * (size.width + GAP)
      for (let k = 0; k < 4; k++) {
        const slide = k * (size.width + GAP)
        const drop = k * (size.height + GAP)
        for (const [x, y] of [
          [cx + slide, below],
          [cx - slide, below],
          [right, cy + drop],
          [right, cy - drop]
        ]) {
          if (fits(x, y)) {
            return [x, y]
          }
        }
      }
    }
  }
  const right = Math.max(inContainer ? 20 - GAP : 40 - GAP, ...taken.map((b) => b.x + b.width))
  const top = taken.length ? Math.min(...taken.map((b) => b.y)) : 40
  return [right + GAP, top]
}

function moveTo(graph: Graph, cell: Cell, [x, y]: [number, number]): void {
  const geometry = cell.getGeometry()!.clone()
  geometry.x = graph.snap(x)
  geometry.y = graph.snap(y)
  graph.getDataModel().setGeometry(cell, geometry)
}

/** Grows a container to hold its shapes; never shrinks one the user sized. */
function growToFit(graph: Graph, container: Cell): void {
  const boxes = shapesIn(container).map(boxOf)
  const geometry = container.getGeometry()
  if (!boxes.length || !geometry) {
    return
  }
  const width = Math.max(geometry.width, ...boxes.map((b) => b.x + b.width + 20))
  const height = Math.max(geometry.height, ...boxes.map((b) => b.y + b.height + 20))
  if (width > geometry.width || height > geometry.height) {
    const grown = geometry.clone()
    grown.width = width
    grown.height = height
    graph.getDataModel().setGeometry(container, grown)
  }
}

export function placeNewShapes(graph: Graph, fresh: Cell[]): void {
  const pending = new Set(fresh)
  const root = graph.getDefaultParent()
  const parents = [...new Set(fresh.map((c) => c.getParent()!))].sort((a, b) => depth(b) - depth(a))
  for (const parent of parents) {
    const kids = shapesIn(parent)
    const mine = kids.filter((c) => pending.has(c))
    const inContainer = parent !== root
    if (mine.length > 1 && mine.length === kids.length) {
      flowLayout(graph, parent, 'north')
      if (inContainer) {
        graph.updateGroupBounds([parent], 20, false, 30)
      }
    } else {
      const placed = new Set(kids.filter((c) => !pending.has(c)))
      const queue = [...mine]
      while (queue.length) {
        // Shapes joined to something already placed go first, so chains grow outward from it.
        const at = Math.max(
          0,
          queue.findIndex((c) => neighbours(c).some((n) => placed.has(n)))
        )
        const [cell] = queue.splice(at, 1)
        const anchor = neighbours(cell).find((n) => placed.has(n))
        const taken = [...placed].map(boxOf)
        moveTo(
          graph,
          cell,
          freeSpot(boxOf(cell), anchor ? boxOf(anchor) : null, taken, inContainer)
        )
        placed.add(cell)
      }
      if (inContainer) {
        growToFit(graph, parent)
      }
    }
    mine.forEach((c) => pending.delete(c))
  }
}

/** Pairs of shapes sharing a parent whose boxes overlap, for the agent to fix. */
export function overlappingShapes(graph: Graph): Cell[][] {
  const pairs: Cell[][] = []
  const visit = (parent: Cell): void => {
    const kids = shapesIn(parent)
    kids.forEach((a, i) => {
      for (const b of kids.slice(i + 1)) {
        if (touches(boxOf(a), boxOf(b), -4)) {
          pairs.push([a, b])
        }
      }
      visit(a)
    })
  }
  visit(graph.getDefaultParent())
  return pairs.slice(0, 10)
}
