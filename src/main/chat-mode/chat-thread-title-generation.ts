// Semantic titles for chat-mode threads. The first-send title is a truncated
// copy of what the user typed; once the first turn lands there is enough context
// to name the thread properly. Reuses the branch-name generation path (same
// agent, prompt shape and slug post-processing folder workspaces already use for
// their auto-titles) so this adds a caller, not a second generation stack.

import { homedir } from 'node:os'
import { humanizeBranchSlug } from '../../shared/branch-name-from-work'
import type { GlobalSettings } from '../../shared/types'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import {
  generateBranchNameFromContext,
  resolveTextGenerationParams
} from '../text-generation/commit-message-text-generation'
import { resolveGenerationTarget } from '../agent-hooks/first-work-generation-target'

export type ChatThreadTitleDeps = {
  getSettings: () => GlobalSettings
  getAgentEnvResolvers: () => CommitMessageAgentEnvironmentResolvers | undefined
}

export type ChatThreadTitleResult = { ok: true; title: string } | { ok: false; error: string }

/** Longest reply excerpt worth sending; the model only needs the gist. */
const ASSISTANT_EXCERPT_LIMIT = 2_000

export async function generateChatThreadTitle(
  args: { firstPrompt: string; assistantMessage?: string; cwd?: string },
  deps: ChatThreadTitleDeps
): Promise<ChatThreadTitleResult> {
  const firstPrompt = args.firstPrompt.trim()
  if (!firstPrompt) {
    return { ok: false, error: 'No prompt to name the chat from.' }
  }
  const resolved = resolveTextGenerationParams(deps.getSettings(), 'local', 'branchName', null)
  if (!resolved.ok) {
    return { ok: false, error: resolved.error }
  }
  // Standalone chats have no workspace directory; the stream falls back to home
  // for the same reason, and generation only needs a valid cwd to spawn in.
  const target = await resolveGenerationTarget(
    args.cwd ?? homedir(),
    resolved.params.agentId,
    null,
    deps
  )
  if (!target) {
    return { ok: false, error: 'Could not prepare the chat-title generation environment.' }
  }
  const assistantMessage = args.assistantMessage?.slice(0, ASSISTANT_EXCERPT_LIMIT).trim()
  const generated = await generateBranchNameFromContext(
    { firstPrompt, ...(assistantMessage ? { assistantMessage } : {}) },
    resolved.params,
    target
  )
  if (!generated.success) {
    return { ok: false, error: generated.error }
  }
  const title = humanizeBranchSlug(generated.slug).trim()
  if (!title) {
    return { ok: false, error: 'Generated chat title was empty.' }
  }
  return { ok: true, title }
}
