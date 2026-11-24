// Map data: which nodes show for the current filters, and a small force layout to place them.
import type {
  PagesGraph,
  PagesGraphEdge,
  PagesGraphNode
} from '../../../../shared/project-pages-graph-types'

export type MapFilters = {
  tags: boolean
  subpages: boolean
  orphans: boolean
  /** Show only what sits within depth links of this node. */
  focus: string | null
  depth: 1 | 2
}

export function visibleGraph(graph: PagesGraph, filters: MapFilters): PagesGraph {
  let edges = graph.edges.filter(
    (edge) => (filters.tags || edge.kind !== 'tag') && (filters.subpages || edge.kind !== 'child')
  )
  let nodes = graph.nodes.filter((node) => filters.tags || node.kind !== 'tag')
  if (filters.focus && nodes.some((node) => node.id === filters.focus)) {
    const keep = new Set([filters.focus])
    let frontier = new Set([filters.focus])
    for (let level = 0; level < filters.depth; level++) {
      const next = new Set<string>()
      for (const edge of edges) {
        for (const [from, to] of [
          [edge.source, edge.target],
          [edge.target, edge.source]
        ]) {
          if (frontier.has(from) && !keep.has(to)) {
            keep.add(to)
            next.add(to)
          }
        }
      }
      frontier = next
    }
    nodes = nodes.filter((node) => keep.has(node.id))
  } else if (!filters.orphans) {
    const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
    nodes = nodes.filter((node) => linked.has(node.id))
  }
  const ids = new Set(nodes.map((node) => node.id))
  edges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  return { nodes, edges }
}

export type SimNode = {
  node: PagesGraphNode
  x: number
  y: number
  vx: number
  vy: number
  r: number
  pinned: boolean
}
type SimLink = {
  a: number
  b: number
  length: number
  strength: number
  kind: PagesGraphEdge['kind']
}
export type MapSim = {
  nodes: SimNode[]
  links: SimLink[]
  index: Map<string, number>
  alpha: number
}

const LINK_SHAPE = { link: [70, 1], tag: [55, 0.6], child: [60, 0.4] } as const

export function nodeRadius(node: PagesGraphNode): number {
  const grow = Math.sqrt(node.degree)
  return node.kind === 'tag' ? Math.min(3.5 + grow * 1.6, 14) : Math.min(4 + grow * 2.2, 18)
}

/** A layout for the graph, keeping positions from the last one so updates do not jump. */
export function createMapSim(
  graph: PagesGraph,
  previous?: ReadonlyMap<string, { x: number; y: number }>
): MapSim {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const links: SimLink[] = graph.edges.flatMap((edge) => {
    const a = index.get(edge.source)
    const b = index.get(edge.target)
    const [length, strength] = LINK_SHAPE[edge.kind]
    return a === undefined || b === undefined ? [] : [{ a, b, length, strength, kind: edge.kind }]
  })
  const nodes = graph.nodes.map((node, i): SimNode => {
    const old = previous?.get(node.id)
    // Golden-angle spiral: even, deterministic starting spots.
    const angle = i * 2.39996
    const dist = 12 * Math.sqrt(i + 1)
    return {
      node,
      x: old?.x ?? Math.cos(angle) * dist,
      y: old?.y ?? Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      r: nodeRadius(node),
      pinned: false
    }
  })
  const fresh = nodes.length - [...(previous?.keys() ?? [])].filter((id) => index.has(id)).length
  return { nodes, links, index, alpha: fresh > 0 ? 1 : 0.3 }
}

export function tickMapSim(sim: MapSim, steps = 1): void {
  const { nodes, links } = sim
  for (let step = 0; step < steps && sim.alpha > 0.004; step++) {
    const alpha = sim.alpha
    // Big maps compare each node with a slice of the others per tick; the slice rotates.
    const stride = nodes.length > 900 ? Math.ceil(nodes.length / 900) : 1
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1 + ((step + i) % stride); j < nodes.length; j += stride) {
        const b = nodes[j]
        const dx = b.x - a.x || 0.01
        const dy = b.y - a.y || 0.01
        const d2 = Math.max(dx * dx + dy * dy, 64)
        if (d2 > 160_000) {
          continue
        }
        const push = (900 * stride * alpha) / d2
        a.vx -= dx * push * 0.05
        a.vy -= dy * push * 0.05
        b.vx += dx * push * 0.05
        b.vy += dy * push * 0.05
      }
    }
    for (const link of links) {
      const a = nodes[link.a]
      const b = nodes[link.b]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const pull = ((d - link.length) / d) * 0.06 * link.strength * alpha
      a.vx += dx * pull
      a.vy += dy * pull
      b.vx -= dx * pull
      b.vy -= dy * pull
    }
    for (const node of nodes) {
      node.vx = (node.vx - node.x * 0.012 * alpha) * 0.6
      node.vy = (node.vy - node.y * 0.012 * alpha) * 0.6
      if (!node.pinned) {
        node.x += node.vx
        node.y += node.vy
      }
    }
    sim.alpha *= 0.985
  }
}

/** The nearest node under a point, in layout units. */
export function nodeAt(sim: MapSim, x: number, y: number, slop: number): SimNode | null {
  let best: SimNode | null = null
  let bestDist = Infinity
  for (const node of sim.nodes) {
    const d = Math.hypot(node.x - x, node.y - y)
    if (d <= node.r + slop && d < bestDist) {
      best = node
      bestDist = d
    }
  }
  return best
}

export function neighboursOf(graph: PagesGraph, id: string): Set<string> {
  const out = new Set([id])
  for (const edge of graph.edges) {
    if (edge.source === id) {
      out.add(edge.target)
    } else if (edge.target === id) {
      out.add(edge.source)
    }
  }
  return out
}
