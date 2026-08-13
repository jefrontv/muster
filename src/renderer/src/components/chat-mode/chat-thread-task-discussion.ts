// "Discuss in chat": opens a linked chat thread for an ActiveCollab task — lands in the workspace
// bound to the task's project (standalone otherwise), attaches the task, and jumps to Chat view.
// It deliberately sends nothing; the opening message is the user's to write.

import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'

/**
 * Opens a chat thread for a task with the task attached, and sends nothing.
 *
 * It used to seed the thread's first message, which ChatThreadView fires the instant the stream
 * session is up — so pressing "Discuss in chat" committed the user to a generated prompt and a
 * running agent before they had read anything. The task now arrives the way the composer's own task
 * picker delivers one: as a chip, carrying the AC# reference into whatever the user does send.
 */
export async function discussTaskInChat(task: ActiveCollabTask): Promise<void> {
  const store = useAppStore.getState()
  const workspace =
    store.chatWorkspaces.find(
      (w) =>
        w.activeCollabProject?.id === task.projectId ||
        w.activeCollabProjects?.some((project) => project.id === task.projectId)
    ) ?? null
  const thread = await store.createChatThread(workspace?.id ?? null, task.name)
  if (!thread) {
    return
  }
  await store.updateChatThread(thread.id, {
    activeCollabTask: { projectId: task.projectId, taskId: task.id }
  })
  store.setActiveChatThread(thread.id)
  store.setActiveView('chat')
}
