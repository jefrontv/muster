// Delivers a person's note on an agent draft to the terminal running that agent.
import { isAbsolute, relative } from 'node:path'
import type { BotsCommentDraft } from '../../shared/bots-comment-draft-types'
import type { RuntimeTerminalSummary } from '../../shared/runtime-types'

export type AgentFeedbackRuntime = {
  listTerminals: () => Promise<{ terminals: RuntimeTerminalSummary[] }>
  getTerminalAgentStatus: (handle: string) => Promise<{ isRunningAgent: boolean }>
  sendTerminalAgentPrompt: (handle: string, prompt: string) => Promise<unknown>
}

function depthInside(root: string, path: string): number | null {
  const rel = relative(root, path)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null
  }
  return root.length
}

export function agentFeedbackPrompt(draft: BotsCommentDraft, note: string): string {
  return `Feedback on comment draft #${draft.number ?? '?'} (task #${draft.taskId}, id ${draft.id}): ${note}\nRevise it with amend_comment_draft.`
}

/** The writable terminal running an agent whose worktree holds the draft's cwd; deepest worktree wins. */
export async function findAgentTerminal(
  runtime: AgentFeedbackRuntime,
  cwd: string
): Promise<string | null> {
  const { terminals } = await runtime.listTerminals()
  const candidates = terminals
    .filter((t) => t.writable && t.connected && t.worktreePath)
    .map((t) => ({ t, depth: depthInside(t.worktreePath, cwd) }))
    .filter((c): c is { t: RuntimeTerminalSummary; depth: number } => c.depth !== null)
    .sort((a, b) => b.depth - a.depth || (b.t.lastOutputAt ?? 0) - (a.t.lastOutputAt ?? 0))
  for (const { t } of candidates) {
    const status = await runtime.getTerminalAgentStatus(t.handle).catch(() => null)
    if (status?.isRunningAgent) {
      return t.handle
    }
  }
  return null
}

export async function sendAgentDraftFeedback(
  runtime: AgentFeedbackRuntime | null,
  draft: BotsCommentDraft,
  note: string
): Promise<boolean> {
  if (!runtime || !draft.agentSource) {
    return false
  }
  const prompt = agentFeedbackPrompt(draft, note)
  // The terminal that queued the draft, when it is still open and running an agent.
  const own = draft.agentSource.terminalHandle
  if (own) {
    const status = await runtime.getTerminalAgentStatus(own).catch(() => null)
    if (status?.isRunningAgent) {
      const sent = await runtime.sendTerminalAgentPrompt(own, prompt).then(
        () => true,
        () => false
      )
      if (sent) {
        return true
      }
    }
  }
  const handle = await findAgentTerminal(runtime, draft.agentSource.cwd)
  if (!handle) {
    return false
  }
  await runtime.sendTerminalAgentPrompt(handle, prompt)
  return true
}
