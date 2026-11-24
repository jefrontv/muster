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
  /** An ActiveCollab task that pages link to; href is the task's URL. */
  | { id: string; kind: 'task'; label: string; href: string; degree: number }

export type PagesGraphEdge = {
  source: string
  target: string
  kind: 'link' | 'tag' | 'child' | 'task'
}

export type PagesGraph = { nodes: PagesGraphNode[]; edges: PagesGraphEdge[] }

export function tagNodeId(key: string): string {
  return `tag:${key}`
}

export function taskNodeId(key: string): string {
  return `task:${key}`
}
