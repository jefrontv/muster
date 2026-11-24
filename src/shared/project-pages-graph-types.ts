// The link map of a project's pages: pages and tags as nodes, links between them as edges.

export type PagesGraphNode =
  | {
      id: string
      kind: 'page'
      label: string
      icon: string | null
      parentId: string | null
      /** Links in and out, for node size. */
      degree: number
    }
  | { id: string; kind: 'tag'; label: string; degree: number }

export type PagesGraphEdge = {
  source: string
  target: string
  kind: 'link' | 'tag' | 'child'
}

export type PagesGraph = { nodes: PagesGraphNode[]; edges: PagesGraphEdge[] }

export function tagNodeId(key: string): string {
  return `tag:${key}`
}
