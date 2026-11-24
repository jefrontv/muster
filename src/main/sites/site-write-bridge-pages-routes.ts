// The pages route on the site write bridge: MCP pages tools reach the GUI's page store here.
import {
  isProjectPagesToolOp,
  type ProjectPagesToolOp
} from '../project-pages/project-pages-tool-ops'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import type { ProjectPagesToolSource } from '../project-pages/project-pages-tool-target'

export const PAGES_BRIDGE_ROUTE = '/pages/tool'

export type PagesBridgeCallbacks = {
  /** Absent = feature off. */
  onProjectPagesTool?: (
    op: ProjectPagesToolOp,
    args: Record<string, unknown>,
    source: ProjectPagesToolSource
  ) => Promise<unknown>
}

type Reply = (status: number, payload: unknown) => void

export async function answerPagesBridgeRoute(
  body: Record<string, unknown>,
  reply: Reply,
  callbacks: PagesBridgeCallbacks
): Promise<void> {
  if (!callbacks.onProjectPagesTool) {
    reply(501, { error: 'this build has no pages' })
    return
  }
  const source = body.source as Partial<ProjectPagesToolSource> | undefined
  if (
    !isProjectPagesToolOp(body.op) ||
    typeof source?.cwd !== 'string' ||
    typeof source.agent !== 'string'
  ) {
    reply(400, { error: 'op, source.cwd and source.agent are required' })
    return
  }
  const args =
    body.args && typeof body.args === 'object' && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {}
  const optionalId = (value: unknown): string | null =>
    typeof value === 'string' && value && value.length <= 400 ? value : null
  try {
    const value = await callbacks.onProjectPagesTool(body.op, args, {
      cwd: source.cwd,
      agent: source.agent.slice(0, 80),
      worktreeId: optionalId(source.worktreeId),
      terminalHandle: optionalId(source.terminalHandle)
    })
    reply(200, { value })
  } catch (error) {
    // The agent reads the message, so refusals and bad arguments are 400s with the store's reason.
    const known = error instanceof ProjectPagesError
    reply(known ? (error.code === 'error' ? 500 : 400) : 500, {
      error: error instanceof Error ? error.message : String(error),
      ...(known && error.revision !== undefined ? { revision: error.revision } : {})
    })
  }
}
