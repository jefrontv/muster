import { describe, expect, it } from 'vitest'
import type { PagesGraph } from '../../../../shared/project-pages-graph-types'
import {
  createMapSim,
  nodeAt,
  tickMapSim,
  visibleGraph,
  type MapFilters
} from './project-pages-map-model'

const page = (id: string, degree = 1) =>
  ({ id, kind: 'page', label: id, icon: null, parentId: null, degree }) as const
const GRAPH: PagesGraph = {
  nodes: [
    page('a', 2),
    page('b'),
    page('c'),
    page('lone', 0),
    { id: 'tag:x', kind: 'tag', label: 'x', degree: 1 }
  ],
  edges: [
    { source: 'a', target: 'b', kind: 'link' },
    { source: 'b', target: 'c', kind: 'child' },
    { source: 'a', target: 'tag:x', kind: 'tag' }
  ]
}
const ALL: MapFilters = { tags: true, subpages: true, orphans: true, focus: null, depth: 1 }

describe('page map model', () => {
  it('filters tags, subpages, orphans and the area around a node', () => {
    const ids = (filters: Partial<MapFilters>) =>
      visibleGraph(GRAPH, { ...ALL, ...filters }).nodes.map((n) => n.id)
    expect(ids({})).toEqual(['a', 'b', 'c', 'lone', 'tag:x'])
    expect(ids({ tags: false, orphans: false })).toEqual(['a', 'b', 'c'])
    expect(ids({ subpages: false, orphans: false })).toEqual(['a', 'b', 'tag:x'])
    expect(ids({ focus: 'c' })).toEqual(['b', 'c'])
    expect(ids({ focus: 'c', depth: 2 })).toEqual(['a', 'b', 'c'])
  })

  it('settles linked nodes closer than unlinked ones', () => {
    const sim = createMapSim(visibleGraph(GRAPH, ALL))
    tickMapSim(sim, 400)
    const at = (id: string) => sim.nodes[sim.index.get(id)!]
    const dist = (p: string, q: string) => Math.hypot(at(p).x - at(q).x, at(p).y - at(q).y)
    expect(dist('a', 'b')).toBeLessThan(dist('a', 'lone'))
    expect(nodeAt(sim, at('b').x + 1, at('b').y, 2)?.node.id).toBe('b')
  })
})
