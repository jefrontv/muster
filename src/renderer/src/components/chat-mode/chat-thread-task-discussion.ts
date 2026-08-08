// "Discuss in chat": spins up a linked chat thread for an ActiveCollab task —
// lands in the workspace bound to the task's project (standalone otherwise),
// seeds the opening prompt with the task brief, and jumps to Chat view.

import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'

const BODY_EXCERPT_MAX = 600

/** ActiveCollab task bodies are HTML-only; the seed prompt wants plain text. */
export function activeCollabBodyExcerpt(bodyHtml: string, max = BODY_EXCERPT_MAX): string {
  const text = bodyHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function buildTaskDiscussionPrompt(task: ActiveCollabTask): string {
  const excerpt = activeCollabBodyExcerpt(task.bodyHtml)
  return [
    `Let's work on ActiveCollab task AC#${task.id} — "${task.name}" (project: ${task.projectName}).`,
    excerpt ? `Task brief:\n${excerpt}` : null,
    'Read the brief, then tell me how you would approach it before changing anything.'
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n')
}

export async function discussTaskInChat(task: ActiveCollabTask): Promise<void> {
  const store = useAppStore.getState()
  const workspace =
    store.chatWorkspaces.find((w) => w.activeCollabProject?.id === task.projectId) ?? null
  const thread = await store.createChatThread(workspace?.id ?? null, task.name)
  if (!thread) {
    return
  }
  await store.updateChatThread(thread.id, {
    activeCollabTask: { projectId: task.projectId, taskId: task.id }
  })
  store.setChatThreadFirstMessage(thread.id, buildTaskDiscussionPrompt(task))
  store.setActiveChatThread(thread.id)
  store.setActiveView('chat')
}
