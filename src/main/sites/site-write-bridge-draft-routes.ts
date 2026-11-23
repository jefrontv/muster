// The comment draft route on the site write bridge: MCP draft tools reach the GUI's store here.
import type { AgentCommentDraftSource } from '../../shared/bots-comment-draft-types'
import {
  isCommentDraftToolOp,
  type CommentDraftToolOp
} from '../comment-drafts/comment-draft-tool-ops'

export const DRAFT_BRIDGE_ROUTE = '/drafts/tool'

export type DraftBridgeCallbacks = {
  /** Absent = feature off. */
  onCommentDraftTool?: (
    op: CommentDraftToolOp,
    args: Record<string, unknown>,
    source: AgentCommentDraftSource
  ) => Promise<unknown>
}

type Reply = (status: number, payload: unknown) => void

export async function answerDraftBridgeRoute(
  body: Record<string, unknown>,
  reply: Reply,
  callbacks: DraftBridgeCallbacks
): Promise<void> {
  if (!callbacks.onCommentDraftTool) {
    reply(501, { error: 'this build cannot queue comment drafts' })
    return
  }
  const source = body.source as Partial<AgentCommentDraftSource> | undefined
  if (
    !isCommentDraftToolOp(body.op) ||
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
  try {
    const optionalId = (value: unknown): string | null =>
      typeof value === 'string' && value && value.length <= 400 ? value : null
    const value = await callbacks.onCommentDraftTool(body.op, args, {
      cwd: source.cwd,
      agent: source.agent.slice(0, 80),
      worktreeId: optionalId(source.worktreeId),
      terminalHandle: optionalId(source.terminalHandle)
    })
    reply(200, { value })
  } catch (error) {
    reply(error instanceof TypeError ? 400 : 500, {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
