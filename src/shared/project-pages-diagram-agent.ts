// Agent diagram edits: the request the main process sends to the renderer's hidden diagram editor.

export const DIAGRAM_AGENT_LAYOUTS = ['down', 'right', 'tree', 'organic', 'circle'] as const
export type DiagramAgentLayout = (typeof DIAGRAM_AGENT_LAYOUTS)[number]

/** Shapes and connectors are addressed by id or by their exact label. */
export type DiagramAgentShape = {
  label?: string
  shape?: string
  /** Optional id of the agent's choosing, so later rows in the same call can refer to it. */
  id?: string
  /** Container to put the shape in. */
  in?: string
  x?: number
  y?: number
  width?: number
  height?: number
  color?: string
  link?: string
}

export type DiagramAgentConnect = {
  from: string
  to: string
  label?: string
  dashed?: boolean
  arrow?: 'end' | 'both' | 'none'
  id?: string
}

export type DiagramAgentUpdate = {
  target: string
  label?: string
  shape?: string
  color?: string
  /** null removes the link. */
  link?: string | null
  dashed?: boolean
  arrow?: 'end' | 'both' | 'none'
}

export type DiagramAgentMove = {
  target: string
  x?: number
  y?: number
  dx?: number
  dy?: number
  width?: number
  height?: number
  /** Container to move into; "root" takes it out of its container. */
  in?: string
}

export type DiagramAgentEdit = {
  add?: DiagramAgentShape[]
  connect?: DiagramAgentConnect[]
  update?: DiagramAgentUpdate[]
  move?: DiagramAgentMove[]
  remove?: string[]
  layout?: DiagramAgentLayout | { kind: DiagramAgentLayout; container?: string }
  mermaid?: string
}

export type DiagramWorkRequest =
  | { kind: 'shapes' }
  | { kind: 'read'; xml: string; detail: boolean }
  | { kind: 'edit'; xml: string; edit: DiagramAgentEdit }
  | { kind: 'render'; xml: string; scale: number }

export type DiagramWorkMessage = DiagramWorkRequest & { id: string }

export type DiagramEditResult = {
  xml: string
  outline: string
  /** Ids of what this call added, keyed by the id or label the agent gave. */
  created: Record<string, string>
  shapes: number
  connections: number
  overlaps: string[][]
}

export type DiagramRenderResult = { png: string; width: number; height: number; empty: boolean }

export type DiagramWorkResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }
