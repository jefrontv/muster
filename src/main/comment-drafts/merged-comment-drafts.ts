// One drafts client over the bots server and the agent store, routed by draft id.
import type {
  BotsCommentDraft,
  BotsCommentDraftResult
} from '../../shared/bots-comment-draft-types'
import type { BotsCommentDraftsClient } from '../bots/bots-comment-drafts-client'
import { AGENT_DRAFT_ID_PREFIX } from './agent-comment-draft-store'

export function createMergedCommentDraftsClient(
  bots: BotsCommentDraftsClient,
  agents: BotsCommentDraftsClient
): BotsCommentDraftsClient {
  const pick = (id: string) => (id.startsWith(AGENT_DRAFT_ID_PREFIX) ? agents : bots)
  return {
    async list(status) {
      const [fromBots, fromAgents] = await Promise.all([bots.list(status), agents.list(status)])
      if (!fromAgents.ok) {
        return fromAgents
      }
      // Bots not running is normal for agent-only users; their drafts just aren't there.
      if (!fromBots.ok) {
        return fromBots.reason === 'unavailable' ? fromAgents : fromBots
      }
      const all: BotsCommentDraft[] = [...fromBots.value, ...fromAgents.value]
      const waiting = all
        .filter((d) => d.status === 'waiting')
        .sort((a, b) => a.queuedAt - b.queuedAt)
      const closed = all
        .filter((d) => d.status !== 'waiting')
        .sort((a, b) => b.updatedAt - a.updatedAt)
      return { ok: true, value: [...waiting, ...closed] } satisfies BotsCommentDraftResult<
        BotsCommentDraft[]
      >
    },
    update: (edit) => pick(edit.id).update(edit),
    setStatus: (id, status) => pick(id).setStatus(id, status),
    undo: (id) => pick(id).undo(id),
    feedback: (id, note) => pick(id).feedback(id, note),
    addAttachments: (id, paths) => pick(id).addAttachments(id, paths),
    removeAttachment: (id, attachmentId) => pick(id).removeAttachment(id, attachmentId),
    attachmentBytes: (id, attachmentId) => pick(id).attachmentBytes(id, attachmentId)
  }
}
