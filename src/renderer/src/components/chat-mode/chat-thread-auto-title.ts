// A thread's first-send title is a raw slice of what the user typed. Once the
// first turn lands there is enough context to name it properly, so one
// generation runs against the user's configured source-control AI agent. A
// manual rename opts the thread out for good; a missing agent is a silent no-op.

import { useAppStore } from '../../store'

/** Threads this app run already tried, so a retry storm can't spawn twice. */
const attempted = new Set<string>()

export function resetChatThreadAutoTitleAttemptsForTests(): void {
  attempted.clear()
}

/** True while nothing but Muster has ever set this thread's title. */
export function chatThreadTitleIsAutomatic(thread: { title: string; autoTitle?: string }): boolean {
  return (
    thread.title === 'New chat' ||
    (thread.autoTitle !== undefined && thread.title === thread.autoTitle)
  )
}

export async function generateChatThreadTitleAfterFirstTurn(threadId: string): Promise<void> {
  if (attempted.has(threadId)) {
    return
  }
  const store = useAppStore.getState()
  if (store.settings?.chatAutoGenerateTitle === false) {
    return
  }
  const thread = store.chatThreads.find((t) => t.id === threadId)
  if (!thread || thread.titleGenerated === true || !chatThreadTitleIsAutomatic(thread)) {
    return
  }
  const session = store.chatThreadSessions[threadId]
  // The hook carries the user's prompt verbatim; the derived title is the
  // fallback when status hooks are off, and is still a slice of that prompt.
  const firstPrompt = (
    (session ? store.agentStatusByPaneKey[session.paneKey]?.prompt : undefined) ||
    thread.autoTitle ||
    ''
  ).trim()
  if (!firstPrompt) {
    return
  }
  attempted.add(threadId)
  const assistantMessage = store.chatThreadStreamingText[threadId]?.text
  // Generate where the thread runs so the agent picks up that project's config;
  // standalone chats have no directory and main falls back to home.
  const cwd =
    thread.workspaceId === null
      ? undefined
      : store.chatWorkspaces.find((w) => w.id === thread.workspaceId)?.directories[0]
  const result = await window.api.chatThreadTitle
    .generate({
      firstPrompt,
      ...(assistantMessage ? { assistantMessage } : {}),
      ...(cwd ? { cwd } : {})
    })
    .catch(() => ({ ok: false as const, error: 'chat title generation failed' }))
  if (!result.ok) {
    return
  }
  // Re-read: the user can rename while the agent is thinking, and their name wins.
  const latest = useAppStore.getState().chatThreads.find((t) => t.id === threadId)
  if (!latest || latest.titleGenerated === true || !chatThreadTitleIsAutomatic(latest)) {
    return
  }
  await useAppStore.getState().updateChatThread(threadId, {
    title: result.title,
    autoTitle: result.title,
    titleGenerated: true
  })
}
