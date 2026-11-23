import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'

const AGENT_NAMES: [RegExp, string][] = [
  [/claude/i, 'Claude Code'],
  [/codex/i, 'Codex'],
  [/\bomp\b|oh-my-pi/i, 'omp'],
  [/\bpi\b/i, 'pi'],
  [/gemini/i, 'Gemini']
]

/** Who wrote the draft, as the person knows them: a bot's name, or the coding agent's product name. */
export function commentDraftAuthorLabel(draft: BotsCommentDraft): string {
  if (!draft.agentSource) {
    return draft.botName
  }
  const known = AGENT_NAMES.find(([pattern]) => pattern.test(draft.agentSource!.agent))
  return known ? known[1] : draft.agentSource.agent
}

/** Last folder of the agent's working directory, for the row's meta line. */
export function commentDraftAgentFolder(draft: BotsCommentDraft): string | null {
  const cwd = draft.agentSource?.cwd
  if (!cwd) {
    return null
  }
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? null
}
