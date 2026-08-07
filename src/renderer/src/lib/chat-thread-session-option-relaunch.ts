// Session-option changes for stream-backed chat threads. A headless child has
// no PTY to type "/model x" into, so an option change stops the stream and
// relaunches it with the new launch flags, resuming the provider session.

import { useAppStore } from '@/store'
import {
  catalogDefaultModel,
  getAgentSessionOptionCatalog,
  type AgentSessionOptionCatalog
} from '../../../shared/agent-session-option-catalog'
import type { SessionOptionValue } from '../../../shared/native-chat-session-options'
import { resolveNativeChatSessionOptionDefaults } from '../../../shared/native-chat-session-option-defaults'
import { parseBuiltSessionOptionCommand } from '@/components/native-chat/native-chat-session-option-command-matching'
import type { NativeChatSessionOptionDispatchResult } from '@/components/native-chat/native-chat-session-option-command-dispatch'
import { launchChatThreadSession } from './chat-thread-session-launch'

/** Map a catalog-built command ("/model x", "/effort high") back to its option. */
export function parseChatThreadSessionOptionCommand(
  catalog: AgentSessionOptionCatalog,
  command: string
): { optionId: string; value: string } | null {
  const modelMidSession = catalog.modelApply.midSession
  if (modelMidSession?.kind === 'command') {
    const value = parseBuiltSessionOptionCommand(modelMidSession.build, command)
    if (value) {
      return { optionId: 'model', value }
    }
  }
  for (const model of catalog.models) {
    for (const option of model.options) {
      const midSession = option.apply.midSession
      if (midSession?.kind !== 'command') {
        continue
      }
      const value = parseBuiltSessionOptionCommand(midSession.build, command)
      if (value) {
        return { optionId: option.id, value }
      }
    }
  }
  return null
}

export async function dispatchChatThreadSessionOption(args: {
  threadId: string
  command: string
}): Promise<NativeChatSessionOptionDispatchResult> {
  const { threadId, command } = args
  const store = useAppStore.getState()
  const thread = store.chatThreads.find((t) => t.id === threadId)
  if (!thread) {
    throw new Error('This chat thread no longer exists.')
  }
  const catalog = getAgentSessionOptionCatalog(thread.agent)
  const parsed = catalog ? parseChatThreadSessionOptionCommand(catalog, command) : null
  if (!catalog || !parsed) {
    // Flip-only toggles (e.g. /fast) have no launch flag to relaunch with.
    throw new Error('This option cannot be changed in chat threads yet.')
  }
  const workspace =
    thread.workspaceId !== null
      ? (store.chatWorkspaces.find((w) => w.id === thread.workspaceId) ?? null)
      : null
  if (thread.workspaceId !== null && !workspace) {
    throw new Error('This chat workspace no longer exists.')
  }

  const current =
    store.chatThreadSessions[threadId]?.appliedSessionOptions ??
    resolveNativeChatSessionOptionDefaults(
      store.settings?.nativeChatSessionOptions,
      thread.agent
    ) ??
    {}
  // Why: a model switch resets model-scoped values (matching the PTY apply path);
  // a non-model change needs a model id for its launch flag to be emitted.
  const next: Record<string, SessionOptionValue> =
    parsed.optionId === 'model'
      ? { model: parsed.value }
      : {
          model:
            typeof current.model === 'string'
              ? current.model
              : (catalogDefaultModel(catalog)?.id ?? ''),
          ...current,
          [parsed.optionId]: parsed.value
        }
  if (typeof next.model !== 'string' || next.model === '') {
    throw new Error('Pick a model before changing this option.')
  }

  const previousSession = store.chatThreadSessions[threadId]
  await window.api.chatThreadStream.stop(threadId)
  // Refetch: an init event may have landed a newer claudeSessionId to resume.
  const latestStore = useAppStore.getState()
  const latestThread = latestStore.chatThreads.find((t) => t.id === threadId) ?? thread
  const result = await launchChatThreadSession({
    thread: latestThread,
    workspace,
    sessionOptions: next
  })
  if (!result) {
    throw new Error('The chat session could not be relaunched with the new option.')
  }
  if (previousSession) {
    latestStore.clearAgentLaunchConfig(previousSession.paneKey)
  }
  latestStore.setChatThreadSession(threadId, {
    ...result,
    appliedSessionOptions: result.appliedSessionOptions ?? next
  })
  return { outcome: 'applied' }
}
